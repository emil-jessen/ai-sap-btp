# OpenAI Project Context

This file is the project memory for future OpenAI/Codex sessions. Keep it updated when new findings, decisions, or operational steps are discovered.

## Project Goal

Build `my-btp-app`, a SAP BTP CAP + approuter + HTML5 application that reads B2B data from a Figaf Test Tool tenant and prepares the data for AI inconsistency analysis.

The app should read three Figaf data models:

- Partners
- Company/subsidiaries
- Scenarios

The UI should show the model data and later support AI analysis/GAP reports.

## Current Architecture

- Frontend: static HTML/CSS app under `app/ui/webapp`.
- Approuter: `approuter/xs-app.json`.
- CAP service: `srv/figaf-service.cds` and `srv/figaf-service.js`.
- Main BTP route:
  `https://cd3f5509trial-dev-my-btp-app-approuter.cfapps.us10-001.hana.ondemand.com/mybtpappui/index.html`
- Figaf route:
  `https://emil2-figaf.cfapps.us10-001.hana.ondemand.com`
- Figaf destination name:
  `figaf-api`
- Figaf agent system id:
  `Dev-Figaf-EJE`

## Figaf WebUI Endpoints

The Figaf screens do not expose a separate documented API for this use case. Data is read from the same WebUI API calls observed in HAR files.

Known relevant endpoints:

- `POST /api/agent/search` with `{ "includeDecentralAdapterEngines": true }`
- `GET /api/business-entities/agent/{agentId}/partner-profiles`
- `GET /api/business-entities/agent/{agentId}/company-and-subsidiaries`
- `POST /api/integration-object/filter`

Scenario filter body includes:

```json
{
  "OBJECT_TYPE": "B2B",
  "agentId": "<agent id>"
}
```

## UI Decisions

The frontend is a custom static page, not a SAPUI5 component page.

Buttons:

- `Read Figaf model views`
- `Read partners`
- `Read subsidiaries`
- `Read scenarios`
- `Connection setup`

CAP endpoints:

- `/figaf/status()`
- `/figaf/connectionGuide()`
- `/figaf/agents()`
- `/figaf/modelViews()`
- `/figaf/partners()`
- `/figaf/companySubsidiaries()`
- `/figaf/scenarios()`

Table behavior:

- Partners and company/subsidiaries show all CSV-derived columns.
- Scenarios default to:
  - `Agreement`
  - `Inconsistencies detected`
  - `See analysis`
- Scenarios have `Display all columns` to reveal the full data model.
- `Inconsistencies detected` is currently always boolean `false`; AI implementation comes later.
- `See analysis` currently links to a placeholder GAP report URL.
- The initial page now includes an Agent dropdown. It is populated from `/figaf/agents()` and passes the selected agent GUID as an optional `agentId` parameter to:
  - `/figaf/modelViews(agentId='...')`
  - `/figaf/partners(agentId='...')`
  - `/figaf/companySubsidiaries(agentId='...')`
  - `/figaf/scenarios(agentId='...')`

## Routing/Auth Decisions

The app initially had blank pages, redirect loops, and HTML login pages returned to fetch calls. These were addressed by aligning routes/auth:

- `/figaf/*` must route through the approuter to the CAP backend.
- Figaf routes must use XSUAA auth, not anonymous/no auth.
- The UI uses `fetch(..., { credentials: "same-origin", headers: { Accept: "application/json" } })`.
- The UI detects HTML login pages and reports a session refresh message instead of looping.

## XSUAA And Destination Findings

The `figaf-api` destination is intended to use:

- `Authentication = OAuth2UserTokenExchange`
- `URL = https://emil2-figaf.cfapps.us10-001.hana.ondemand.com`
- `tokenServiceURL = https://cd3f5509trial.authentication.us10.hana.ondemand.com/oauth/token`
- Figaf XSUAA client id:
  `sb-figaf-xsuaa!t615758`

Figaf XSUAA values observed:

- Service instance: `figaf-xsuaa`
- xsappname: `figaf-xsuaa!t615758`
- clientid: `sb-figaf-xsuaa!t615758`
- tenant: `cd3f5509trial`

my-btp-app XSUAA values observed:

- Service instance: `my-btp-app-xsuaa`
- xsappname: `my-btp-app-cd3f5509trial-dev!t615758`
- clientid: `sb-my-btp-app-cd3f5509trial-dev!t615758`

The local `xs-security.json` for `my-btp-app` was updated to request only the one Figaf foreign scope currently granted:

```json
"foreign-scope-references": [
  "$XSAPPNAME(application,figaf-xsuaa).ROLE_IRTAdmin"
]
```

The `FigafConnector` role template also references only:

```json
"$XSAPPNAME(application,figaf-xsuaa).ROLE_IRTAdmin"
```

Reason: the Figaf descriptor currently grants only `ROLE_IRTAdmin`. Requesting many ungranted foreign scopes caused the user token to contain no Figaf scopes.

## Figaf XSUAA Grant Requirement

The Figaf XSUAA descriptor must explicitly grant its scope to `my-btp-app`.

At minimum, Figaf `xs-security.json` should grant `ROLE_IRTAdmin`:

```json
{
  "name": "$XSAPPNAME.ROLE_IRTAdmin",
  "granted-apps": [
    "$XSAPPNAME(application,my-btp-app-cd3f5509trial-dev)",
    "my-btp-app-cd3f5509trial-dev!t615758"
  ]
}
```

After updating Figaf XSUAA:

```powershell
cf update-service figaf-xsuaa -c .\xs-security.json --wait
```

Then assign/refresh role collections and open the app in a fresh incognito/private window.

Important status checkpoint:

```text
User token Figaf scopes: yes (1)
```

This checkpoint was reached after the Figaf grant was added, proving cross-app foreign scope assignment works.

## Current Remaining Auth Issue

Earlier, even after the app token showed:

```text
User token Figaf scopes: yes (1)
```

the manual Destination lookup still reported:

```text
Destination figaf-api did not return an exchanged Figaf token.
Retrieval of OAuthToken failed due to:
Unable to fetch refresh token from the specified token service URL.
Response was: Insufficient scope for this resource.
```

This meant:

- Cross-app scope assignment now works.
- The remaining issue is likely in the Destination service token-exchange details or destination properties.
- Add/verify destination additional property:

```text
scope = openid uaa.user figaf-xsuaa!t615758.ROLE_IRTAdmin
```

The status endpoint now also reports:

- exact Figaf scopes present in the user token
- whether `uaa.user` is present
- exact Figaf scopes present in the exchanged destination token

If `hasUaaUserScope` is `false`, OAuth2 user-token exchange can still fail even when the Figaf foreign scope is present. The app `xs-security.json` includes `uaa.user` and adds it to the `FigafConnector` role template so the `MyBTPApp_FigafConnector` role collection can issue user tokens suitable for Destination service user-token exchange.

## Working Project Comparison

Two working Figaf project zips were inspected:

- `figaf-tpm-latest-approuter.zip`
- `figaf-tpm-latest-backend-companyjsonextractfix.zip`

Important findings:

- The working project uses a separate Express backend and app router.
- The approuter forwards auth token to backend.
- The backend is bound to:
  - XSUAA
  - Destination service
- The backend does not manually call Destination service token endpoints.
- It uses SAP Cloud SDK:

```js
const { executeHttpRequest } = require('@sap-cloud-sdk/http-client');
const { retrieveJwt } = require('@sap-cloud-sdk/connectivity');

executeHttpRequest(
  { destinationName, jwt },
  { method, url, data, headers }
);
```

Decision made:

- Update `my-btp-app` to use SAP Cloud SDK for real Figaf model reads, matching the known-working project.
- Keep manual Destination diagnostics for now, but do not rely on them as the only proof of data-read success.

Implemented:

- Added dependencies:
  - `@sap-cloud-sdk/connectivity`
  - `@sap-cloud-sdk/http-client`
- `srv/figaf-service.js` now prefers `_figafDestinationRequest()` using `executeHttpRequest({ destinationName, jwt }, ...)` for actual Figaf API calls.
- Agent lookup now matches the working Figaf project:
  - use `POST /api/agent/search`
  - send `{ includeDecentralAdapterEngines: true }`
  - resolve the returned `id`/GUID before calling business-entity endpoints.

Important caveat:

- The status line may still show the old manual Destination error even if actual model-read buttons work, because diagnostics and data reads now use different paths.
- Test actual buttons:
  - `Read partners`
  - `Read subsidiaries`
  - `Read scenarios`
  - `Read Figaf model views`

## Current Auth Checkpoint

The latest useful status checkpoint is:

```text
Mode: destination
Destination auth: OAuth2UserTokenExchange
User token Figaf scopes: yes
uaa.user scope: yes
Destination token Figaf scopes: yes
Destination error: empty
```

This proves the Destination service exchange now succeeds and returns a bearer token with Figaf scopes.

The remaining failure is no longer token exchange. Figaf itself returns:

```text
POST /api/agent/search -> HTTP 401 Unauthorized
```

Decision made:

- Prefer a direct request with the Destination service `authHeader` first, because `/figaf/status()` proves this token exists and contains Figaf scopes.
- Fall back to the Cloud SDK request only when the direct `authHeader` request returns 401.
- If both fail, return a combined error that explicitly says the exchanged token contains Figaf scopes, so future debugging focuses on Figaf-side token acceptance, audience/client validation, route selection, or destination URL, not missing BTP role assignment.

Implementation:

- `_figafRequest()` now routes destination calls through `_figafDestinationAuthHeaderRequest()`.
- `_figafDestinationAuthHeaderRequest()` reads destination `figaf-api`, uses `destination.authHeader`, and calls:
  - `POST /api/agent/search`
  - `GET /api/business-entities/agent/{agentId}/partner-profiles`
  - `GET /api/business-entities/agent/{agentId}/company-and-subsidiaries`
  - `POST /api/integration-object/filter`
- Requests include:
  - `Accept: application/json`
  - `Authorization: <destination auth header>`
  - `X-Requested-With: XMLHttpRequest`
  - `Content-Type: application/json` when a request body exists

Expected next HAR after deployment:

- If the direct auth-header path is live and still rejected, `/figaf/agents()` should return an error containing:

```text
using an exchanged token that contains Figaf scopes
Direct response: ...
Cloud SDK response: ...
```

If the error still only says:

```text
Figaf destination request POST /api/agent/search failed with HTTP 401: Request failed with status code 401
```

then the browser/backend is still running an older deployment.

Deployment checkpoint:

- Built with `npm run build`.
- Built MTAR with `npx mbt build -p cf`.
- Deployed `mta_archives/my-btp-app_1.0.0.mtar`.
- Deployment operation id: `f0917a14-37b5-11f1-93f7-eeee0a99d52c`.
- Deploy finished successfully on 2026-04-14 03:58 UTC, and both `my-btp-app-srv` and `my-btp-app-approuter` started.

## Latest Runtime Finding: Scoped Token Still 401

The next HAR proved the newest backend was live because errors included:

```text
using an exchanged token that contains Figaf scopes
```

Current confirmed state:

- Destination token exchange works.
- The exchanged token has Figaf scopes.
- Direct request to Figaf router URL still returns 401.
- Cloud SDK request to the same destination also returns 401.

Figaf deployment files show two routes:

- Router route: `https://emil2-figaf.cfapps.us10-001.hana.ondemand.com`
- Internal app route: `https://emil2-figaf-internal.cfapps.us10-001.hana.ondemand.com`

Figaf approuter forwards to a destination named `token-destination` with `forwardAuthToken: true`. The current `figaf-api` destination points at the router route. Since a service-to-router bearer-token request can be rejected before the WebUI API reaches the Figaf backend, the connector now tries the internal Figaf app route as a fallback when the router returns 401.

Implementation:

- Added optional env var `FIGAF_INTERNAL_BASE_URL`.
- Set it in `mta.yaml` to `https://emil2-figaf-internal.cfapps.us10-001.hana.ondemand.com`.
- `_figafDestinationAuthHeaderRequest()` now tries:
  - the destination URL
  - `FIGAF_INTERNAL_BASE_URL`
  - a derived `-internal` host
- The same exchanged destination `Authorization` header is used for all direct attempts.

Deployment checkpoint:

- Built with `npm run build`.
- Built MTAR with `npx mbt build -p cf`; the command wrapper timed out after archive creation, but `mta_archives/my-btp-app_1.0.0.mtar` was generated.
- Deployed `mta_archives/my-btp-app_1.0.0.mtar`.
- Deployment operation id: `96e75901-37dd-11f1-9e6c-eeee0a8074b5`.
- Deploy finished successfully on 2026-04-14 08:42 UTC, and both `my-btp-app-srv` and `my-btp-app-approuter` started.

## Latest Runtime Finding: Stale Browser Login

The next HAR did not reach the CAP backend at all. Every `/figaf/...` request returned a 200 HTML page containing an approuter/XSUAA login redirect script:

```text
location="https://cd3f5509trial.authentication.us10.hana.ondemand.com/oauth/authorize..."
```

Conclusion:

- This HAR is not evidence of a Figaf connector failure.
- The browser session was stale or unauthenticated after redeploy/XSUAA changes.
- The approuter was redirecting API fetch calls to login HTML.

UI improvement:

- The frontend now recognizes this login HTML as a sign-in refresh state.
- It shows a `Refresh sign-in` action in the Figaf connection status.
- Startup now stops after `/figaf/agents()` returns an auth-refresh error, instead of immediately calling `/figaf/status()` and making the page look noisier.
- Follow-up: a later HAR showed reloading the app URL was not enough. The `Refresh sign-in` action now parses the actual XSUAA `/oauth/authorize` URL from the approuter login HTML and navigates the top-level browser window there.

Deployment checkpoint:

- Built with `npm run build`.
- Built MTAR with `npx mbt build -p cf`.
- Deployed `mta_archives/my-btp-app_1.0.0.mtar`.
- Deployment operation id: `65ebf3d9-37e0-11f1-938a-eeee0a8c9147`.
- Deploy finished successfully on 2026-04-14 09:02 UTC, and both `my-btp-app-srv` and `my-btp-app-approuter` started.

## Latest Runtime Finding: Agents Work, Model Overview Too Heavy

The next HAR showed the app is authenticated again:

- `/figaf/status()` returned JSON.
- `/figaf/agents()` returned two agents:
  - `Dev-Figaf-EJE`
  - `Dev-Figaf-EJE2`

The failure changed to:

```text
/figaf/modelViews() -> 504 Gateway Timeout
```

Backend logs showed CAP eventually returned `modelViews()` after 70-90 seconds, which is too slow for the browser/approuter path. The cause was that `modelViews()` attempted to read all three Figaf datasets just to calculate counts. This is too expensive because Figaf WebUI calls can take tens of seconds.

Decision:

- `modelViews()` is now lightweight.
- It only validates agent access and returns the three model cards as `ready`.
- Users read each dataset with the separate model buttons.
- Figaf direct-call host order now tries the internal Figaf app route before the public router route, because the public router path can add a long delay before the internal route succeeds.

Deployment checkpoint:

- Built with `npm run build`.
- Built MTAR with `npx mbt build -p cf`.
- Deployed `mta_archives/my-btp-app_1.0.0.mtar`.
- Deployment operation id: `7cc381b7-37e2-11f1-938a-eeee0a8c9147`.
- Deploy finished successfully on 2026-04-14 09:17 UTC, and both `my-btp-app-srv` and `my-btp-app-approuter` started.

Deployment checkpoint:

- Built with `npm run build`.
- Built MTAR with `npx mbt build -p cf`.
- Deployed `mta_archives/my-btp-app_1.0.0.mtar`.
- Deployment operation id: `1ff8f53e-37df-11f1-93f7-eeee0a99d52c`.
- Deploy finished successfully on 2026-04-14 08:54 UTC, and both `my-btp-app-srv` and `my-btp-app-approuter` started.

## Latest Runtime Finding: Agent Lookup

The latest HAR showed the auth part had improved, but list reads still failed:

- `/figaf/status()` returned 200 and `hasFigafScopesInUserToken: true`.
- `/figaf/modelViews()` returned 200, but all three model views had `status: "error"`.
- The exact error was:
  `No Figaf agent found for system id Dev-Figaf-EJE. Set FIGAF_AGENT_ID if needed.`
- `/figaf/companySubsidiaries()` returned 502 with the same message.

Conclusion:

- The remaining failure was no longer blank-page/routing/auth at the UI level.
- The backend could not resolve the Figaf agent with the old agent-list endpoint.
- The working reference backend uses `/api/agent/search`, not `/api/agent/get-with-number-of-related-objects`.

Decision:

- Switch `srv/figaf-service.js` agent resolution to `POST /api/agent/search`.
- Normalize response shapes defensively because Figaf responses may be either direct arrays or wrapped under `data`.
- Use the agent GUID (`id`) for `/api/business-entities/agent/{agentId}/...` endpoints.

## Deployment Notes

Typical build/deploy flow:

```powershell
npm run build
npx mbt build -p cf
cf deploy mta_archives/my-btp-app_1.0.0.mtar
```

Known warnings:

- Local Node is v24 while project expects Node 20; builds still succeeded.
- UI5 i18n fallback warning is currently harmless.
- UI5 local update-check warning is currently harmless.

Do not paste or expose bearer tokens from CF deploy/log output.

Recent deploy:

- Operation `cecb7a18-37ac-11f1-93f7-eeee0a99d52c` deployed the agent lookup switch.
- Both `my-btp-app-approuter` and `my-btp-app-srv` started successfully after deployment.
- Recent backend logs show `FigafService` serving at `/figaf`.
- Operation `3af1fad1-37ae-11f1-93f7-eeee0a99d52c` deployed the Agent dropdown and optional `agentId` CAP parameters.
- Operation `74d3d467-37af-11f1-93f7-eeee0a99d52c` deployed the `uaa.user` addition to `xs-security.json`.
- Operation `8ae0b514-37b0-11f1-93f7-eeee0a99d52c` deployed destination-token scope diagnostics and `X-Requested-With: XMLHttpRequest` on Figaf API calls.

## Latest Runtime Finding: Figaf 401

After the agent lookup was switched to `/api/agent/search`, the next HAR showed the app reached the Cloud SDK destination path but Figaf rejected the call:

```text
Figaf destination request POST /api/agent/search failed with HTTP 401: Request failed with status code 401. "Unauthorized"
```

Conclusion:

- The previous "No Figaf agent found" error is gone.
- The current blocker is Figaf authorization for the destination-propagated user token or destination token exchange result.
- The new Agent dropdown uses the same `/api/agent/search` call, so it will also show this authorization problem until Figaf accepts the propagated identity/token.

Follow-up decision:

- Add `uaa.user` to the local app XSUAA descriptor and the `FigafConnector` role template.
- Redeploy `my-btp-app-xsuaa`.
- Retest in a fresh incognito/private browser window and confirm `/figaf/status()` shows `uaa.user scope: yes`.

New checkpoint from latest HAR:

- `/figaf/status()` now shows:
  - `connectionMode: "destination"`
  - `destinationAuthentication: "OAuth2UserTokenExchange"`
  - `destinationError: ""`
  - `hasUaaUserScope: true`
- This proves the Destination service token exchange is now working.
- The remaining failure is Figaf API authorization: `/api/agent/search` returns HTTP 401.

Follow-up implementation:

- Add safe destination-token scope diagnostics to `/figaf/status()`.
- Add `X-Requested-With: XMLHttpRequest` to Figaf destination API calls to better match browser WebUI requests.

Latest checkpoint:

- `/figaf/status()` now proves the exchanged destination token has Figaf scopes.
- The Figaf API still returns 401 for `/api/agent/search`.
- Decision: actual Figaf reads now use the manually verified Destination service exchanged `Authorization` header first, then fall back to SAP Cloud SDK on 401. This makes the read path match the diagnostics path and provides a clearer error if Figaf rejects the scoped exchanged token.

## Guidelines For Future Sessions

- 2026-04-14 cleanup checkpoint:
  - Latest HAR showed no failing HTTP responses; the visible "errors" were not blocking data reads.
  - Scenarios lookup works.
  - Normal UI flow is now reduced to:
    - `/figaf/agents()` on page load to populate the Agent dropdown.
    - `/figaf/partners(agentId='...')`, `/figaf/companySubsidiaries(agentId='...')`, or `/figaf/scenarios(agentId='...')` only when the user clicks the corresponding model button.
  - Removed the user-facing `Analyze Figaf data`, `Connection setup`, `Refresh agents`, and `Read Figaf model views` buttons.
  - Removed automatic frontend calls to `/figaf/status()`, `/figaf/connectionGuide()`, and `/figaf/modelViews()`.
  - Kept the backend diagnostic endpoints in `srv/figaf-service.*` for future troubleshooting, but they are no longer part of the normal page flow.
  - Deployed cleanup with operation `ff621e21-37e3-11f1-938a-eeee0a8c9147`; both `my-btp-app-approuter` and `my-btp-app-srv` started successfully.
  - Follow-up UI simplification removed the three summary metric boxes and moved the result table below the three model read cards.
  - Deployed this layout change with operation `65c42e28-37e5-11f1-938a-eeee0a8c9147`; both apps started successfully.
  - Result rendering now uses filterable HTML tables for all three object reads. Each visible column gets a native search input that filters rows client-side without making additional Figaf API calls. Scenario filters apply to the default three-column view and the expanded all-column view.
  - Deployed filterable table rendering with operation `e0afbdbf-37e8-11f1-99cd-eeee0a9ddd6b`; both apps started successfully.
  - CI lint fix: `eslint.config.cjs` now declares Node 20 globals used by CAP (`fetch`, `URL`, `URLSearchParams`, `Buffer`) for `srv/**/*.js`, and unused catch bindings in `srv/figaf-service.js` were removed. `npm run lint --if-present` passes locally.
  - Table controls now apply to all three models:
    - Default compact columns for partners and company/subsidiaries: `Name`, `Type`, `Country/Region Code`, `Inconsistencies detected`, `Open GAP report`.
    - Default compact columns for scenarios: `Agreement`, `Inconsistencies detected`, `Open GAP report`.
    - `Display all columns` is available for partners, company/subsidiaries, and scenarios.
    - `Show only inconsistencies` filters the currently loaded rows client-side where `Inconsistencies detected === true`.
    - `Inconsistencies detected` is still a placeholder boolean set to `false` until AI analysis is implemented, so the inconsistency-only view is expected to show zero rows for now.
  - Deployed all-table AI columns and table controls with operation `5f00effa-37f8-11f1-bef0-eeee0a95cbef`; both apps started successfully.
  - First analysis-agent implementation:
    - Extracted the attached `Figaf_TPM_Naming_Convention_Guidelines.docx` locally. Core rules: B2B names start with `b2b.`, use lowercase dot-separated segments, include `inb`/`out`, and include type systems like `un_edifact`, `asc_x12`, `gs1_eancom`; scenarios follow `MAG: [Source MIG] to [Target MIG]`; MIGs are colon-separated names with type system, message type, version, envelope, level code, and level title.
    - Scenario MAG display now falls back to `b2bScenarioName` / `objectData.displayedName`, because the Figaf payload does not always include a `magMetadata` object.
  - Scenario Main Flow now prefers a display name over technical GUID-like IDs.
  - Client-side analysis marks records inconsistent when any nested value is exactly `Draft`, and adds naming-convention findings for scenarios.
  - `Open GAP report` now opens an in-page GAP report dialog generated by the rule agent.
  - Deployed the MAG/Main Flow display fix and first rule-agent GAP report implementation with operation `4b777e40-37fa-11f1-adc3-eeee0a8c2c40`; both `my-btp-app-approuter` and `my-btp-app-srv` started successfully.
  - Draft-status detection was tightened to inspect all fields whose key/name contains `status` across the rendered table row, the raw Figaf payload, and parsed `objectData.additionalData`. Any status field with value `Draft` is a High severity inconsistency and appears in the row GAP report.
  - Deployed the status-field scan with operation `45c28c61-37fc-11f1-bef0-eeee0a95cbef`; both `my-btp-app-approuter` and `my-btp-app-srv` started successfully.
  - The attached `Figaf IS TPM Naming guidelines.docx` was extracted and encoded into the rule-agent:
    - Partner short names must be lowercase and end with `_<country/region ISO code>`, for example `aldi_ch`.
    - Identifier aliases should follow `[Type System] [Scheme name] [Scheme code] : [partner long name] [partner country/region full text]`.
    - System names/aliases should follow `[Type] [Deployment Type] [Application] [Purpose]`.
    - Communication names should follow `[Adapter] [Direction] [incremental counter]`; communication aliases should include purpose, adapter, and direction.
    - MIG names should be colon-separated names with type system, message type, type-system version, optional envelope, level code, and level title.
    - MAG names should follow the SAP Integration Advisor proposal without a redundant `Mapping` prefix and use `[Source MIG] to [Target MIG]`.
    - Agreement Templates should follow `b2b.<company/subsidiary short name>.<core process>.<direction>.<business object>.<typeSystem>`.
    - Agreements should follow `[Agreement Template].[partner_short_name]`.
    - B2B Scenario names should follow optional `MAG: ` plus the MAG name.
  - Deployed the expanded naming convention validator with operation `793b5b69-37fe-11f1-ad2b-eeee0a8b0282`; both `my-btp-app-approuter` and `my-btp-app-srv` started successfully.
  - Hybrid AI-assisted analyzer implementation:
    - Added CAP action `/figaf/aiConsistencyAnalysis` in `srv/figaf-service.cds` and `srv/figaf-service.js`.
    - The deterministic rule layer still runs first and remains the foundation for GAP reports.
    - When a user opens a GAP report, the UI lazily calls the AI action for that one record, sends the model name, table row, raw Figaf payload, and existing rule findings, and merges any additional AI findings into the report.
    - The backend calls the OpenAI Responses API only when `OPENAI_API_KEY` is configured on `my-btp-app-srv`.
    - `OPENAI_MODEL` defaults to `gpt-4.1-mini` in `mta.yaml`.
    - If `OPENAI_API_KEY` is missing, the UI shows that the AI layer is not configured and keeps the rule-only findings.
    - Build checks passed (`npm run lint --if-present`, inline script syntax check, `npm run build`, `npx mbt build -p cf`), but deploy was blocked because the local CF login had expired. Re-run `cf login` and then `cf deploy mta_archives/my-btp-app_1.0.0.mtar`.
  - AI advisor chat implementation:
    - Added CAP action `/figaf/aiAdviceChat` in `srv/figaf-service.cds` and `srv/figaf-service.js`.
    - Added an `AI advisor` chat panel below the Figaf result table in `app/ui/webapp/index.html`.
    - Chat requests include the user question, recent chat history, selected Figaf agent label, current loaded table/model summary, and the currently open GAP report when one is active.
    - The backend uses the same `OPENAI_API_KEY` and `OPENAI_MODEL` configuration as the AI consistency analyzer.
    - If `OPENAI_API_KEY` is not configured, the chat returns a graceful setup message instead of failing the UI.
    - Build checks passed (`npm run lint --if-present`, inline script syntax check, `npm run build`, `npx mbt build -p cf`), and `mta_archives/my-btp-app_1.0.0.mtar` is ready to deploy after `cf login`.
  - OpenAI quota handling:
    - Runtime showed HTTP 429 with `insufficient_quota`, meaning the OpenAI project/key quota or billing is exhausted.
    - Backend now converts OpenAI quota/rate-limit 429 responses into graceful unavailable messages for both `/figaf/aiConsistencyAnalysis` and `/figaf/aiAdviceChat`.
    - GAP reports mark the AI layer as `unavailable` instead of showing the raw OpenAI error. Rule-based GAP findings remain usable.
    - Rebuilt `mta_archives/my-btp-app_1.0.0.mtar` after this change; deploy still requires a refreshed `cf login`.
- Update this file whenever:
  - a new auth/destination finding is made
  - a new endpoint is confirmed
  - a deployment or configuration convention changes
  - a workaround is replaced by a better solution
  - data normalization decisions change
- Prefer SAP Cloud SDK destination handling over manual Destination service token calls for actual Figaf API reads.
- Treat HAR files as evidence for endpoint shape and runtime errors, but do not expose cookies or tokens.
- When debugging auth, distinguish:
  - app user token scopes
  - Destination service token exchange
  - Figaf API authorization
  - browser/approuter session state
- Always retest auth changes in a fresh incognito/private browser session.
