sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox",
  "sap/m/MessageToast"
], function (Controller, MessageBox, MessageToast) {
  "use strict";

  return Controller.extend("mybtpappui.controller.List", {
    onStartAnalysis: function () {
      MessageBox.information(
        "The analysis cockpit is ready for the Figaf data connector. Next, connect the CAP service to the Figaf tenant APIs and map Partners, Company/subsidiaries, and Scenarios into analysis entities."
      );
    },

    onConnectionPlan: function () {
      MessageBox.information(
        "Suggested next step: create CAP endpoints for the three Figaf models, add a destination for the Figaf tenant, then call the AI analysis service with normalized model snapshots."
      );
    },

    onAnalyzePartners: function () {
      this._showPlannedAnalysis("Partners");
    },

    onAnalyzeSubsidiaries: function () {
      this._showPlannedAnalysis("Company/subsidiaries");
    },

    onAnalyzeScenarios: function () {
      this._showPlannedAnalysis("Scenarios");
    },

    _showPlannedAnalysis: function (sModelName) {
      MessageToast.show(sModelName + " analysis will run after the Figaf data connector is added.");
    }
  });
});
