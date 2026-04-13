sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/Device",
  "my/btp/app/ui/model/models"
], function (UIComponent, Device, models) {
  "use strict";

  return UIComponent.extend("my.btp.app.ui.Component", {

    metadata: {
      manifest: "json"
    },

    init: function () {
      // Call the base component's init function
      UIComponent.prototype.init.apply(this, arguments);

      // Set device model
      this.setModel(models.createDeviceModel(), "device");

      // Initialize the router
      this.getRouter().initialize();
    },

    getContentDensityClass: function () {
      if (!this._sContentDensityClass) {
        if (Device.support.touch) {
          this._sContentDensityClass = "sapUiSizeCozy";
        } else {
          this._sContentDensityClass = "sapUiSizeCompact";
        }
      }
      return this._sContentDensityClass;
    }
  });
});
