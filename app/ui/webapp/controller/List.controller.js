sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, Filter, FilterOperator, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("my.btp.app.ui.controller.List", {

    onInit: function () {
      // Nothing to set up — OData model is bound automatically via manifest.json
    },

    // ── Navigation ─────────────────────────────────────────────────────────
    onItemPress: function (oEvent) {
      const oItem = oEvent.getSource();
      const oCtx  = oItem.getBindingContext();
      this.getOwnerComponent().getRouter().navTo("detail", {
        itemId: encodeURIComponent(oCtx.getProperty("ID"))
      });
    },

    // ── Search / Filter ────────────────────────────────────────────────────
    onSearch: function (oEvent) {
      const sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query");
      const oTable = this.byId("itemsTable");
      const oBinding = oTable.getBinding("items");

      const aFilters = sQuery
        ? [new Filter({
            filters: [
              new Filter("title",       FilterOperator.Contains, sQuery),
              new Filter("description", FilterOperator.Contains, sQuery)
            ],
            and: false
          })]
        : [];

      oBinding.filter(aFilters);
    },

    // ── Create ─────────────────────────────────────────────────────────────
    onCreate: function () {
      this.getOwnerComponent().getRouter().navTo("detail", { itemId: "new" });
    },

    // ── Mark Done (inline action) ──────────────────────────────────────────
    onMarkDone: function (oEvent) {
      const oCtx  = oEvent.getSource().getBindingContext();
      const sID   = oCtx.getProperty("ID");
      const oModel = this.getView().getModel();
      const i18n  = this.getView().getModel("i18n").getResourceBundle();

      oModel.bindContext(`/CatalogService.markDone(...)`)
        .setParameter("ID", sID)
        .execute()
        .then(() => {
          MessageToast.show(i18n.getText("markedDoneSuccess"));
          oModel.refresh();
        })
        .catch((oError) => {
          MessageBox.error(oError.message || i18n.getText("genericError"));
        });
    }
  });
});
