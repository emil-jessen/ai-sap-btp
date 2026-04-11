sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("my.btp.app.ui.controller.Detail", {

    onInit: function () {
      // View model to track edit state
      const oViewModel = new JSONModel({ editable: false });
      this.getView().setModel(oViewModel, "viewModel");

      const oRouter = this.getOwnerComponent().getRouter();
      oRouter.getRoute("detail").attachPatternMatched(this._onRouteMatched, this);
    },

    _onRouteMatched: function (oEvent) {
      const sItemId = decodeURIComponent(oEvent.getParameter("arguments").itemId);

      if (sItemId === "new") {
        this._createNewItem();
      } else {
        this.getView().bindElement({
          path: `/Items(${sItemId})`,
          parameters: { "$$updateGroupId": "editGroup" }
        });
        this.getView().getModel("viewModel").setProperty("/editable", false);
      }
    },

    _createNewItem: function () {
      const oModel    = this.getView().getModel();
      const oListBinding = oModel.bindList("/Items");
      const oContext  = oListBinding.create({
        title: "",
        description: "",
        status: "open",
        priority: 1
      });
      this.getView().setBindingContext(oContext);
      this.getView().getModel("viewModel").setProperty("/editable", true);
    },

    // ── Edit / Save / Cancel ───────────────────────────────────────────────
    onEdit: function () {
      this.getView().getModel("viewModel").setProperty("/editable", true);
    },

    onSave: function () {
      const oModel = this.getView().getModel();
      const i18n   = this.getView().getModel("i18n").getResourceBundle();

      oModel.submitBatch("editGroup")
        .then(() => {
          MessageToast.show(i18n.getText("saveSuccess"));
          this.getView().getModel("viewModel").setProperty("/editable", false);
          this.getOwnerComponent().getRouter().navTo("list");
        })
        .catch((oError) => {
          MessageBox.error(oError.message || i18n.getText("genericError"));
        });
    },

    onCancel: function () {
      const oModel = this.getView().getModel();
      oModel.resetChanges("editGroup");
      this.getView().getModel("viewModel").setProperty("/editable", false);
      this.getOwnerComponent().getRouter().navTo("list");
    }
  });
});
