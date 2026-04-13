sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/ui/core/UIComponent",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, Filter, FilterOperator, UIComponent, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("my.btp.app.ui.controller.List", {
    onInit: function () {
      // You can initialize a local view model here later if needed.
    },

    onSearch: function (oEvent) {
      var sQuery = oEvent.getParameter("query");

      if (sQuery === undefined) {
        sQuery = oEvent.getParameter("newValue");
      }

      var oTable = this.byId("itemsTable");
      var oBinding = oTable.getBinding("items");

      if (!oBinding) {
        return;
      }

      if (!sQuery) {
        oBinding.filter([]);
        return;
      }

      var aFilters = [
        new Filter("title", FilterOperator.Contains, sQuery),
        new Filter("description", FilterOperator.Contains, sQuery),
        new Filter("status", FilterOperator.Contains, sQuery)
      ];

      oBinding.filter(new Filter({
        filters: aFilters,
        and: false
      }));
    },

    onItemPress: function (oEvent) {
      var oItem = oEvent.getSource();
      var oContext = oItem.getBindingContext();

      if (!oContext) {
        return;
      }

      var sId = oContext.getProperty("ID");

UIComponent.getRouterFor(this).navTo("detail", {
  itemId: sId
});
    },

    onCreate: function () {
      MessageToast.show("Create action not implemented yet.");
    },

    onMarkDone: async function (oEvent) {
      var oButton = oEvent.getSource();
      var oContext = oButton.getBindingContext();
      var oModel = this.getView().getModel();

      if (!oContext || !oModel) {
        return;
      }

      var sId = oContext.getProperty("ID");

      try {
        // Unbound action call:
        // POST /catalog/markDone
        // with parameter ID
        var oOperation = oModel.bindContext("/markDone(...)");
        oOperation.setParameter("ID", sId);

        await oOperation.execute();
        await oModel.refresh();

        MessageToast.show("Item marked as done.");
      } catch (oError) {
        MessageBox.error(this._extractErrorMessage(oError, "Failed to mark item as done."));
      }
    },

    _extractErrorMessage: function (oError, sFallback) {
      if (oError && oError.message) {
        return oError.message;
      }
      return sFallback;
    }
  });
});