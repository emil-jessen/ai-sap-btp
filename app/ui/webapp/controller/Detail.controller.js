sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, UIComponent, JSONModel, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("my.btp.app.ui.controller.Detail", {
    onInit: function () {
      var oViewModel = new JSONModel({
        editable: false
      });

      this.getView().setModel(oViewModel, "viewModel");

      var oRouter = UIComponent.getRouterFor(this);
      oRouter.getRoute("detail").attachPatternMatched(this._onObjectMatched, this);
    },

    _onObjectMatched: function (oEvent) {
      var sId = oEvent.getParameter("arguments").id;
      var oView = this.getView();
      var oModel = oView.getModel();

      if (!oModel || !sId) {
        return;
      }

      oView.bindElement({
        path: "/Items(" + this._formatGuid(sId) + ")"
      });
    },

    onEdit: function () {
      this.getView().getModel("viewModel").setProperty("/editable", true);
    },

    onSave: async function () {
      var oView = this.getView();
      var oModel = oView.getModel();
      var oViewModel = oView.getModel("viewModel");

      if (!oModel) {
        return;
      }

      try {
        await oModel.submitBatch?.();
        oViewModel.setProperty("/editable", false);
        MessageToast.show("Changes saved.");
      } catch (oError) {
        MessageBox.error(this._extractErrorMessage(oError, "Failed to save changes."));
      }
    },

    onCancel: function () {
      var oView = this.getView();
      var oModel = oView.getModel();
      var oViewModel = oView.getModel("viewModel");

      try {
        if (oModel && oModel.resetChanges) {
          oModel.resetChanges();
        }
      } catch (oError) {
        // Ignore reset issues and just leave edit mode.
      }

      oViewModel.setProperty("/editable", false);
      MessageToast.show("Changes canceled.");
    },

    _formatGuid: function (sId) {
      // OData V4 key predicate for UUID string keys
      return "'" + sId + "'";
    },

    _extractErrorMessage: function (oError, sFallback) {
      if (oError && oError.message) {
        return oError.message;
      }
      return sFallback;
    }
  });
});