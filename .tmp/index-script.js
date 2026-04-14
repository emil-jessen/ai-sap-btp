
    var entityColumns = [
      "Type",
      "Name",
      "Short Name",
      "URL",
      "Country/Region Code",
      "Created By",
      "Created Date",
      "Last Modified By",
      "Last Modified Date"
    ];
    var entityDefaultColumns = [
      "Name",
      "Type",
      "Country/Region Code",
      "Inconsistencies detected",
      "Open GAP report"
    ];

    var scenarioColumns = [
      "Technical Name",
      "Displayed Name",
      "Agreement",
      "Trading Partner",
      "Trading Partner Country/Region Code",
      "Communication Partner",
      "Communication Partner Country/Region Code",
      "Company/Subsidiary",
      "Company/Subsidiary Country/Region Code",
      "Activated",
      "Update Status",
      "Recordings",
      "Agent Test Cases",
      "Linked Test Cases",
      "MAG",
      "MAG Status",
      "MAG Version",
      "Main Flow",
      "Main Flow Runtime Status",
      "Main Flow Runtime Version",
      "Main Flow Design Version",
      "Direction",
      "Sender",
      "Receiver",
      "Sender Communication",
      "Sender System Purpose",
      "Sender Adapter Type",
      "Sender Document Standard",
      "Sender Message Type",
      "Sender Message Version",
      "Sender Archive Payload",
      "Sender Identifier on Sender side",
      "Sender Identifier Qualifier on Sender side",
      "Receiver Identifier on Sender side",
      "Receiver Identifier Qualifier on Sender side",
      "Sender Identifier on Receiver side",
      "Sender Identifier Qualifier on Receiver side",
      "Receiver Identifier on Receiver side",
      "Receiver Identifier Qualifier on Receiver side",
      "Receiver Communication",
      "Receiver System Purpose",
      "Receiver Adapter Type",
      "Receiver Document Standard",
      "Receiver Message Type",
      "Receiver Message Version",
      "Receiver Archive Payload",
      "Pre Flow",
      "Pre Flow Runtime Status",
      "Pre Flow Runtime Version",
      "Pre Flow Design Version",
      "Post Flow",
      "Post Flow Runtime Status",
      "Post Flow Runtime Version",
      "Post Flow Design Version",
      "Sender MIG",
      "Sender MIG Status",
      "Sender MIG Version",
      "Receiver MIG",
      "Receiver MIG Status",
      "Receiver MIG Version",
      "Partner Directory",
      "Agreement Template",
      "Last Sync Date",
      "Modification Date"
    ];
    var aiColumns = [
      "Inconsistencies detected",
      "Open GAP report"
    ];
    var scenarioDefaultColumns = [
      "Agreement",
      "Inconsistencies detected",
      "Open GAP report"
    ];
    var currentTableState = null;
    var gapReports = {};
    var currentGapReportId = "";
    var chatHistory = [];
    var AUTH_REFRESH_MESSAGE = "Your BTP app session needs to be refreshed. Sign in again, then retry the Figaf read.";

    async function readJson(url) {
      var response = await fetch(url, {
        headers: { "Accept": "application/json" },
        credentials: "same-origin",
        cache: "no-store"
      });
      var text = await response.text();
      var contentType = response.headers.get("content-type") || "";

      if (contentType.indexOf("text/html") !== -1 || text.trim().indexOf("<html") === 0) {
        if (text.indexOf("/oauth/authorize") !== -1 || text.indexOf("locationAfterLogin") !== -1) {
          var authError = new Error(AUTH_REFRESH_MESSAGE);
          authError.signInUrl = extractSignInUrl(text);
          throw authError;
        }

        throw new Error("The service returned an HTML page instead of JSON.");
      }

      if (!response.ok) {
        throw new Error(readErrorMessage(response.status, text));
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error("The response was not JSON.");
      }
    }

    async function postJson(url, payload) {
      var response = await fetch(url, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify(payload)
      });
      var text = await response.text();

      if (!response.ok) {
        throw new Error(readErrorMessage(response.status, text));
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error("The response was not JSON.");
      }
    }

    function readErrorMessage(status, text) {
      try {
        var payload = JSON.parse(text);
        if (payload && payload.error && payload.error.message) {
          return payload.error.message;
        }
      } catch (error) {
        // Keep the original text below when the response is not an OData error.
      }

      return "HTTP " + status + ": " + text.slice(0, 220);
    }

    function extractSignInUrl(html) {
      var match = html.match(/location="([^"]+)"/);
      if (!match || !match[1]) {
        return "";
      }

      var textarea = document.createElement("textarea");
      textarea.innerHTML = match[1];
      return textarea.value;
    }

    function isAuthRefreshError(error) {
      return error && error.message === AUTH_REFRESH_MESSAGE;
    }

    function setConnectionStatus(message, signInUrl) {
      var status = document.getElementById("figafConnectionStatus");
      status.textContent = message;

      if (signInUrl) {
        var action = document.createElement("button");
        action.className = "figafInlineButton";
        action.type = "button";
        action.textContent = "Refresh sign-in";
        action.addEventListener("click", function () {
          window.location.href = signInUrl;
        });
        status.appendChild(document.createTextNode(" "));
        status.appendChild(action);
      }
    }

    function signInUrlFor(error) {
      return isAuthRefreshError(error) ? error.signInUrl || "" : "";
    }

    function selectedAgentId() {
      var select = document.getElementById("figafAgentSelect");
      return select ? select.value : "";
    }

    function odataString(value) {
      return encodeURIComponent(String(value || "").replace(/'/g, "''"));
    }

    function figafFunctionUrl(name) {
      var agentId = selectedAgentId();
      return agentId
        ? "/figaf/" + name + "(agentId='" + odataString(agentId) + "')"
        : "/figaf/" + name + "()";
    }

    function endpointTitle(name) {
      if (name === "partners") {
        return "Partners";
      }
      if (name === "companySubsidiaries") {
        return "Company/subsidiaries";
      }
      return "Scenarios";
    }

    function escapeHtml(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    }

    function parseRaw(record) {
      try {
        return record && record.raw ? JSON.parse(record.raw) : {};
      } catch (error) {
        return {};
      }
    }

    function parseJson(value) {
      try {
        return value ? JSON.parse(value) : {};
      } catch (error) {
        return {};
      }
    }

    function formatDate(value) {
      if (!value) {
        return "";
      }

      var date = typeof value === "number" || /^\d+$/.test(String(value))
        ? new Date(Number(value))
        : new Date(value);

      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).format(date).replace(",", "");
    }

    function yesNo(value) {
      if (value === true) {
        return "yes";
      }
      if (value === false) {
        return "no";
      }
      return value || "";
    }

    function metadataName(metadata) {
      if (!metadata) {
        return "";
      }
      if (typeof metadata === "string") {
        return metadata;
      }
      return metadata.name || metadata.displayedName || metadata.technicalName || metadata.title ||
        metadata.migName || metadata.magName || metadata.iflowName || metadata.alias || "";
    }

    function metadataStatus(metadata) {
      if (!metadata || typeof metadata === "string") {
        return "";
      }
      return metadata.status || metadata.updateStatus || metadata.runtimeStatus ||
        metadata.migStatus || metadata.magStatus || metadata.iflowStatus || "";
    }

    function metadataVersion(metadata) {
      if (!metadata || typeof metadata === "string") {
        return "";
      }
      return metadata.version || metadata.runtimeVersion || metadata.designVersion ||
        metadata.migVersion || metadata.magVersion || metadata.iflowVersion || "";
    }

    function displayNameOrId(value, fallback) {
      if (!value) {
        return fallback || "";
      }
      if (typeof value === "string") {
        return value;
      }
      return metadataName(value) || value.displayName || value.externalName || value.externalId ||
        value.technicalName || value.id || value.guid || fallback || "";
    }

    function reportIdFor(modelName, record) {
      return modelName + ":" + (record.id || record.externalId || record.technicalName || record.name || Math.random().toString(36).slice(2));
    }

    function entityRow(record) {
      var raw = parseRaw(record);
      var reportId = reportIdFor(record.model || "Entity", record);
      var row = {
        "Type": raw.trackedObjectType || record.objectType,
        "Name": raw.name || record.name,
        "Short Name": raw.shortName || record.technicalName,
        "URL": raw.url,
        "Country/Region Code": raw.country,
        "Created By": raw.createdBy,
        "Created Date": formatDate(raw.createdDate),
        "Last Modified By": raw.lastModifiedBy,
        "Last Modified Date": formatDate(raw.lastModifiedDate || record.modifiedAt)
      };
      var report = analyzeRecord(record.model || "Entity", record, row, raw);
      gapReports[reportId] = report;

      row["Inconsistencies detected"] = report.inconsistent;
      row["Open GAP report"] = gapReportUrl(reportId);
      return row;
    }

    function scenarioRow(record) {
      var raw = parseRaw(record);
      var objectData = raw.objectData || {};
      var additionalData = parseJson(objectData.additionalData);
      var b2b = additionalData.b2BScenarioObjectData || {};
      var recordings = raw.recordingRequestsCount || 0;
      var senderMig = b2b.senderMigMetadata || {};
      var receiverMig = b2b.receiverMigMetadata || {};
      var mag = b2b.magMetadata || b2b.mag || {};
      var mainFlowName = objectData.displayedName || displayNameOrId(objectData.integrationObject, objectData.technicalName);
      var magName = metadataName(mag) || b2b.magName || b2b.b2bScenarioName || objectData.displayedName || raw.title;
      var reportId = reportIdFor("Scenarios", record);

      var row = {
        "Technical Name": objectData.technicalName || raw.hash || record.technicalName,
        "Displayed Name": objectData.displayedName || raw.title || record.name,
        "Agreement": b2b.agreementName || raw.title || record.name,
        "Trading Partner": b2b.tradingPartnerName,
        "Trading Partner Country/Region Code": b2b.tradingPartnerCountry,
        "Communication Partner": b2b.communicationPartnerName,
        "Communication Partner Country/Region Code": b2b.communicationPartnerCountry,
        "Company/Subsidiary": b2b.companyOrSubsidiaryName,
        "Company/Subsidiary Country/Region Code": b2b.companyOrSubsidiaryCountry,
        "Activated": yesNo(b2b.activated),
        "Update Status": b2b.updateStatus,
        "Recordings": recordings,
        "Agent Test Cases": raw.agentTestCasesCount || 0,
        "Linked Test Cases": raw.linkedTestCasesCount || 0,
        "MAG": stripMagPrefix(magName),
        "MAG Status": b2b.magStatus || metadataStatus(mag),
        "MAG Version": metadataVersion(mag),
        "Main Flow": mainFlowName,
        "Main Flow Runtime Status": objectData.iflowRuntimeData && (objectData.iflowRuntimeData.status || objectData.iflowRuntimeData.runtimeStatus),
        "Main Flow Runtime Version": objectData.iflowRuntimeData && objectData.iflowRuntimeData.version,
        "Main Flow Design Version": objectData.version,
        "Direction": b2b.direction,
        "Sender": b2b.initiator,
        "Receiver": b2b.reactor,
        "Sender Communication": metadataName(b2b.senderCommunicationChannelMetadata),
        "Sender System Purpose": b2b.senderSystemPurpose,
        "Sender Adapter Type": b2b.senderAdapterType,
        "Sender Document Standard": b2b.senderDocumentStandard,
        "Sender Message Type": b2b.senderMessageType,
        "Sender Message Version": b2b.senderMessageVersion,
        "Sender Archive Payload": yesNo(b2b.senderPayloadArchived),
        "Sender Identifier on Sender side": b2b.initiatorSenderId,
        "Sender Identifier Qualifier on Sender side": b2b.initiatorSenderQualifier,
        "Receiver Identifier on Sender side": b2b.initiatorReceiverId,
        "Receiver Identifier Qualifier on Sender side": b2b.initiatorReceiverQualifier,
        "Sender Identifier on Receiver side": b2b.reactorSenderId,
        "Sender Identifier Qualifier on Receiver side": b2b.reactorSenderQualifier,
        "Receiver Identifier on Receiver side": b2b.reactorReceiverId,
        "Receiver Identifier Qualifier on Receiver side": b2b.reactorReceiverQualifier,
        "Receiver Communication": metadataName(b2b.receiverCommunicationChannelMetadata),
        "Receiver System Purpose": b2b.receiverSystemPurpose,
        "Receiver Adapter Type": b2b.receiverAdapterType,
        "Receiver Document Standard": b2b.receiverDocumentStandard,
        "Receiver Message Type": b2b.receiverMessageType,
        "Receiver Message Version": b2b.receiverMessageVersion,
        "Receiver Archive Payload": yesNo(b2b.receiverPayloadArchived),
        "Pre Flow": metadataName(b2b.preFlowMetadata),
        "Pre Flow Runtime Status": metadataStatus(b2b.preFlowMetadata),
        "Pre Flow Runtime Version": metadataVersion(b2b.preFlowMetadata),
        "Pre Flow Design Version": "",
        "Post Flow": metadataName(b2b.postFlowMetadata),
        "Post Flow Runtime Status": metadataStatus(b2b.postFlowMetadata),
        "Post Flow Runtime Version": metadataVersion(b2b.postFlowMetadata),
        "Post Flow Design Version": "",
        "Sender MIG": metadataName(senderMig),
        "Sender MIG Status": b2b.senderMigStatus || metadataStatus(senderMig),
        "Sender MIG Version": metadataVersion(senderMig),
        "Receiver MIG": metadataName(receiverMig),
        "Receiver MIG Status": b2b.receiverMigStatus || metadataStatus(receiverMig),
        "Receiver MIG Version": metadataVersion(receiverMig),
        "Partner Directory": b2b.pdPartner,
        "Agreement Template": b2b.agreementTemplateName,
        "Last Sync Date": formatDate(raw.lastSynchronizationDate),
        "Modification Date": formatDate(objectData.modificationDate || record.modifiedAt)
      };

      var report = analyzeRecord("Scenarios", record, row, raw);
      gapReports[reportId] = report;
      row["Inconsistencies detected"] = report.inconsistent;
      row["Open GAP report"] = gapReportUrl(reportId);
      return row;
    }

    function gapReportUrl(id) {
      return "/mybtpappui/index.html#analysis/" + encodeURIComponent(id || "");
    }

    function renderGapReport(reportId) {
      var dialog = document.getElementById("gapReportDialog");
      var body = document.getElementById("gapReportBody");
      var title = document.getElementById("gapReportTitle");
      var report = gapReports[reportId];

      currentGapReportId = reportId;
      if (!report) {
        title.textContent = "GAP report";
        body.innerHTML =
          "<p class=\"figafBodyText\">Read a Figaf model first, then open the GAP report from the generated table.</p>";
        dialog.hidden = false;
        return;
      }

      title.textContent = report.title;
      renderGapReportContent(report);
      dialog.hidden = false;

      if (report.aiStatus === "not-run") {
        runAiConsistencyAnalysis(reportId);
      }
    }

    function renderGapReportContent(report) {
      var body = document.getElementById("gapReportBody");
      body.innerHTML =
        "<div class=\"figafReportSummary\">" +
          "<span>Model: " + escapeHtml(report.model) + "</span>" +
          "<span>Status: " + escapeHtml(report.inconsistent ? "Inconsistencies detected" : "No inconsistency detected") + "</span>" +
          "<span>Generated: " + escapeHtml(formatDate(report.generatedAt)) + "</span>" +
          "<span>AI layer: " + escapeHtml(aiStatusText(report)) + "</span>" +
        "</div>" +
        "<h3>Agent findings</h3>" +
        renderFindings(report.findings) +
        "<h3>AI consistency layer</h3>" +
        "<p class=\"figafBodyText\">" + escapeHtml(report.aiMessage || "AI analysis is waiting to run.") + "</p>" +
        "<h3>Naming convention baseline</h3>" +
        "<p class=\"figafBodyText\">The agent checks the Figaf IS TPM naming guideline for partner short names, identifiers, systems, communications, MIG, MAG, Agreement Template, Agreement, and B2B Scenario naming, and marks any Draft status as inconsistent.</p>";
    }

    function aiStatusText(report) {
      if (report.aiStatus === "running") {
        return "running";
      }
      if (report.aiStatus === "done") {
        return "complete";
      }
      if (report.aiStatus === "skipped") {
        return "not configured";
      }
      if (report.aiStatus === "unavailable") {
        return "unavailable";
      }
      if (report.aiStatus === "error") {
        return "error";
      }
      return "pending";
    }

    async function runAiConsistencyAnalysis(reportId) {
      var report = gapReports[reportId];
      if (!report || report.aiStatus !== "not-run") {
        return;
      }

      report.aiStatus = "running";
      report.aiMessage = "Running AI consistency analysis for this record...";
      if (currentGapReportId === reportId) {
        renderGapReportContent(report);
      }

      try {
        var result = await postJson("/figaf/aiConsistencyAnalysis", {
          payload: JSON.stringify({
            model: report.model,
            title: report.title,
            row: report.row,
            ruleFindings: report.ruleFindings,
            raw: report.raw
          })
        });
        var analysis = result.value || result;
        var aiFindings = (analysis.findings || []).map(function (finding) {
          return {
            severity: finding.severity || "Low",
            rule: "AI: " + (finding.rule || "Consistency analysis"),
            field: finding.field || "Record",
            detail: finding.detail || ""
          };
        });

        report.aiStatus = analysis.configured ? "done" : "unavailable";
        report.aiMessage = analysis.message || "";
        aiFindings.forEach(function (finding) {
          addFinding(report.findings, finding);
        });
        report.inconsistent = report.findings.length > 0;
      } catch (error) {
        report.aiStatus = "error";
        report.aiMessage = "AI consistency analysis failed: " + error.message;
      }

      if (currentGapReportId === reportId) {
        renderGapReportContent(report);
      }
    }

    function renderFindings(findings) {
      if (!findings.length) {
        return "<p class=\"figafBodyText\">No GAPs found by the current rule set.</p>";
      }

      return "<ul class=\"figafFindingList\">" + findings.map(function (finding) {
        return "<li>" +
          "<strong>" + escapeHtml(finding.severity) + ": " + escapeHtml(finding.rule) + "</strong>" +
          "<span>Field: " + escapeHtml(finding.field) + "</span>" +
          "<p>" + escapeHtml(finding.detail) + "</p>" +
        "</li>";
      }).join("") + "</ul>";
    }

    function closeGapReport() {
      document.getElementById("gapReportDialog").hidden = true;
      currentGapReportId = "";
      if (window.location.hash.indexOf("#analysis/") === 0) {
        history.replaceState("", document.title, window.location.pathname + window.location.search);
      }
    }

    function stripMagPrefix(value) {
      return String(value || "").replace(/^MAG:\s*/i, "");
    }

    function analyzeRecord(modelName, record, row, raw) {
      var findings = [];
      var source = raw || parseRaw(record);
      var additionalData = source.objectData && parseJson(source.objectData.additionalData);
      var b2b = additionalData && additionalData.b2BScenarioObjectData ? additionalData.b2BScenarioObjectData : {};

      addDraftStatusFindings(findings, row, "table");
      addDraftStatusFindings(findings, source, "payload");
      addDraftStatusFindings(findings, additionalData, "payload.objectData.additionalData");

      if (modelName === "Scenarios") {
        analyzeScenarioNaming(findings, row, b2b);
      } else {
        analyzeEntityNaming(findings, row, source);
      }

      return {
        id: reportIdFor(modelName, record),
        title: row.Agreement || row.Name || row["Displayed Name"] || record.name || record.technicalName || "Figaf record",
        model: modelName,
        inconsistent: findings.length > 0,
        findings: findings,
        ruleFindings: findings.slice(),
        row: row,
        raw: source,
        aiStatus: "not-run",
        aiMessage: "AI analysis has not run yet. Open the GAP report to start the AI-assisted pass.",
        generatedAt: new Date().toISOString()
      };
    }

    function addDraftStatusFindings(findings, value, path, keyName) {
      if (value === null || value === undefined) {
        return;
      }

      var currentPath = path || "record";
      if (typeof value === "string") {
        if (isStatusField(keyName || currentPath) && value.trim().toLowerCase() === "draft") {
          addFinding(findings, {
            severity: "High",
            rule: "Draft status",
            field: currentPath,
            detail: "Status field is Draft. Any Draft status is treated as inconsistent."
          });
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(function (item, index) {
          addDraftStatusFindings(findings, item, currentPath + "[" + index + "]", keyName);
        });
        return;
      }

      if (typeof value === "object") {
        Object.keys(value).forEach(function (key) {
          addDraftStatusFindings(findings, value[key], currentPath + "." + key, key);
        });
      }
    }

    function isStatusField(name) {
      return /status/i.test(String(name || ""));
    }

    function analyzeScenarioNaming(findings, row, b2b) {
      var mag = row.MAG || "";
      var scenarioName = row["Displayed Name"] || (mag ? "MAG: " + mag : "");
      var agreement = row.Agreement || "";
      var template = row["Agreement Template"] || "";
      var senderMig = row["Sender MIG"] || "";
      var receiverMig = row["Receiver MIG"] || "";

      if (scenarioName && !isScenarioName(scenarioName)) {
        addFinding(findings, {
          severity: "Medium",
          rule: "B2B Scenario Naming Convention",
          field: "Displayed Name",
          detail: "Expected format: MAG: [MAG], where the MAG follows [Source MIG] to [Target MIG]."
        });
      }

      if (mag && !isMagName(mag)) {
        addFinding(findings, {
          severity: "Medium",
          rule: "MAG Naming Convention",
          field: "MAG",
          detail: "Expected SAP Integration Advisor MAG proposal without the redundant Mapping prefix, formatted as [Source MIG] to [Target MIG]."
        });
      }

      if (agreement && !isAgreementName(agreement, template)) {
        addFinding(findings, {
          severity: "Medium",
          rule: "Agreement Naming Convention",
          field: "Agreement",
          detail: "Expected format: [Agreement Template].[partner_short_name], where partner_short_name is lowercase and ends with an ISO country/region code."
        });
      }

      if (template && !isAgreementTemplateName(template)) {
        addFinding(findings, {
          severity: "Medium",
          rule: "Agreement Template Naming Convention",
          field: "Agreement Template",
          detail: "Expected format: b2b.<company_or_subsidiary>.<core_process>.<direction>.<business_object>.<typeSystem>."
        });
      }

      if (agreement && template && !agreement.startsWith(template + ".")) {
        addFinding(findings, {
          severity: "Medium",
          rule: "Agreement Naming Convention",
          field: "Agreement",
          detail: "Agreement should extend the Agreement Template name with partner_short_name and optional version."
        });
      }

      [senderMig, receiverMig].forEach(function (migName) {
        if (migName && !isMigName(migName)) {
          addFinding(findings, {
            severity: "Medium",
            rule: "MIG Naming Convention",
            field: migName === senderMig ? "Sender MIG" : "Receiver MIG",
            detail: "Expected MIG format: [Type System] : [Message Type] : [Type System Version] : [Envelope] : [Level Code] : [Level Title]."
          });
        }
      });

      if (b2b.updateStatus && String(b2b.updateStatus).toUpperCase() !== "NONE") {
        addFinding(findings, {
          severity: "Low",
          rule: "Update status",
          field: "Update Status",
          detail: "Update status is " + b2b.updateStatus + ". Review whether the scenario is aligned with the referenced objects."
        });
      }

      analyzeCommonNamingFields(findings, b2b, "Scenario details");
    }

    function analyzeEntityNaming(findings, row, source) {
      var name = row.Name || "";
      var shortName = row["Short Name"] || "";
      if (!name) {
        addFinding(findings, {
          severity: "Medium",
          rule: "Required naming metadata",
          field: "Name",
          detail: "Record is missing a name."
        });
      }
      if (!row["Country/Region Code"]) {
        addFinding(findings, {
          severity: "Low",
          rule: "Required geography metadata",
          field: "Country/Region Code",
          detail: "Record is missing country/region code."
        });
      }
      if (shortName && !isPartnerShortName(shortName)) {
        addFinding(findings, {
          severity: "Medium",
          rule: "Partner short name convention",
          field: "Short Name",
          detail: "Expected lowercase short name ending with _<country/region ISO code>, for example aldi_ch."
        });
      }
      analyzeCommonNamingFields(findings, source, row.Name || "Entity");
    }

    function isAgreementTemplateName(value) {
      var text = String(value || "");
      var parts = text.split(".");
      var directionIndex = parts.findIndex(function (part) {
        return part === "inb" || part === "out";
      });
      var hasKnownTypeSystem = parts.some(function (part) {
        return ["un_edifact", "asc_x12", "gs1_eancom", "sap_idoc", "idoc"].includes(part);
      });

      return /^b2b\.[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(text) &&
        parts.length >= 6 &&
        parts[0] === "b2b" &&
        directionIndex > 1 &&
        hasKnownTypeSystem;
    }

    function isAgreementName(value, template) {
      var text = String(value || "");
      if (!/^b2b\.[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(text)) {
        return false;
      }
      if (template) {
        var prefix = template + ".";
        return text.indexOf(prefix) === 0 && isPartnerShortName(text.slice(prefix.length));
      }
      var parts = text.split(".");
      return parts.length >= 7 && isAgreementTemplateName(parts.slice(0, -1).join(".")) &&
        isPartnerShortName(parts[parts.length - 1]);
    }

    function isPartnerShortName(value) {
      return /^[a-z0-9]+(?:_[a-z0-9]+)*_[a-z]{2}$/.test(String(value || ""));
    }

    function isMigName(value) {
      var parts = String(value || "").split(":").map(function (part) {
        return part.trim();
      }).filter(Boolean);
      var typeSystem = parts[0] || "";
      var hasKnownTypeSystem = /^(UN\/EDIFACT|ASC X12|SAP|GS1|EANCOM)/i.test(typeSystem);
      var levelCode = parts.length >= 2 ? parts[parts.length - 2] : "";
      var levelTitle = parts.length >= 1 ? parts[parts.length - 1] : "";
      return parts.length >= 5 &&
        parts.length <= 6 &&
        hasKnownTypeSystem &&
        /^\d+$/.test(levelCode) &&
        Boolean(levelTitle);
    }

    function isMagName(value) {
      var text = String(value || "").replace(/^MAG:\s*/i, "").trim();
      var parts = text.split(/\s+to\s+/i);
      return parts.length === 2 &&
        !/^Mapping\b/i.test(text) &&
        isMigName(parts[0]) &&
        isMigName(parts[1]);
    }

    function isScenarioName(value) {
      var text = String(value || "").trim();
      var mag = text.replace(/^MAG:\s*/i, "");
      return /^(MAG:\s*)?/i.test(text) && isMagName(mag);
    }

    function analyzeCommonNamingFields(findings, value, rootPath) {
      scanNamingFields(findings, value, rootPath || "record");
    }

    function scanNamingFields(findings, value, path, keyName) {
      if (value === null || value === undefined) {
        return;
      }

      if (typeof value === "string") {
        validateNamedField(findings, path, keyName || path, value);
        return;
      }

      if (Array.isArray(value)) {
        value.forEach(function (item, index) {
          scanNamingFields(findings, item, path + "[" + index + "]", keyName);
        });
        return;
      }

      if (typeof value === "object") {
        Object.keys(value).forEach(function (key) {
          scanNamingFields(findings, value[key], path + "." + key, key);
        });
      }
    }

    function validateNamedField(findings, path, keyName, value) {
      var key = String(keyName || "");
      var lowerPath = String(path || "").toLowerCase();
      var text = String(value || "").trim();

      if (!text) {
        return;
      }

      if (/identifier/i.test(lowerPath) && /alias/i.test(key) && !/^[^:]+ : [^:]+$/.test(text)) {
        addFinding(findings, {
          severity: "Low",
          rule: "Identifier alias naming convention",
          field: path,
          detail: "Expected format: [Type System] [Scheme name] [Scheme code] : [partner long name] [partner country/region full text]."
        });
      }

      if (/system/i.test(lowerPath) && /^(name|alias|displayedName)$/i.test(key) && text.split(/\s+/).length < 4) {
        addFinding(findings, {
          severity: "Low",
          rule: "System naming convention",
          field: path,
          detail: "Expected system name/alias format: [Type] [Deployment Type] [Application] [Purpose]."
        });
      }

      if (/communication/i.test(lowerPath) && /^name$/i.test(key) && !/^\S+\s+(inb|out|inbound|outbound)\s+\d+$/i.test(text)) {
        addFinding(findings, {
          severity: "Low",
          rule: "Communication name convention",
          field: path,
          detail: "Expected communication name format: [Adapter] [Direction] [incremental counter]."
        });
      }

      if (/communication/i.test(lowerPath) && /alias/i.test(key) && !/\b(inb|out|inbound|outbound)\b/i.test(text)) {
        addFinding(findings, {
          severity: "Low",
          rule: "Communication alias convention",
          field: path,
          detail: "Expected communication alias format: [comm purpose description] [Adapter] [Direction]."
        });
      }
    }

    function addFinding(findings, finding) {
      var key = [finding.severity, finding.rule, finding.field, finding.detail].join("|");
      var exists = findings.some(function (candidate) {
        return [candidate.severity, candidate.rule, candidate.field, candidate.detail].join("|") === key;
      });
      if (!exists) {
        findings.push(finding);
      }
    }

    function appendChatMessage(role, text) {
      var container = document.getElementById("figafChatMessages");
      var message = document.createElement("div");
      message.className = "figafChatMessage " + (role === "user" ? "figafChatMessageUser" : "figafChatMessageAssistant");
      message.innerHTML = "<strong>" + escapeHtml(role === "user" ? "You" : "Advisor") + "</strong><p>" + escapeHtml(text) + "</p>";
      container.appendChild(message);
      container.scrollTop = container.scrollHeight;
    }

    function chatContext() {
      var report = currentGapReportId ? gapReports[currentGapReportId] : null;
      var tableContext = currentTableState ? {
        modelName: currentTableState.modelName,
        loadedRecords: currentTableState.records && currentTableState.records.value ? currentTableState.records.value.length : 0,
        onlyInconsistencies: currentTableState.onlyInconsistencies,
        showingAllColumns: currentTableState.showAll
      } : null;

      return {
        selectedAgent: selectedAgentLabel(),
        table: tableContext,
        activeGapReport: report ? {
          title: report.title,
          model: report.model,
          row: report.row,
          findings: report.findings,
          aiStatus: report.aiStatus
        } : null
      };
    }

    function selectedAgentLabel() {
      var select = document.getElementById("figafAgentSelect");
      return select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : "Default agent";
    }

    async function askAdvisor(question) {
      chatHistory.push({ role: "user", content: question });
      appendChatMessage("user", question);
      appendChatMessage("assistant", "Thinking through the Figaf context...");

      try {
        var result = await postJson("/figaf/aiAdviceChat", {
          payload: JSON.stringify({
            question: question,
            history: chatHistory.slice(-8),
            context: chatContext()
          })
        });
        var response = result.value || result;
        var answer = response.answer || "No advice was returned.";
        chatHistory.push({ role: "assistant", content: answer });
        replaceLastAdvisorMessage(answer);
      } catch (error) {
        replaceLastAdvisorMessage("Could not get advisor response: " + error.message);
      }
    }

    function replaceLastAdvisorMessage(text) {
      var messages = document.querySelectorAll(".figafChatMessageAssistant");
      var last = messages[messages.length - 1];
      if (!last) {
        appendChatMessage("assistant", text);
        return;
      }
      last.querySelector("p").textContent = text;
    }

    function renderTable(title, records, columns, options) {
      var container = document.getElementById("figafDataTable");
      var allColumns = options && options.allColumns ? options.allColumns : columns;
      var rows = records.value.map(options.rowMapper);
      var onlyInconsistencies = Boolean(options && options.onlyInconsistencies);
      var displayRows = onlyInconsistencies
        ? rows.filter(function (row) { return row["Inconsistencies detected"] === true; })
        : rows;
      var showAll = options && options.showAll;
      var visibleColumns = showAll ? allColumns : columns;
      var tableId = "figafTable-" + title.replace(/[^a-z0-9]/gi, "");
      var recordText = displayRows.length === rows.length
        ? rows.length + " records"
        : displayRows.length + " of " + rows.length + " records";
      var buttons =
        "<div class=\"figafTableActions\">" +
          "<button class=\"figafButton figafTableToggle\" type=\"button\" data-table-action=\"toggle-inconsistencies\">" +
            (onlyInconsistencies ? "Show all records" : "Show only inconsistencies") +
          "</button>" +
          "<button class=\"figafButton figafTableToggle\" type=\"button\" data-table-action=\"toggle-columns\" data-show-all=\"" + (showAll ? "false" : "true") + "\">" +
            (showAll ? "Show default columns" : "Display all columns") +
          "</button>" +
        "</div>";

      var header = visibleColumns.map(function (column) {
        return "<th scope=\"col\">" + escapeHtml(column) + "</th>";
      }).join("");
      var filters = visibleColumns.map(function (column, index) {
        return "<th scope=\"col\">" +
          "<label class=\"figafColumnFilterLabel\">" +
            "<span>Filter " + escapeHtml(column) + "</span>" +
            "<input class=\"figafColumnFilter\" type=\"search\" data-filter-index=\"" + index + "\" placeholder=\"Filter\" />" +
          "</label>" +
        "</th>";
      }).join("");
      var body = displayRows.map(function (row) {
        var cells = visibleColumns.map(function (column) {
          var value = row[column];
          if (column === "Open GAP report") {
            return "<td><a href=\"" + escapeHtml(value) + "\">Open GAP report</a></td>";
          }
          if (column === "Inconsistencies detected") {
            return "<td><span class=\"figafBoolean\">" + escapeHtml(value ? "true" : "false") + "</span></td>";
          }
          return "<td>" + escapeHtml(value) + "</td>";
        }).join("");
        return "<tr>" + cells + "</tr>";
      }).join("");

      container.innerHTML =
        "<div class=\"figafTableHeader\">" +
          "<div><strong class=\"figafChecklistTitle\">" + escapeHtml(title) + "</strong>" +
          "<p class=\"figafBodyText\">" + recordText + "</p></div>" +
          buttons +
        "</div>" +
        "<div class=\"figafTableScroll\" id=\"" + tableId + "\">" +
          "<table class=\"figafDataGrid\"><thead><tr>" + header + "</tr><tr class=\"figafFilterRow\">" + filters + "</tr></thead><tbody>" + body + "</tbody></table>" +
        "</div>";
    }

    function applyColumnFilters(table) {
      var filters = Array.from(table.querySelectorAll(".figafColumnFilter")).map(function (input) {
        return {
          index: Number(input.getAttribute("data-filter-index")),
          value: input.value.trim().toLowerCase()
        };
      }).filter(function (filter) {
        return filter.value;
      });

      Array.from(table.querySelectorAll("tbody tr")).forEach(function (row) {
        var visible = filters.every(function (filter) {
          var cell = row.children[filter.index];
          return cell && cell.textContent.toLowerCase().indexOf(filter.value) !== -1;
        });
        row.hidden = !visible;
      });
    }

    function renderRecords(modelName, records, showAll, onlyInconsistencies) {
      currentTableState = {
        modelName: modelName,
        records: records,
        showAll: Boolean(showAll),
        onlyInconsistencies: Boolean(onlyInconsistencies)
      };

      if (modelName === "partners") {
        renderTable("Partners", records, entityDefaultColumns, {
          allColumns: entityColumns.concat(aiColumns),
          rowMapper: entityRow,
          showAll: showAll,
          onlyInconsistencies: onlyInconsistencies
        });
        return;
      }

      if (modelName === "companySubsidiaries") {
        renderTable("Company/subsidiaries", records, entityDefaultColumns, {
          allColumns: entityColumns.concat(aiColumns),
          rowMapper: entityRow,
          showAll: showAll,
          onlyInconsistencies: onlyInconsistencies
        });
        return;
      }

      renderTable("Scenarios", records, scenarioDefaultColumns, {
        allColumns: scenarioColumns.concat(aiColumns),
        rowMapper: scenarioRow,
        showAll: showAll,
        onlyInconsistencies: onlyInconsistencies
      });
    }

    function renderAgents(agents) {
      var select = document.getElementById("figafAgentSelect");
      var current = select.value;
      var options = ["<option value=\"\">Default agent</option>"];

      agents.value.forEach(function (agent) {
        var label = agent.systemId || agent.name || agent.id;
        var value = agent.id || agent.guid || agent.systemId || agent.name;
        options.push("<option value=\"" + escapeHtml(value) + "\">" + escapeHtml(label) + "</option>");
      });

      select.innerHTML = options.join("");
      if (current) {
        select.value = current;
      }
    }

    async function loadFigafAgents() {
      setConnectionStatus("Reading Figaf agents...");

      try {
        var agents = await readJson("/figaf/agents()");
        renderAgents(agents);
        setConnectionStatus(agents.value.length
          ? "Loaded " + agents.value.length + " Figaf agents."
          : "No Figaf agents were returned.");
        return true;
      } catch (error) {
        setConnectionStatus(
          "Could not load Figaf agents: " + error.message,
          signInUrlFor(error)
        );
        return false;
      }
    }

    document.getElementById("figafAgentSelect").addEventListener("change", function () {
      var select = document.getElementById("figafAgentSelect");
      var label = select.options[select.selectedIndex] ? select.options[select.selectedIndex].text : "Default agent";
      setConnectionStatus("Ready to read Figaf data for " + label + ".");
    });

    document.getElementById("figafChatForm").addEventListener("submit", function (event) {
      event.preventDefault();
      var input = document.getElementById("figafChatInput");
      var question = input.value.trim();
      if (!question) {
        return;
      }
      input.value = "";
      askAdvisor(question);
    });

    document.addEventListener("click", function (event) {
      var modelName = event.target.getAttribute("data-model-function");

      if (modelName) {
        var endpoint = figafFunctionUrl(modelName);
        setConnectionStatus("Reading " + endpointTitle(modelName) + "...");
        readJson(endpoint)
          .then(function (records) {
            setConnectionStatus("Read " + records.value.length + " records from " + endpointTitle(modelName) + ".");
            renderRecords(modelName, records, false, false);
          })
          .catch(function (error) {
            setConnectionStatus(error.message, signInUrlFor(error));
          });
      }

      if (event.target.closest("a") && event.target.closest("a").getAttribute("href").indexOf("#analysis/") !== -1) {
        event.preventDefault();
        renderGapReport(decodeURIComponent(event.target.closest("a").getAttribute("href").split("#analysis/")[1] || ""));
      }

      if (event.target.getAttribute("data-table-action") === "toggle-columns" && currentTableState) {
        renderRecords(
          currentTableState.modelName,
          currentTableState.records,
          event.target.getAttribute("data-show-all") === "true",
          currentTableState.onlyInconsistencies
        );
      }

      if (event.target.getAttribute("data-table-action") === "toggle-inconsistencies" && currentTableState) {
        renderRecords(
          currentTableState.modelName,
          currentTableState.records,
          currentTableState.showAll,
          !currentTableState.onlyInconsistencies
        );
      }
    });

    document.addEventListener("input", function (event) {
      if (!event.target.classList.contains("figafColumnFilter")) {
        return;
      }

      var table = event.target.closest("table");
      if (table) {
        applyColumnFilters(table);
      }
    });

    document.getElementById("closeGapReport").addEventListener("click", closeGapReport);
    document.getElementById("gapReportDialog").addEventListener("click", function (event) {
      if (event.target.id === "gapReportDialog") {
        closeGapReport();
      }
    });

    document.addEventListener("DOMContentLoaded", function () {
      loadFigafAgents();
      if (window.location.hash.indexOf("#analysis/") === 0) {
        renderGapReport(decodeURIComponent(window.location.hash.replace("#analysis/", "")));
      }
    });
  
