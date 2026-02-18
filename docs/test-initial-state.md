# Test Initial State (Baseline)

This file is the source-of-truth snapshot for the test reset target.

## Baseline ID

- `test-baseline-v1.3`
- Captured on: `2026-02-18`

## Rules

- Roles are hardcoded and resolved from `OrgMembership.role`.
- Line assignment candidates must be `WORKER` only.
- System admin account is not part of reset deletion.
- `System Settings > Subscription Management` is visible only for
  `entryType=SYSTEM` + `systemRole=SYSTEM_ADMIN`.
- Org bypass accounts (`ADMIN`, `OPERATOR`, `ACCOUNTANT`, `WORKER`) must not
  see `Subscription Management`.

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
- `manufacturer-worker@test.local` -> `WORKER` / `ACTIVE`
- Org `TSBR`
- `brand-admin@test.local` -> `ADMIN` / `ACTIVE`
- `brand-operator@test.local` -> `OPERATOR` / `ACTIVE`
- `brand-accountant@test.local` -> `ACCOUNTANT` / `ACTIVE`

## Employees (TSMF only)

- `Test Worker` (membership: `manufacturer-worker@test.local`)
- `Test Admin` (membership: `manufacturer-admin@test.local`)
- `Test Operator` (membership: `manufacturer-operator@test.local`)
- `Test Accountant` (membership: `manufacturer-accountant@test.local`)

All four employees are assigned to the same factory below.

## Factory and Line

- Factory: `Sample Factory` (org: `TSMF`)
- Target monthly wage: `8,000,000 VND`
- Wage per second (derived): `10.68 VND/sec` (26 days/month, 8 hours/day)
- Line: `Sample Line` (factory: `Sample Factory`)
- Line manager: `Test Worker`
- Active line assignment: `Test Worker` -> `Sample Line`

## Attributes (TSMF only)

- Processes are reset to exactly 10 rows below:
- `P01` -> `테스트 공정 01`
- `P02` -> `테스트 공정 02`
- `P03` -> `테스트 공정 03`
- `P04` -> `테스트 공정 04`
- `P05` -> `테스트 공정 05`
- `P06` -> `테스트 공정 06`
- `P07` -> `테스트 공정 07`
- `P08` -> `테스트 공정 08`
- `P09` -> `테스트 공정 09`
- `P10` -> `테스트 공정 10`

## Notes

- If future changes are intended as a new reset target, update this file first.
- Reset scripts should be implemented to match this baseline exactly.
- This baseline is a living snapshot and should be updated continuously as
  agreed test defaults change.
