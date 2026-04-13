using { my.btp.app as db } from '../db/schema';

/**
 * CatalogService — the main OData V4 service exposed by this application.
 * Protected by XSUAA: users need the 'Viewer' scope to read,
 * and the 'Admin' scope to write.
 */
service CatalogService @(path: '/catalog') {

  @(restrict: [
    { grant: ['READ'],             to: 'Viewer' },
    { grant: ['CREATE','UPDATE','DELETE'], to: 'Admin'  }
  ])
  entity Items as projection on db.Items;

  /**
   * Action: mark an item as done.
   * Callable via POST /catalog/Items(ID)/CatalogService.markDone
   */
  action markDone(ID: UUID) returns Items;
}
