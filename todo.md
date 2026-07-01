# TODO - FK column cleanup

Date: 2026-07-01

## Done in this change

- Stop storing `Employee.lineName`; use `Employee.lineId -> Line.id`.
- Update line assign, unassign, and membership reactivation code to write `lineId`.
- Remove `Style.customer`, `Style.customerNameKo`, and `Style.customerNameVi` as stored columns.
- Build style customer display fields from `Style.orgId -> Organization`.
- Change style duplicate checks to `orgId + code/name`.
- Keep `WorkRecord.styleId -> Style.id`, `WorkRecord.styleProcessId -> StyleProcess.id`, and `WorkRecord.workerId -> Employee.id`.
- Keep migration cleanup for legacy WorkRecord text columns.
- Stop startup repair code from recreating Style customer-name columns.

## Check on production DB after deploy

- Railway deploy log shows `migration_fix.sql` applied.
- `Employee` has no `lineName` column and has `lineId` FK.
- `Style` has no `uid`, `styleId`, `customer`, `customerNameKo`, or `customerNameVi` columns.
- `WorkRecord` has no `workerName`, `customerName`, `styleUid`, `styleName`, `processId`, `processCode`, `colorId`, or `colorCode` columns.
- If legacy `Employee.lineName` cannot map to exactly one `Line.name`, migration fails; set the affected `Employee.lineId` manually and rerun.

## Verified

- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`
- `node --check backend/scripts/reset-to-baseline.js`
- `node --check backend/scripts/inspect-workrecord-state.js`
- `node --check backend/scripts/normalize-process-master-names.js`
- `node --check backend/scripts/verify-snapshot-st-backfill.js`
