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
      var sItemId = oEvent.getParameter("arguments").itemId;
      var oView = this.getView();
      var oModel = oView.getModel();

      if (!oModel || !sItemId) {
        return;
      }

      oView.bindElement({
        path: "/Items('" + sItemId + "')"
      });
    },

    onEdit: function () {
      this.getView().getModel("viewModel").setProperty("/editable", true);
    },

    onSave: async function () {
      var oView = this.getView();
      var oModel = oView.getModel();
      var oViewModel = oView.getModel("viewModel");

      try {
        if (oModel && oModel.submitBatch) {
          await oModel.submitBatch();
        }
        oViewModel.setProperty("/editable", false);
        MessageToast.show("Changes saved.");
      } catch (oError) {
        MessageBox.error(oError?.message || "Failed to save changes.");
      }
    },

    onCancel: function () {
      var oView = this.getView();
      var oModel = oView.getModel();
      var oViewModel = oView.getModel("viewModel");

      if (oModel && oModel.resetChanges) {
        oModel.resetChanges();
      }

      oViewModel.setProperty("/editable", false);
      MessageToast.show("Changes canceled.");
    }
  });
});