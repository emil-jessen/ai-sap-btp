'use strict';

const cds = require('@sap/cds');

/**
 * Custom handler for CatalogService.
 * Add your business logic here.
 */
module.exports = class CatalogService extends cds.ApplicationService {

  async init() {
    const { Items } = this.entities;

    // ── READ hook ──────────────────────────────────────────────────────────
    this.before('READ', Items, (req) => {
      // Example: log who is reading
      const user = req.user?.id ?? 'anonymous';
      cds.log('CatalogService').info(`READ Items requested by ${user}`);
    });

    // ── CREATE hook ────────────────────────────────────────────────────────
    this.before('CREATE', Items, (req) => {
      const { title } = req.data;
      if (!title || title.trim().length === 0) {
        req.error(400, 'Title must not be empty.');
      }
    });

    // ── markDone action ────────────────────────────────────────────────────
    this.on('markDone', async (req) => {
      const { ID } = req.data;
      const item = await SELECT.one.from(Items).where({ ID });

      if (!item) {
        return req.error(404, `Item ${ID} not found.`);
      }

      await UPDATE(Items).set({ status: 'done' }).where({ ID });
      return SELECT.one.from(Items).where({ ID });
    });

    // ── Destination Service example ────────────────────────────────────────
    // Uncomment to proxy a call through a BTP Destination:
    //
    // this.on('READ', 'SomeExternalEntity', async (req) => {
    //   const srv = await cds.connect.to('MyDestination'); // name in mta.yaml
    //   return srv.run(req.query);
    // });

    return super.init();
  }
};
