# Test Initial State (Baseline)

This file is the source-of-truth snapshot for the test reset target.

## Baseline ID

- `test-baseline-v1.8`
- Captured on: `2026-03-06`

## Rules

- Roles are hardcoded and resolved from `OrgMembership.role`.
- Line assignment candidates must be `WORKER` only.
- System admin account is not part of reset deletion.
- `System Settings > Subscription Management` is visible only for
  `entryType=SYSTEM` + `systemRole=SYSTEM_ADMIN`.
- Org bypass accounts (`ADMIN`, `OPERATOR`, `ACCOUNTANT`, `WORKER`) must not
  see `Subscription Management`.
- Baseline reset preserves `WorkLog` and `WorkRecord`.
- Older notes that say `20 workers` mean `20 workers per line`, not `20 total`.

## System Users

- `system-admin@test.local` -> `SYSTEM_ADMIN` (must always remain)

## Organizations

- `TSMF` -> `MANUFACTURER`
- `TSBR` -> `BRAND`

## Organization Relationship

- Manufacturer `TSMF` <-> Brand `TSBR` (one active relationship row)

## Memberships

- Org `TSMF`
- `manufacturer-admin@test.local` -> `ADMIN` / `ACTIVE`
- `manufacturer-operator@test.local` -> `OPERATOR` / `ACTIVE`
- `manufacturer-accountant@test.local` -> `ACCOUNTANT` / `ACTIVE`
- Worker memberships are created from the two line worker pools below
- Org `TSBR`
- `brand-admin@test.local` -> `ADMIN` / `ACTIVE`
- `brand-operator@test.local` -> `OPERATOR` / `ACTIVE`
- `brand-accountant@test.local` -> `ACCOUNTANT` / `ACTIVE`

## Employees (TSMF only)

Non-worker staff:

- `Manager` (membership: `manufacturer-admin@test.local`)
- `Operator` (membership: `manufacturer-operator@test.local`)
- `Accountant` (membership: `manufacturer-accountant@test.local`)

Workers:

- Total baseline workers: `40`
- All baseline workers belong to factory `Sample Factory`
- `Sample Line 1`: `20` workers
- `Sample Line 2`: `20` workers
- Each line manager is the `01` worker of that line

Worker account patterns:

- `line1-worker01@baro.local` -> `Line1 Worker 01`
- `line1-worker02@baro.local` -> `Line1 Worker 02`
- ...
- `line1-worker20@baro.local` -> `Line1 Worker 20`
- `line2-worker01@baro.local` -> `Line2 Worker 01`
- `line2-worker02@baro.local` -> `Line2 Worker 02`
- ...
- `line2-worker20@baro.local` -> `Line2 Worker 20`

## Factory and Line

- Factory: `Sample Factory` (org: `TSMF`)
- Target monthly wage: `8,000,000 VND`
- Wage per second (derived): `10.68 VND/sec` (26 days/month, 8 hours/day)
- Line: `Sample Line 1` (factory: `Sample Factory`)
- Line: `Sample Line 2` (factory: `Sample Factory`)
- Baseline headcount: `20 workers per line`, `40 workers total`

## Line Assignments (reset baseline)

Reset closes existing active `LineAssignment` rows for baseline workers and then
recreates the active assignments below.

- `Sample Line 1`: `line1-worker01@baro.local` ... `line1-worker20@baro.local`
- `Sample Line 2`: `line2-worker01@baro.local` ... `line2-worker20@baro.local`
- `Line.managerEmployeeId` points to `line1-worker01` for line 1 and
  `line2-worker01` for line 2

## Attributes (TSMF only)

Colors:

- `WHITE` -> `White`
- `BLACK` -> `Black`
- `NAVY` -> `Navy`
- `GRAY-MEL` -> `Gray Melange`
- `LT-BLUE` -> `Light Blue`
- `MID-BLUE` -> `Mid Blue`
- `INDIGO` -> `Indigo`

Processes:

- `P01` -> `Test Process 01`
- `P02` -> `Test Process 02`
- `P03` -> `Test Process 03`
- `P04` -> `Test Process 04`
- `P05` -> `Test Process 05`
- `P06` -> `Test Process 06`
- `P07` -> `Test Process 07`
- `P08` -> `Test Process 08`
- `P09` -> `Test Process 09`
- `P10` -> `Test Process 10`

## Styles (TSMF, reset baseline)

Baseline styles:

- `S-2025SS-T001` / `25SS-T001` / `Daily Round T-Shirt`
  season `2025SS`, collection `Basic Line`, `8` processes, total PT `3,500`
- `S-2025SS-P002` / `25SS-P002` / `Slim Collar Hero Polo`
  season `2025SS`, collection `Sport Casual`, `9` processes, total PT `4,400`
- `S-2025FW-J003` / `25FW-J003` / `Urban Corduroy Pants`
  season `2025FW`, collection `Urban Premium`, `10` processes, total PT `6,000`

## Work Orders (reset baseline)

Baseline work orders:

- `ORD-2025SS-001`
  status `ORDER_RECEIVED`, total quantity `5,000`
  includes `Daily Round T-Shirt` and `Slim Collar Hero Polo`
- `ORD-2025FW-001`
  status `ORDER_RECEIVED`, total quantity `2,500`
  includes `Urban Corduroy Pants`

## Assignment Seed

- Reset rebuilds baseline assignment board cards and agreed assignment plans.
- Baseline assignment schedules are split across `Sample Line 1` and
  `Sample Line 2`.
- Headcount assumption for those schedules is `20 workers per line`.

## Notes

- If future changes are intended as a new reset target, update this file first.
- Reset scripts should be implemented to match this baseline exactly.
- This baseline is a living snapshot and should be updated continuously as
  agreed test defaults change.
