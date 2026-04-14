'use strict';

const cds = require('@sap/cds');
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');

const DEFAULT_BASE_URL = 'https://emil2-figaf.cfapps.us10-001.hana.ondemand.com';
const DEFAULT_DESTINATION_NAME = 'figaf-api';
const DEFAULT_AGENT_SYSTEM_ID = 'Dev-Figaf-EJE';
const AGENTS_ENDPOINT = '/api/agent/search';
const AGENTS_SEARCH_BODY = { includeDecentralAdapterEngines: true };
const SCENARIOS_ENDPOINT = '/api/integration-object/filter';

module.exports = class FigafService extends cds.ApplicationService {
  async init() {
    this.on('status', (req) => this._status(req));
    this.on('connectionGuide', (req) => this._connectionGuide(req));
    this.on('agents', (req) => this._respond(req, () => this._agents(req)));
    this.on('modelViews', (req) => this._modelViews(req));
    this.on('partners', (req) => this._respond(req, () => this._readConfiguredModel('partners', req)));
    this.on('companySubsidiaries', (req) => this._respond(req, () => this._readConfiguredModel('companySubsidiaries', req)));
    this.on('scenarios', (req) => this._respond(req, () => this._readScenarios(req)));

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
    const configured = hasDestinationToken || hasDirectCredentials || Boolean(config.sessionCookie);
    const connectionMode = hasDestinationToken
      ? 'destination'
      : config.sessionCookie
        ? 'session-cookie'
        : 'direct';
    const message = configured
      ? 'Figaf connection settings are present, but data reads still validate the credentials against Figaf.'
      : 'Create a figaf-api destination that can access the Figaf WebUI APIs, set a temporary FIGAF_SESSION_COOKIE, or set valid Figaf credentials on my-btp-app-srv.';

    return {
      configured,
      connectionMode,
      destinationName: config.destinationName,
      baseUrl: destination?.baseUrl || config.baseUrl,
      hasClientId: Boolean(config.clientId),
      hasClientSecret: Boolean(config.clientSecret),
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
        countOfObjectsOnPage: 100,
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
    return this._normalizeRecords('Scenarios', Array.isArray(scenarios) ? scenarios : []);
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
    return this._normalizeRecords(isPartners ? 'Partners' : 'Company/subsidiaries', records);
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

    return {
      baseUrl: config.baseUrl,
      authHeader: `Bearer ${await this._getToken(config)}`
    };
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
