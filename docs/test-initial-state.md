# Test Initial State (Baseline)

This file is the source-of-truth snapshot for the test reset target.

## Baseline ID

- `test-baseline-v1.1`
- Captured on: `2026-02-18`

## Rules

- Roles are hardcoded and resolved from `OrgMembership.role`.
- Line assignment candidates must be `WORKER` only.
- System admin account is not part of reset deletion.
- `System Settings > Membership Management` is visible only for
  `entryType=SYSTEM` + `systemRole=SYSTEM_ADMIN`.
- Org bypass accounts (`ADMIN`, `OPERATOR`, `ACCOUNTANT`, `WORKER`) must not
  see `Membership Management`.

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
- Line: `Sample Line` (factory: `Sample Factory`)
- Line manager: `Test Worker`
- Active line assignment: `Test Worker` -> `Sample Line`

## Notes

- If future changes are intended as a new reset target, update this file first.
- Reset scripts should be implemented to match this baseline exactly.
- This baseline is a living snapshot and should be updated continuously as
  agreed test defaults change.
