'use strict';

const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

const DEFAULT_BASE_URL = 'https://emil2-figaf.cfapps.us10-001.hana.ondemand.com';
const DEFAULT_DESTINATION_NAME = 'figaf-api';
const DEFAULT_AGENT_SYSTEM_ID = 'Dev-Figaf-EJE';
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini';
const AGENTS_ENDPOINT = '/api/agent/search';
const AGENTS_SEARCH_BODY = { includeDecentralAdapterEngines: true };
const SCENARIOS_ENDPOINT = '/api/integration-object/filter';

// In-memory token cache for username/password login (key: "baseUrl|username")
const _loginTokenCache = {};

module.exports = class FigafService extends cds.ApplicationService {
  async init() {
    this.on('status', (req) => this._status(req));
    this.on('connectionGuide', (req) => this._connectionGuide(req));
    this.on('agents', (req) => this._respond(req, () => this._agents(req)));
    this.on('modelViews', (req) => this._modelViews(req));
    this.on('partners', (req) => this._respond(req, () => this._readConfiguredModel('partners', req)));
    this.on('companySubsidiaries', (req) => this._respond(req, () => this._readConfiguredModel('companySubsidiaries', req)));
    this.on('scenarios', (req) => this._respond(req, () => this._readScenarios(req)));
    this.on('aiConsistencyAnalysis', (req) => this._respond(req, () => this._aiConsistencyAnalysis(req)));
    this.on('aiAdviceChat', (req) => this._respond(req, () => this._aiAdviceChat(req)));

    return super.init();
  }

  async _respond(req, handler) {
    try {
      return await handler();
    } catch (error) {
      return req.reject(502, error.message);
    }
  }

  _config() {
    const baseUrl = (process.env.FIGAF_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
    const destinationName = process.env.FIGAF_DESTINATION_NAME || DEFAULT_DESTINATION_NAME;

    return {
      baseUrl,
      destinationName,
      useDestination: process.env.FIGAF_USE_DESTINATION !== 'false',
      agentId: process.env.FIGAF_AGENT_ID,
      agentSystemId: process.env.FIGAF_AGENT_SYSTEM_ID || DEFAULT_AGENT_SYSTEM_ID,
      username: process.env.FIGAF_USERNAME,
      password: process.env.FIGAF_PASSWORD,
      clientId: process.env.FIGAF_CLIENT_ID,
      clientSecret: process.env.FIGAF_CLIENT_SECRET,
      internalBaseUrl: process.env.FIGAF_INTERNAL_BASE_URL,
      scope: process.env.FIGAF_API_SCOPE || 'openid',
      sessionCookie: process.env.FIGAF_SESSION_COOKIE,
      partnersPath: process.env.FIGAF_PARTNERS_PATH,
      partnersMethod: process.env.FIGAF_PARTNERS_METHOD || 'GET',
      partnersBody: process.env.FIGAF_PARTNERS_BODY,
      companySubsidiariesPath: process.env.FIGAF_COMPANY_SUBSIDIARIES_PATH,
      companySubsidiariesMethod: process.env.FIGAF_COMPANY_SUBSIDIARIES_METHOD || 'GET',
      companySubsidiariesBody: process.env.FIGAF_COMPANY_SUBSIDIARIES_BODY
    };
  }

  async _status(req) {
    const config = this._config();
    const userToken = this._userToken(req);
    const userTokenDiagnostics = this._userTokenDiagnostics(userToken);
    const destination = await this._getDestination(config, userToken).catch((error) => ({
      error: error.message
    }));
    const destinationTokenDiagnostics = this._authHeaderDiagnostics(destination?.authHeader);
    const hasDestinationToken = Boolean(destination?.authHeader);
    const hasDirectCredentials = Boolean(config.clientId && config.clientSecret);
    const hasUsernameCredentials = Boolean(config.username && config.password);
    const configured = hasDestinationToken || hasDirectCredentials || Boolean(config.sessionCookie) || hasUsernameCredentials;
    const connectionMode = hasDestinationToken
      ? 'destination'
      : config.sessionCookie
        ? 'session-cookie'
        : hasUsernameCredentials
          ? 'login'
          : 'direct';
    const message = configured
      ? 'Figaf connection settings are present, but data reads still validate the credentials against Figaf.'
      : 'Create a figaf-api destination that can access the Figaf WebUI APIs, set FIGAF_USERNAME + FIGAF_PASSWORD, or set a temporary FIGAF_SESSION_COOKIE.';

    return {
      configured,
      connectionMode,
      destinationName: config.destinationName,
      baseUrl: destination?.baseUrl || config.baseUrl,
      hasClientId: Boolean(config.clientId),
      hasClientSecret: Boolean(config.clientSecret),
      hasUsername: Boolean(config.username),
      hasDestination: Boolean(destination),
      hasSessionCookie: Boolean(config.sessionCookie),
      destinationAuthentication: destination?.authentication || '',
      destinationError: destination?.error || '',
      hasUserToken: Boolean(userToken),
      userTokenScopeCount: userTokenDiagnostics.scopeCount,
      hasUaaUserScope: userTokenDiagnostics.hasUaaUserScope,
      hasFigafScopesInUserToken: userTokenDiagnostics.hasFigafScopes,
      figafScopesInUserToken: userTokenDiagnostics.figafScopes,
      destinationTokenScopeCount: destinationTokenDiagnostics.scopeCount,
      hasFigafScopesInDestinationToken: destinationTokenDiagnostics.hasFigafScopes,
      figafScopesInDestinationToken: destinationTokenDiagnostics.figafScopes,
      agentSystemId: config.agentSystemId,
      agentId: config.agentId || '',
      scenarioEndpoint: SCENARIOS_ENDPOINT,
      message
    };
  }

  async _connectionGuide(req) {
    const status = await this._status(req);

    return [
      {
        title: 'Figaf tenant URL',
        description: `Target Figaf tenant: ${status.baseUrl}`,
        done: Boolean(status.baseUrl)
      },
      {
        title: 'BTP destination',
        description: `Preferred destination name: ${status.destinationName}. It must be able to call the Figaf WebUI /api endpoints.`,
        done: status.hasDestination
      },
      {
        title: 'Figaf WebUI authentication',
        description: status.destinationAuthentication === 'OAuth2UserTokenExchange'
          ? 'The figaf-api destination uses OAuth2UserTokenExchange, so the app must pass the logged-in user token to the Destination service.'
          : 'The HAR shows these calls use browser cookies, not Authorization headers. A destination with user/token propagation is preferred for BTP.',
        done: status.configured && !status.destinationError
      },
      {
        title: 'Agent selection',
        description: `The connector will use agent system id ${status.agentSystemId}${status.agentId ? `, agent id ${status.agentId}` : ''}.`,
        done: true
      },
      {
        title: 'WebUI model endpoints',
        description: 'Partners, company/subsidiaries, and scenarios are read from the same /api endpoints captured in the HAR.',
        done: true
      }
    ];
  }

  async _aiConsistencyAnalysis(req) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;

    if (!apiKey) {
      return {
        configured: false,
        model,
        message: 'AI consistency analysis is not configured. Set OPENAI_API_KEY on my-btp-app-srv to enable the AI-assisted layer.',
        findings: []
      };
    }

    const input = this._parseAiPayload(req.data?.payload);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: [
                  'You are a Figaf IS TPM consistency analyst.',
                  'Use deterministic rule findings as the foundation and add only high-signal consistency gaps.',
                  'Do not repeat existing rule findings.',
                  'Validate naming, direction, sender/receiver, partner/country, MIG/MAG, Agreement, Agreement Template, status, and relationship consistency.',
                  'Return strict JSON only with shape {"findings":[{"severity":"High|Medium|Low","rule":"...","field":"...","detail":"..."}]}.',
                  'If there are no additional AI findings, return {"findings":[]}.'
                ].join(' ')
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  namingGuideline: this._namingGuidelineSummary(),
                  record: input
                })
              }
            ]
          }
        ]
      })
    });

    const text = await response.text();
    if (!response.ok) {
      const quotaMessage = this._openAiQuotaMessage(response.status, text);
      if (quotaMessage) {
        return {
          configured: false,
          model,
          message: quotaMessage,
          findings: []
        };
      }
      throw new Error(`OpenAI consistency analysis failed with HTTP ${response.status}: ${this._openAiErrorMessage(text)}`);
    }

    const parsed = JSON.parse(text);
    const outputText = this._responseOutputText(parsed);
    const analysis = this._parseAiJson(outputText);

    return {
      configured: true,
      model,
      message: analysis.findings.length
        ? `AI consistency analysis added ${analysis.findings.length} finding(s).`
        : 'AI consistency analysis did not add any findings beyond the rule layer.',
      findings: analysis.findings
    };
  }

  async _aiAdviceChat(req) {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
    const input = this._parseAiPayload(req.data?.payload);

    if (!apiKey) {
      return {
        configured: false,
        model,
        answer: [
          'AI advice chat is not configured yet.',
          'Set OPENAI_API_KEY on my-btp-app-srv, then redeploy or restage the application.',
          'The deterministic GAP report rules are still available without this key.'
        ].join(' ')
      };
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_output_tokens: 800,
        input: [
          {
            role: 'system',
            content: [
              {
                type: 'input_text',
                text: [
                  'You are a practical Figaf IS TPM advisor.',
                  'The user payload includes allGapReports with pre-aggregated statistics: topRules (most frequent GAP rules with occurrence counts) and topInconsistentRecords (records with the most findings). Use this to answer statistics or prioritisation questions.',
                  'Help users understand inconsistencies and suggest concrete remediation steps.',
                  'Use the deterministic rules and naming guideline as the foundation.',
                  'When referencing findings, cite the rule name, its count, and severity from topRules.',
                  'When context is incomplete, say what data is missing and give a safe next step.',
                  'Keep answers concise, actionable, and specific to Figaf B2B partners, companies/subsidiaries, scenarios, MIGs, MAGs, agreements, and statuses.'
                ].join(' ')
              }
            ]
          },
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: JSON.stringify({
                  namingGuideline: this._namingGuidelineSummary(),
                  chat: input
                })
              }
            ]
          }
        ]
      })
    });

    const text = await response.text();
    if (!response.ok) {
      const quotaMessage = this._openAiQuotaMessage(response.status, text);
      if (quotaMessage) {
        return {
          configured: false,
          model,
          answer: quotaMessage
        };
      }
      throw new Error(`OpenAI advice chat failed with HTTP ${response.status}: ${this._openAiErrorMessage(text)}`);
    }

    const parsed = JSON.parse(text);
    const answer = this._responseOutputText(parsed);

    return {
      configured: true,
      model,
      answer: answer || 'I could not generate advice for this question.'
    };
  }

  _parseAiPayload(payload) {
    if (!payload) {
      return {};
    }

    try {
      return JSON.parse(payload);
    } catch {
      return { rawPayload: String(payload).slice(0, 20000) };
    }
  }

  _openAiQuotaMessage(status, text) {
    if (status !== 429) {
      return '';
    }

    const message = this._openAiErrorMessage(text);
    if (/insufficient_quota|quota|billing/i.test(message)) {
      return [
        'The AI layer is temporarily unavailable because the OpenAI project has exceeded its current quota.',
        'The deterministic Figaf rule checks and GAP report remain available.',
        'Update the OpenAI project billing/quota or configure a different OPENAI_API_KEY, then retry the AI analysis.'
      ].join(' ');
    }

    return [
      'The AI layer is temporarily rate limited by OpenAI.',
      'The deterministic Figaf rule checks and GAP report remain available.',
      'Wait a moment and retry the AI analysis.'
    ].join(' ');
  }

  _openAiErrorMessage(text) {
    try {
      const payload = JSON.parse(text);
      return payload?.error?.message || String(text || '').slice(0, 300);
    } catch {
      return String(text || '').slice(0, 300);
    }
  }

  _namingGuidelineSummary() {
    return {
      partnerShortName: 'lowercase first word(s) from partner name joined with underscores, followed by _<country/region ISO code>, e.g. aldi_ch',
      identifierAlias: '[Type System] [Scheme name] [Scheme code] : [partner long name] [partner country/region full text]',
      systemNameAlias: '[Type] [Deployment Type] [Application] [Purpose]',
      communicationName: '[Adapter] [Direction] [incremental counter per adapter type + direction]',
      communicationAlias: '[comm purpose description] [Adapter] [Direction]',
      mig: '[Type System] : [Message Type] : [Type System Version] : [Envelope] : [level code] : [level title]',
      mag: '[Source MIG] to [Target MIG], using SAP Integration Advisor proposal without redundant Mapping prefix',
      agreementTemplate: 'b2b.<company/subsidiary short name>.<core process>.<direction>.<business object>.<typeSystem>',
      agreement: '[Agreement Template].[partner_short_name]',
      b2bScenario: 'optional MAG: prefix followed by MAG name',
      hardStatusRule: 'Any status field with value Draft is inconsistent'
    };
  }

  _responseOutputText(response) {
    if (typeof response.output_text === 'string') {
      return response.output_text;
    }

    return (response.output || [])
      .flatMap((item) => item.content || [])
      .map((content) => content.text || '')
      .join('\n')
      .trim();
  }

  _parseAiJson(text) {
    const normalizedText = String(text || '')
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const json = JSON.parse(normalizedText);
      return {
        findings: this._normalizeAiFindings(json.findings)
      };
    } catch {
      return {
        findings: [{
          severity: 'Low',
          rule: 'AI analysis parsing',
          field: 'AI response',
          detail: `The AI response was not valid JSON: ${String(text || '').slice(0, 500)}`
        }]
      };
    }
  }

  _normalizeAiFindings(findings) {
    if (!Array.isArray(findings)) {
      return [];
    }

    return findings.slice(0, 20).map((finding) => ({
      severity: ['High', 'Medium', 'Low'].includes(finding?.severity) ? finding.severity : 'Low',
      rule: String(finding?.rule || 'AI consistency analysis').slice(0, 120),
      field: String(finding?.field || 'Record').slice(0, 160),
      detail: String(finding?.detail || '').slice(0, 800)
    })).filter((finding) => finding.detail);
  }

  async _modelViews(req) {
    const config = this._config();
    const views = [
      {
        modelKey: 'partners',
        title: 'Partners',
        description: 'Trading partner and communication partner consistency source.',
        endpoint: config.partnersPath || '/api/business-entities/agent/{agentId}/partner-profiles',
        configured: true,
        count: 0,
        status: 'pending',
        message: config.partnersPath
          ? 'Configured through FIGAF_PARTNERS_PATH.'
          : 'Uses the Figaf WebUI partner-profiles endpoint from the HAR.'
      },
      {
        modelKey: 'companySubsidiaries',
        title: 'Company/subsidiaries',
        description: 'Company profile and subsidiary consistency source.',
        endpoint: config.companySubsidiariesPath || '/api/business-entities/agent/{agentId}/company-and-subsidiaries',
        configured: true,
        count: 0,
        status: 'pending',
        message: config.companySubsidiariesPath
          ? 'Configured through FIGAF_COMPANY_SUBSIDIARIES_PATH.'
          : 'Uses the Figaf WebUI company-and-subsidiaries endpoint from the HAR.'
      },
      {
        modelKey: 'scenarios',
        title: 'Scenarios',
        description: 'B2B scenarios read via Figaf WebUI integration-object filter.',
        endpoint: SCENARIOS_ENDPOINT,
        configured: true,
        count: 0,
        status: 'pending',
        message: 'Uses OBJECT_TYPE B2B.'
      }
    ];

    try {
      const agents = await this._agents(req);
      const agent = this._resolveAgentFromList(agents, req);
      for (const view of views) {
        view.status = 'ready';
        view.message = `Ready for agent ${agent.systemId || agent.name || agent.id}. Use the model buttons to read data.`;
      }
    } catch (error) {
      for (const view of views) {
        view.status = 'error';
        view.message = error.message;
      }
    }

    return views;
  }

  async _agents(req) {
    const response = await this._figafRequest(AGENTS_ENDPOINT, {
      method: 'POST',
      body: AGENTS_SEARCH_BODY
    }, req);

    return this._normalizeAgents(response).map((agent) => ({
      id: agent.id,
      guid: agent.guid,
      systemId: agent.systemId,
      name: agent.name
    }));
  }

  async _readScenarios(req) {
    const agentId = await this._agentId(req);
    const response = await this._figafRequest(SCENARIOS_ENDPOINT, {
      method: 'POST',
      body: {
        deleted: false,
        countOfObjectsOnPage: 200,
        countOfPages: 1,
        currentPage: 1,
        existNextPage: false,
        existPrevPage: false,
        currentPageText: '',
        OBJECT_TYPE: 'B2B',
        agentId,
        excludeVirtualAgents: null,
        excludeNotSecuredAgents: null,
        excludedObjectTypes: [],
        platform: null,
        countOfSkippedObjects: 0,
        sortEntities: []
      }
    }, req);

    const root = this._parsePossiblyJson(response);
    const scenarios = root?.data?.integrationObjects || root?.integrationObjects || root?.data || root || [];
    const totalCount = root?.data?.totalCountOfIntegrationObjects ?? (Array.isArray(scenarios) ? scenarios.length : 0);
    const value = this._normalizeRecords('Scenarios', Array.isArray(scenarios) ? scenarios : []);
    return { value, truncated: totalCount > 200, totalCount };
  }

  async _readConfiguredModel(model, req) {
    const config = this._config();
    const isPartners = model === 'partners';
    const agentId = await this._agentId(req);
    const path = isPartners
      ? config.partnersPath || `/api/business-entities/agent/${agentId}/partner-profiles`
      : config.companySubsidiariesPath || `/api/business-entities/agent/${agentId}/company-and-subsidiaries`;
    const method = isPartners ? config.partnersMethod : config.companySubsidiariesMethod;
    const body = isPartners ? config.partnersBody : config.companySubsidiariesBody;

    const response = await this._figafRequest(path, {
      method,
      body: body ? JSON.parse(body) : undefined
    }, req);

    const root = this._parsePossiblyJson(response);
    const records = root?.data?.businessEntities || root?.businessEntities || root?.items || root?.content || root?.data || [];
    const value = this._normalizeRecords(isPartners ? 'Partners' : 'Company/subsidiaries', Array.isArray(records) ? records : []);
    return { value, truncated: false, totalCount: value.length };
  }

  async _agentId(req) {
    const config = this._config();
    const requestedAgentId = req?.data?.agentId || config.agentId;
    if (requestedAgentId && this._isGuid(requestedAgentId)) {
      return requestedAgentId;
    }

    const agents = await this._agents(req);
    const agent = this._resolveAgentFromList(agents, req);

    if (!agent?.id) {
      const found = agents.map((candidate) => candidate.systemId || candidate.name || candidate.id).filter(Boolean).slice(0, 5);
      throw new Error(`No Figaf agent found for system id ${config.agentSystemId}.${found.length ? ` Found: ${found.join(', ')}.` : ''} Set FIGAF_AGENT_ID if needed.`);
    }

    return agent.id;
  }

  _resolveAgentFromList(agents, req) {
    const config = this._config();
    const requestedAgentId = req?.data?.agentId || config.agentId;
    const wanted = String(requestedAgentId || config.agentSystemId || '').toLowerCase();
    const agent = agents.find((candidate) => {
      const values = [candidate.systemId, candidate.name, candidate.id, candidate.guid]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase());
      return values.includes(wanted);
    }) || agents[0];

    return agent;
  }

  _isGuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ''));
  }

  async _figafRequest(path, options = {}, req) {
    const config = this._config();
    const method = options.method || 'GET';

    if (config.useDestination && config.destinationName && this._destinationCredentials()) {
      return this._figafDestinationAuthHeaderRequest(config, path, options, req);
    }

    const connection = await this._resolveConnection(config, req);
    const headers = {
      Accept: 'application/json'
    };
    if (connection.authHeader) {
      headers.Authorization = connection.authHeader;
    }
    if (connection.cookie) {
      headers.Cookie = connection.cookie;
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }

    const request = { method, headers };

    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${connection.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, request);
    const text = await response.text();

    // On 401 with username/password login: clear token cache and retry once with a fresh login
    if (response.status === 401 && config.username && config.password) {
      delete _loginTokenCache[`${config.baseUrl}|${config.username}`];
      const freshToken = await this._figafLogin(config);
      headers.Authorization = `Bearer ${freshToken}`;
      const retryResponse = await fetch(`${config.baseUrl}${path.startsWith('/') ? path : `/${path}`}`, request);
      const retryText = await retryResponse.text();
      if (!retryResponse.ok) {
        throw new Error(`Figaf API ${method} ${path} failed with HTTP ${retryResponse.status}: ${retryText.slice(0, 300)}`);
      }
      return retryText ? this._parsePossiblyJson(retryText) : null;
    }

    if (!response.ok) {
      throw new Error(`Figaf API ${method} ${path} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    return text ? this._parsePossiblyJson(text) : null;
  }

  async _figafDestinationRequest(config, path, options, req) {
    const method = options.method || 'GET';
    const jwt = this._userToken(req);
    if (!jwt) {
      throw new Error(`Destination ${config.destinationName} requires a logged-in user token, but none reached the backend.`);
    }

    try {
      const response = await executeHttpRequest(
        {
          destinationName: config.destinationName,
          jwt
        },
        {
          method,
          url: path.startsWith('/') ? path : `/${path}`,
          data: options.body,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          }
        }
      );

      return this._parsePossiblyJson(response.data);
    } catch (error) {
      const status = error.statusCode || error.response?.status || 502;
      const details = error.response?.data
        ? ` ${JSON.stringify(error.response.data).slice(0, 300)}`
        : '';
      throw new Error(`Figaf destination request ${method} ${path} failed with HTTP ${status}: ${error.message}.${details}`);
    }
  }

  async _figafDestinationAuthHeaderRequest(config, path, options, req) {
    const method = options.method || 'GET';
    const destination = await this._getDestination(config, this._userToken(req));
    if (!destination?.authHeader) {
      throw new Error(`Destination ${config.destinationName} did not provide an exchanged Figaf token for ${method} ${path}.`);
    }

    const request = {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: destination.authHeader,
        'X-Requested-With': 'XMLHttpRequest'
      }
    };

    if (options.body !== undefined) {
      request.headers['Content-Type'] = 'application/json';
      request.body = JSON.stringify(options.body);
    }

    const baseUrls = this._figafBaseUrlCandidates(destination.baseUrl, config);
    const failedResponses = [];

    for (const baseUrl of baseUrls) {
      const response = await fetch(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`, request);
      const text = await response.text();

      if (response.ok) {
        return text ? this._parsePossiblyJson(text) : null;
      }

      failedResponses.push({
        baseUrl,
        status: response.status,
        text
      });

      if (response.status !== 401) {
        throw new Error(`Figaf destination request ${method} ${path} to ${this._safeHost(baseUrl)} failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
      }
    }

    try {
      return await this._figafDestinationRequest(config, path, options, req);
    } catch (sdkError) {
      const directDetails = failedResponses
        .map((failure) => `${this._safeHost(failure.baseUrl)}: ${failure.text.slice(0, 120) || `HTTP ${failure.status}`}`)
        .join('; ');
      throw new Error(`Figaf destination request ${method} ${path} failed with HTTP 401 using an exchanged token that contains Figaf scopes. Direct responses: ${directDetails || 'Unauthorized'}. Cloud SDK response: ${sdkError.message}`);
    }
  }

  _figafBaseUrlCandidates(destinationBaseUrl, config) {
    const candidates = [
      config.internalBaseUrl,
      this._deriveInternalFigafBaseUrl(destinationBaseUrl),
      destinationBaseUrl
    ]
      .filter(Boolean)
      .map((url) => String(url).replace(/\/+$/, ''));

    return [...new Set(candidates)];
  }

  _deriveInternalFigafBaseUrl(baseUrl) {
    try {
      const url = new URL(baseUrl);
      const [firstLabel, ...rest] = url.hostname.split('.');
      if (!firstLabel || firstLabel.endsWith('-internal') || rest.length === 0) {
        return '';
      }

      url.hostname = [`${firstLabel}-internal`, ...rest].join('.');
      return url.toString().replace(/\/+$/, '');
    } catch {
      return '';
    }
  }

  _safeHost(baseUrl) {
    try {
      return new URL(baseUrl).host;
    } catch {
      return 'configured Figaf host';
    }
  }

  async _resolveConnection(config, req) {
    const destination = await this._getDestination(config, this._userToken(req)).catch((error) => {
      throw error;
    });
    if (destination?.authHeader) {
      return destination;
    }
    if (destination?.authentication === 'NoAuthentication') {
      throw new Error(`Destination ${config.destinationName} is configured with NoAuthentication. Update it to OAuth2UserTokenExchange or delete the old NoAuthentication destination so the backend can receive a Figaf token.`);
    }

    if (config.sessionCookie) {
      return {
        baseUrl: config.baseUrl,
        cookie: config.sessionCookie
      };
    }

    if (config.username && config.password) {
      const token = await this._figafLogin(config);
      return {
        baseUrl: config.baseUrl,
        authHeader: `Bearer ${token}`
      };
    }

    return {
      baseUrl: config.baseUrl,
      authHeader: `Bearer ${await this._getToken(config)}`
    };
  }

  async _figafLogin(config) {
    const cacheKey = `${config.baseUrl}|${config.username}`;
    const cached = _loginTokenCache[cacheKey];

    // Reuse cached token if less than 50 minutes old (tokens typically last 1 hour)
    if (cached && (Date.now() - cached.loginAt) < 50 * 60 * 1000) {
      return cached.token;
    }

    const response = await fetch(`${config.baseUrl}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body: new URLSearchParams({ email: config.username, password: config.password })
    });

    if (!response.ok) {
      throw new Error(`Figaf login to ${this._safeHost(config.baseUrl)} failed with HTTP ${response.status}. Check FIGAF_USERNAME and FIGAF_PASSWORD.`);
    }

    const authHeader = response.headers.get('authorization') || '';
    const token = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : authHeader;

    if (!token) {
      throw new Error('Figaf login succeeded but no Bearer token was returned in the authorization header.');
    }

    _loginTokenCache[cacheKey] = { token, loginAt: Date.now() };
    return token;
  }

  async _getDestination(config, userToken) {
    if (!config.useDestination || !config.destinationName) {
      return null;
    }

    const credentials = this._destinationCredentials();
    if (!credentials) {
      return null;
    }

    const destinationServiceUrl = (credentials.uri || credentials.url || '').replace(/\/+$/, '');
    const tokenUrl = `${(credentials.url || credentials.uri).replace(/\/+$/, '')}/oauth/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.clientid}:${credentials.clientsecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: new URLSearchParams({ grant_type: 'client_credentials' })
    });
    const tokenPayload = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenPayload.access_token) {
      throw new Error('Could not obtain a token for the BTP Destination service.');
    }

    const destinationHeaders = {
      Authorization: `Bearer ${tokenPayload.access_token}`,
      Accept: 'application/json'
    };
    if (userToken) {
      destinationHeaders['X-user-token'] = userToken;
    }

    const destinationResponse = await fetch(`${destinationServiceUrl}/destination-configuration/v1/destinations/${encodeURIComponent(config.destinationName)}`, {
      headers: destinationHeaders
    });
    const destinationPayload = await destinationResponse.json();

    if (!destinationResponse.ok) {
      throw new Error(`Could not read BTP destination ${config.destinationName}.`);
    }

    const destinationConfig = destinationPayload.destinationConfiguration || {};
    const authToken = (destinationPayload.authTokens || []).find((token) => token.http_header?.value);
    const authTokenError = this._destinationAuthTokenError(destinationPayload.authTokens || []);
    const authentication = destinationConfig.Authentication || destinationConfig.authentication || '';

    if (authentication === 'OAuth2UserTokenExchange' && !userToken) {
      throw new Error(`Destination ${config.destinationName} requires a logged-in user token, but none reached the backend.`);
    }
    if (authentication === 'OAuth2UserTokenExchange' && !authToken?.http_header?.value) {
      throw new Error(`Destination ${config.destinationName} did not return an exchanged Figaf token.${authTokenError ? ` ${authTokenError}` : ''} Check user assignment/trust between this app and Figaf.`);
    }

    return {
      baseUrl: (destinationConfig.URL || config.baseUrl).replace(/\/+$/, ''),
      authHeader: authToken?.http_header?.value || '',
      authentication
    };
  }

  _destinationAuthTokenError(authTokens) {
    const token = authTokens.find((candidate) => candidate.error || candidate.value || candidate.http_header?.error || candidate.http_header?.value);
    if (!token) {
      return '';
    }

    const error = token.error || token.http_header?.error;
    const value = token.value || token.http_header?.value || '';
    if (error) {
      return `Destination service reported: ${String(error).slice(0, 220)}.`;
    }
    if (value && !value.toLowerCase().startsWith('bearer ')) {
      return `Destination service returned a non-bearer token response.`;
    }

    return '';
  }

  _userToken(req) {
    const header = req?.headers?.authorization || req?._?.req?.headers?.authorization || '';
    return header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';
  }

  _userTokenDiagnostics(token) {
    const payload = this._decodeJwtPayload(token);
    const scopes = Array.isArray(payload.scope)
      ? payload.scope
      : String(payload.scope || '').split(/\s+/).filter(Boolean);
    const figafScopes = scopes.filter((scope) => scope.startsWith('figaf-xsuaa'));

    return {
      scopeCount: scopes.length,
      hasUaaUserScope: scopes.includes('uaa.user'),
      hasFigafScopes: figafScopes.length > 0,
      figafScopes
    };
  }

  _authHeaderDiagnostics(authHeader) {
    const header = String(authHeader || '');
    const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7) : '';
    return this._userTokenDiagnostics(token);
  }

  _decodeJwtPayload(token) {
    if (!token || token.split('.').length < 2) {
      return {};
    }

    try {
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const paddedPayload = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), '=');
      return JSON.parse(Buffer.from(paddedPayload, 'base64').toString('utf8'));
    } catch {
      return {};
    }
  }

  _destinationCredentials() {
    const services = JSON.parse(process.env.VCAP_SERVICES || '{}');
    const destinations = services.destination || [];
    const binding = destinations.find((service) => service.credentials?.clientid && service.credentials?.clientsecret);

    return binding?.credentials || null;
  }

  _normalizeAgents(response) {
    const root = this._parsePossiblyJson(response);
    const agents = root?.data?.data || root?.data || root?.items || root?.content || root || [];

    return (Array.isArray(agents) ? agents : []).map((agent) => ({
      id: agent.id || agent.guid || '',
      guid: agent.id || agent.guid || '',
      systemId: agent.systemId || agent.name || agent.id || agent.guid || '',
      name: agent.name || agent.systemId || agent.id || agent.guid || '',
      raw: agent
    })).filter((agent) => agent.id);
  }

  _parsePossiblyJson(value) {
    if (typeof value !== 'string') {
      return value;
    }

    const text = value.trim();
    if (!text) {
      return null;
    }

    try {
      return JSON.parse(text);
    } catch {
      return value;
    }
  }

  async _getToken(config) {
    if (!config.clientId || !config.clientSecret) {
      throw new Error('Missing FIGAF_CLIENT_ID or FIGAF_CLIENT_SECRET.');
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: config.scope
    });

    const response = await fetch(`${config.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(`Figaf OAuth token request failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
    }

    const payload = JSON.parse(text);
    if (!payload.access_token) {
      throw new Error('Figaf OAuth token response did not contain access_token.');
    }

    return payload.access_token;
  }

  _normalizeRecords(model, records) {
    return records.map((record) => {
      const cpiData = record.cpiIntegrationObjectData || {};
      const proData = record.proIntegrationObjectData || {};
      const objectData = record.objectData || {};
      const source = Object.keys(cpiData).length ? cpiData : Object.keys(proData).length ? proData : objectData;
      const modifiedAt = record.lastModifiedDate || source.modificationDate || record.lastSynchronizationDate || record.createdDate || '';

      return {
        id: String(record.id || record.trackedObjectId || source.id || source.externalId || ''),
        model,
        objectType: String(record.trackedObjectType || record.objectType?.shortTitle || record.objectType || source.objectType || ''),
        name: String(record.name || source.displayedName || source.name || source.title || record.title || record.hash || ''),
        technicalName: String(record.shortName || source.technicalName || record.hash || ''),
        externalId: String(record.externalId || source.externalId || ''),
        modifiedAt: String(modifiedAt),
        deleted: Boolean(record.deleted),
        raw: JSON.stringify(record)
      };
    });
  }
};
