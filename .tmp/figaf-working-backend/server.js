
const express = require('express');
const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { retrieveJwt, decodeJwt } = require('@sap-cloud-sdk/connectivity');

const app = express();
const port = process.env.PORT || 3000;
const destinationName = process.env.FIGAF_DESTINATION_NAME || 'figaf-api';
const authRequired = String(process.env.AUTH_REQUIRED || 'true').toLowerCase() !== 'false';
const openaiApiKey = process.env.OPENAI_API_KEY || '';
const openaiModel = process.env.OPENAI_MODEL || 'gpt-5.4';
const CODELISTS = {
  "communicationPartnerShortName": [
    "opentext_be"
  ],
  "coreProcess": [
    "sales",
    "procurement",
    "logistics",
    "global"
  ],
  "direction": [
    "inb",
    "out"
  ],
  "businessObject": [
    "invoice",
    "application_adv",
    "func_ack",
    "despatch_adv",
    "order_resp",
    "order",
    "scheduling_agree",
    "selfbilling"
  ],
  "typeSystem": [
    "asc_x12",
    "custom",
    "gs1_eancom",
    "gs1_xml",
    "un_edifact",
    "vda_edifact"
  ]
};

app.use(express.json({ limit: '1mb' }));

function getJwtOrNull(req) {
  try { return retrieveJwt(req); } catch {
    const auth = req.headers.authorization || '';
    return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : null;
  }
}
function requireAuth(req, res, next) {
  if (!authRequired) return next();
  const jwt = getJwtOrNull(req);
  if (!jwt) return res.status(401).json({ ok: false, message: 'Please login in order to access this resource' });
  next();
}
function safeArray(v) { return Array.isArray(v) ? v : []; }

async function callFigaf(req, method, url, data) {
  const jwt = getJwtOrNull(req);
  if (authRequired && !jwt) {
    const err = new Error('Missing bearer token');
    err.statusCode = 401;
    throw err;
  }
  return executeHttpRequest(
    { destinationName, jwt },
    { method, url, data, headers: { Accept: 'application/json', 'Content-Type': 'application/json' } }
  );
}

function normalizeAgents(response) {
  const arr = safeArray(response?.data?.data || response?.data);
  return arr.map(item => ({
    id: item.id || null,               // GUID for downstream API calls
    guid: item.id || null,
    systemId: item.systemId || item.name || item.id,
    name: item.systemId || item.name || item.id,
    relatedObjects: item.numberOfRelatedObjects ?? item.relatedObjects ?? null,
    raw: item
  })).filter(x => x.id);
}
function parsePossiblyJson(value) {
  if (typeof value !== 'string') return value;
  let s = value.trim();
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  const attempts = [s];
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) attempts.push(s.slice(firstBrace, lastBrace + 1));
  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === 'string') {
        try { return JSON.parse(parsed); } catch { return parsed; }
      }
      return parsed;
    } catch {}
  }
  return value;
}
function normalizeBusinessEntities(response) {
  const root = parsePossiblyJson(response?.data) || {};
  const arr = safeArray(root?.data?.businessEntities || root?.businessEntities || root?.data || root);
  return arr
    .map(item => ({
      id: item.trackedObjectId || item.id || null,
      name: item.name || item.displayedName || item.title || item.shortName || item.id,
      title: item.name || item.title || item.displayedName || item.shortName || item.id,
      displayName: item.name || item.displayedName || item.title || item.shortName || item.id,
      shortName: item.shortName || null,
      type: item.trackedObjectType || item.type || item.objectType || item.registryType || null,
      typeTitle: item.trackedObjectTypeTitle || null,
      registryType: item.registryType || null,
      raw: item
    }))
    .filter(x => x.id && ['CLOUD_COMPANY_PROFILE', 'CLOUD_SUBSIDIARY'].includes(x.type));
}
function extractListCandidates(input) {
  const out = [];
  const stack = [input];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== 'object') continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      if (cur.length && cur.every(v => typeof v === 'object')) out.push(cur);
      for (const v of cur) stack.push(v);
      continue;
    }
    for (const v of Object.values(cur)) stack.push(v);
  }
  return out;
}
function nameOf(obj, fallback='') {
  return obj?.name || obj?.title || obj?.displayedName || obj?.entityTitle || obj?.shortName || obj?.id || fallback;
}
function idOf(obj, fallback='') {
  return obj?.id || obj?.value || obj?.key || obj?.code || fallback;
}
function dedupeById(items) {
  const map = new Map();
  for (const item of items) {
    if (!item || !item.id) continue;
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
}
function normalizePartnerFormOptions(response) {
  const candidates = extractListCandidates(response?.data);
  const bucket = (predicate) => dedupeById(
    candidates.flatMap(arr => arr.filter(predicate).map(obj => ({ id: idOf(obj), name: nameOf(obj), raw: obj })))
  );

  const systemTypes = bucket(obj => {
    const s = JSON.stringify(obj).toLowerCase();
    return s.includes('systemtype') || s.includes('"technical":"systemtype"') || s.includes('"kind":"systemtype"');
  });
  const typeSystems = bucket(obj => {
    const s = JSON.stringify(obj).toLowerCase();
    return s.includes('typesystem') || s.includes('edifact') || s.includes('eancom') || s.includes('x12') || s.includes('vda');
  });
  const senderAdapters = bucket(obj => {
    const s = JSON.stringify(obj).toLowerCase();
    return s.includes('senderadapter') || s.includes('sender adapter');
  });
  const receiverAdapters = bucket(obj => {
    const s = JSON.stringify(obj).toLowerCase();
    return s.includes('receiveradapter') || s.includes('receiver adapter');
  });
  const existingPartnerProfiles = bucket(obj => {
    const s = JSON.stringify(obj).toLowerCase();
    return s.includes('partner profile') || s.includes('partnerprofile') || s.includes('cloud_trading_partner') || s.includes('cloud_communication_partner');
  });

  return {
    systemTypes,
    typeSystems,
    senderAdapters,
    receiverAdapters,
    existingPartnerProfiles
  };
}
function normalizeTypeSystemVersions(response) {
  const arr = safeArray(response?.data?.data || response?.data);
  return arr.map(obj => ({ id: idOf(obj), name: nameOf(obj), raw: obj })).filter(x => x.id);
}
function normalizeAgreementTemplates(response) {
  const arr = safeArray(response?.data?.data || response?.data?.items || response?.data);
  const mapped = arr.flatMap(obj => {
    const s = JSON.stringify(obj).toUpperCase();
    if (s.includes('CLOUD_AGREEMENT_TEMPLATE') || s.includes('AGREEMENT TEMPLATE')) {
      return [{ id: idOf(obj), name: nameOf(obj), raw: obj }];
    }
    return [];
  });
  return dedupeById(mapped);
}
function helperFallback(message, context) {
  const fields = context?.fields || {};
  const sels = context?.selections || {};
  const checks = [];
  if (!sels.agentId) checks.push('Select an Agent.');
  if (!sels.companyOrSubsidiaryId) checks.push('Select a Company or Subsidiary.');
  if (!fields.partnerName) checks.push('Enter Partner name (long name).');
  if (!fields.countryCode) checks.push('Select Country / Region.');
  if (!fields.profileName) checks.push('Profile name (short name) should be generated.');
  if (fields.profileName && !/^[a-z0-9]+_[a-z]{2}$/.test(fields.profileName)) checks.push('Profile name should look like asd_de.');
  return {
    reply: `This helper explains how to proceed, what input is expected, and checks the current form. ${checks.length ? 'Open items: ' + checks.join(' ') : 'Current selections look consistent.'} Your question was: ${message}`,
    validations: checks,
    recommendation: checks.length ? 'Resolve the listed items before creating the partner.' : 'You can proceed to the next required inputs.'
  };
}
async function helperWithOpenAI(message, context) {
  const client = new OpenAI({ apiKey: openaiApiKey });
  const input = [
    'You are an onboarding helper for a TPM partner onboarding form.',
    'Help users understand how to proceed, what kind of input is expected, and perform validation and sanity checks on the current selections.',
    `User question: ${message}`,
    `Context: ${JSON.stringify(context)}`,
    'Return JSON with keys: reply, validations, recommendation.'
  ].join('\n');
  const response = await client.responses.create({ model: openaiModel, input });
  const text = response.output_text || '{}';
  try { return JSON.parse(text); } catch { return { reply: text, validations: [], recommendation: '' }; }
}

app.get('/', (_req, res) => res.json({ ok: true, service: 'figaf-tpm-guide-backend', message: 'Matched backend is running' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'figaf-tpm-guide-backend', destinationName, authRequired, version: '2.0.0' }));
app.get('/api/me', requireAuth, (req, res) => {
  const jwt = getJwtOrNull(req);
  let decoded = null;
  try { decoded = jwt ? decodeJwt(jwt) : null; } catch {}
  res.json({ ok: true, authenticated: !!jwt, user: decoded ? {
    user_name: decoded.user_name, email: decoded.email, given_name: decoded.given_name, family_name: decoded.family_name,
    name: decoded.given_name && decoded.family_name ? `${decoded.given_name} ${decoded.family_name}` : (decoded.user_name || decoded.email),
    scope: decoded.scope || []
  } : null });
});
app.get('/api/debug/destination', requireAuth, async (req, res) => {
  try {
    const response = await callFigaf(req, 'POST', '/api/agent/search', { includeDecentralAdapterEngines: true });
    res.json({ ok: true, destinationName, note: 'Destination resolved successfully', status: response.status || 200 });
  } catch (e) {
    res.status(e.statusCode || e.response?.status || 500).json({ ok: false, destinationName, message: 'Destination lookup or request failed', error: e.message, details: e.response?.data || null });
  }
});
app.get('/api/reference/codelists', requireAuth, (_req, res) => {
  res.json({ ok: true, items: CODELISTS });
});
app.get('/api/figaf/agents', requireAuth, async (req, res) => {
  try {
    const response = await callFigaf(req, 'POST', '/api/agent/search', { includeDecentralAdapterEngines: true });
    res.json({ ok: true, source: 'figaf-destination', items: normalizeAgents(response) });
  } catch (e) {
    res.status(e.statusCode || e.response?.status || 500).json({ ok: false, source: 'figaf-destination', message: 'Failed to load agents from Figaf', error: e.message, status: e.statusCode || e.response?.status || 500, destinationName, details: e.response?.data || null });
  }
});
async function searchAgents(req) {
  const response = await callFigaf(req, 'POST', '/api/agent/search', { includeDecentralAdapterEngines: true });
  return normalizeAgents(response);
}
async function resolveAgentGuid(req, agentRef) {
  if (!agentRef) return null;
  const ref = String(agentRef).trim();
  if (!ref) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return ref;
  const agents = await searchAgents(req);
  const lower = ref.toLowerCase();
  const match = agents.find(a => String(a.systemId || a.name || '').toLowerCase() === lower || String(a.guid || '').toLowerCase() === lower);
  return match?.guid || null;
}
async function resolveAgentSystemId(req, agentRef) {
  if (!agentRef) return null;
  const ref = String(agentRef).trim();
  if (!ref) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref)) return ref;
  const agents = await searchAgents(req);
  const match = agents.find(a => String(a.guid || '').toLowerCase() === ref.toLowerCase() || String(a.id || '').toLowerCase() === ref.toLowerCase());
  return match?.systemId || match?.name || null;
}

app.get('/api/figaf/companies', requireAuth, async (req, res) => {
  const agentId = req.query.agentId || req.query.agent;
  if (!agentId) return res.status(400).json({ ok: false, message: 'agentId query parameter is required' });
  try {
    const agentGuid = await resolveAgentGuid(req, agentId);
    if (!agentGuid) {
      return res.status(400).json({ ok: false, source: 'figaf-destination', message: 'Failed to resolve agent guid', agentId });
    }
    const response = await callFigaf(req, 'GET', `/api/business-entities/agent/${encodeURIComponent(agentGuid)}/company-and-subsidiaries`);
    const rawBody = response?.data;
    const parsed = parsePossiblyJson(rawBody);
    const items = normalizeBusinessEntities({ data: parsed });
    const root = (parsed && typeof parsed === 'object') ? parsed : {};
    const businessEntities = safeArray(root?.data?.businessEntities || root?.businessEntities);
    const rawSnippet = typeof rawBody === 'string' ? rawBody.slice(0, 500) : JSON.stringify(rawBody || null).slice(0, 500);
    const contentType = response?.headers?.['content-type'] || response?.headers?.['Content-Type'] || null;
    res.json({ ok: true, source: 'figaf-destination', agentGuid, items, debug: items.length ? undefined : { responseType: typeof rawBody, contentType, topLevelKeys: Object.keys(root || {}), hasData: !!root?.data, businessEntitiesCount: businessEntities.length, rawSnippet } });
  } catch (e) {
    res.status(e.statusCode || e.response?.status || 500).json({ ok: false, source: 'figaf-destination', message: 'Failed to load company and subsidiaries from Figaf', error: e.message, status: e.statusCode || e.response?.status || 500, destinationName, details: e.response?.data || null });
  }
});
app.get('/api/figaf/partner-form-options', requireAuth, async (req, res) => {
  const agentId = req.query.agentId || req.query.agent;
  if (!agentId) return res.status(400).json({ ok: false, message: 'agentId query parameter is required' });
  try {
    const agentSystemId = await resolveAgentSystemId(req, agentId);
    // This is a best-effort route because Figaf's create-partner bootstrap endpoint varies.
    // We derive useful options from partner profiles and codelists so the frontend stays functional.
    let existingPartnerProfiles = [];
    try {
      const profilesResponse = await callFigaf(req, 'GET', `/api/business-entities/agent/${encodeURIComponent(agentSystemId || agentId)}/partner-profiles`);
      const arr = safeArray(profilesResponse?.data?.data || profilesResponse?.data);
      existingPartnerProfiles = dedupeById(arr.map(obj => ({ id: idOf(obj), name: nameOf(obj), raw: obj })).filter(x => x.id));
    } catch {}
    res.json({
      ok: true,
      source: 'derived',
      data: {
        systemTypes: [],
        typeSystems: CODELISTS.typeSystem.map(v => ({ id: v, name: v })),
        senderAdapters: [],
        receiverAdapters: [],
        existingPartnerProfiles
      }
    });
  } catch (e) {
    res.status(e.statusCode || e.response?.status || 500).json({ ok: false, source: 'figaf-destination', message: 'Failed to load partner form options from Figaf', error: e.message, status: e.statusCode || e.response?.status || 500, destinationName, details: e.response?.data || null });
  }
});
app.get('/api/figaf/type-system-versions', requireAuth, async (req, res) => {
  const agentId = req.query.agentId;
  const typeSystemId = req.query.typeSystemId;
  if (!agentId || !typeSystemId) return res.json({ ok: true, source: 'derived', items: [] });
  try {
    const response = await callFigaf(req, 'GET', `/api/business-entities/agent/${encodeURIComponent(agentId)}/type-system-versions/${encodeURIComponent(typeSystemId)}`);
    res.json({ ok: true, source: 'figaf-destination', items: normalizeTypeSystemVersions(response) });
  } catch {
    res.json({ ok: true, source: 'derived', items: [] });
  }
});
app.get('/api/figaf/agreement-templates', requireAuth, async (req, res) => {
  const entityId = req.query.entityId || req.query.trackedObjectId || req.query.companyOrSubsidiaryId;
  if (!entityId) return res.status(400).json({ ok: false, message: 'entityId query parameter is required' });
  try {
    // Best-effort where-used style lookup. If the backend response shape differs, return an empty list rather than breaking the form.
    const response = await callFigaf(req, 'POST', '/api/integration-object/filter', {
      trackedObjectId: entityId,
      objectType: 'CLOUD_AGREEMENT_TEMPLATE'
    });
    res.json({ ok: true, source: 'figaf-destination', items: normalizeAgreementTemplates(response) });
  } catch {
    res.json({ ok: true, source: 'derived', items: [] });
  }
});
app.post('/api/ai/chat', requireAuth, async (req, res) => {
  const { message, context } = req.body || {};
  if (!message) return res.status(400).json({ ok: false, message: 'message is required' });
  try {
    const helper = openaiApiKey ? await helperWithOpenAI(message, context) : helperFallback(message, context);
    res.json({ ok: true, ...helper });
  } catch {
    const helper = helperFallback(message, context);
    res.json({ ok: true, ...helper, note: 'Fallback helper response used because OpenAI call failed.' });
  }
});
const proposalsPath = path.join(__dirname, 'ai-proposals.json');
function readProposals() { try { return JSON.parse(fs.readFileSync(proposalsPath, 'utf8')); } catch { return []; } }
function writeProposals(items) { fs.writeFileSync(proposalsPath, JSON.stringify(items, null, 2)); }
if (!fs.existsSync(proposalsPath)) fs.writeFileSync(proposalsPath, '[]');
function uid(prefix='proposal'){ return `${prefix}_${Math.random().toString(36).slice(2,10)}`; }
app.get('/api/ai/proposals', requireAuth, (_req, res) => res.json({ ok: true, items: readProposals() }));
app.post('/api/ai/proposals', requireAuth, (req, res) => {
  const proposal = req.body?.proposal;
  if (!proposal) return res.status(400).json({ ok: false, message: 'proposal is required' });
  const items = readProposals();
  const item = { id: uid(), createdAt: new Date().toISOString(), status: 'saved', proposal, sourceMessage: req.body?.sourceMessage || '' };
  items.unshift(item); writeProposals(items); res.status(201).json({ ok: true, item });
});
app.post('/api/ai/proposals/:id/apply', requireAuth, (req, res) => {
  const items = readProposals();
  const item = items.find(x => x.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, message: 'Proposal not found' });
  item.status = 'applied'; item.appliedAt = new Date().toISOString(); writeProposals(items); res.json({ ok: true, item });
});

app.listen(port, () => console.log(`figaf-tpm-guide-backend listening on ${port}`));
