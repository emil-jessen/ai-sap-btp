namespace my.btp.app;

using { cuid, managed } from '@sap/cds/common';

/**
 * Items entity — replace or extend with your own domain model.
 * Includes audit fields (createdAt, createdBy, modifiedAt, modifiedBy)
 * via the 'managed' aspect from @sap/cds/common.
 */
entity Items : cuid, managed {
  title       : String(100) @mandatory;
  description : String(500);
  status      : String enum {
    open       = 'open';
    inProgress = 'inProgress';
    done       = 'done';
  } default 'open';
  priority    : Integer default 1;
}
