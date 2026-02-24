# Test Initial State (Baseline)

This file is the source-of-truth snapshot for the test reset target.

## Baseline ID

- `test-baseline-v1.7`
- Captured on: `2026-02-24`

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

Non-worker staff:

- `테스트 관리자` (membership: `manufacturer-admin@test.local`)
- `테스트 운영자` (membership: `manufacturer-operator@test.local`)
- `테스트 회계담당` (membership: `manufacturer-accountant@test.local`)

Workers (20명, all assigned to `샘플 공장`):

| # | Name | Email |
|---|------|-------|
| 01 | `테스트 작업자 01` | `manufacturer-worker@test.local` |
| 02 | `테스트 작업자 02` | `sample-line-worker-01@test.local` |
| 03 | `테스트 작업자 03` | `sample-line-worker-02@test.local` |
| 04 | `테스트 작업자 04` | `sample-line-worker-03@test.local` |
| 05 | `테스트 작업자 05` | `sample-line-worker-04@test.local` |
| 06 | `테스트 작업자 06` | `sample-line-worker-05@test.local` |
| 07 | `테스트 작업자 07` | `sample-line-worker-06@test.local` |
| 08 | `테스트 작업자 08` | `sample-line-worker-07@test.local` |
| 09 | `테스트 작업자 09` | `sample-line-worker-08@test.local` |
| 10 | `테스트 작업자 10` | `test-worker-10@test.local` |
| 11 | `테스트 작업자 11` | `test-worker-11@test.local` |
| 12 | `테스트 작업자 12` | `test-worker-12@test.local` |
| 13 | `테스트 작업자 13` | `test-worker-13@test.local` |
| 14 | `테스트 작업자 14` | `test-worker-14@test.local` |
| 15 | `테스트 작업자 15` | `test-worker-15@test.local` |
| 16 | `테스트 작업자 16` | `test-worker-16@test.local` |
| 17 | `테스트 작업자 17` | `test-worker-17@test.local` |
| 18 | `테스트 작업자 18` | `test-worker-18@test.local` |
| 19 | `테스트 작업자 19` | `test-worker-19@test.local` |
| 20 | `테스트 작업자 20` | `test-worker-20@test.local` |

## Factory and Line

- Factory: `샘플 공장` (org: `TSMF`)
- Target monthly wage: `8,000,000 VND`
- Wage per second (derived): `10.68 VND/sec` (26 days/month, 8 hours/day)
- Line: `샘플 라인 1` (factory: `샘플 공장`)
- Line: `샘플 라인 2` (factory: `샘플 공장`)

## Line Assignments (초기화 시 자동 재설정)

Reset 실행 시 기존 모든 LineAssignment를 종료(endAt 설정)하고 아래와 같이 재배정한다.

- `샘플 라인 1`: 작업자 01~10 (10명)
- `샘플 라인 2`: 작업자 11~20 (10명)

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

## Styles (TSMF, 초기화 시 자동 생성)

Reset 실행 시 기존 Style을 전부 삭제하고 아래 2개 샘플 스타일을 새로 생성한다.

### 샘플 스타일 A

- `styleId`: `S-SAMPLE-A`
- `styleCode`: `SA-001`
- `name`: `샘플 스타일 A`
- `customer`: TSBR 브랜드 조직명 (런타임 조회)
- `season`: `2025SS` / `collection`: `샘플 컬렉션`
- `registrationDate`: `2025-01-01`
- 공정 6개, `timeRefQuantity=1000`, PT 합계 **5,000초**

| code | name         |  PT (초) |
|------|--------------|----------|
| P01  | 테스트 공정 01 |    950 |
| P02  | 테스트 공정 02 |    900 |
| P03  | 테스트 공정 03 |    850 |
| P04  | 테스트 공정 04 |    800 |
| P05  | 테스트 공정 05 |    750 |
| P06  | 테스트 공정 06 |    750 |
| **합계** |            | **5,000** |

### 샘플 스타일 B

- `styleId`: `S-SAMPLE-B`
- `styleCode`: `SB-001`
- `name`: `샘플 스타일 B`
- `customer`: TSBR 브랜드 조직명 (런타임 조회)
- `season`: `2025SS` / `collection`: `샘플 컬렉션`
- `registrationDate`: `2025-01-01`
- 공정 7개, `timeRefQuantity=1000`, PT 합계 **7,000초**

| code | name         |  PT (초) |
|------|--------------|----------|
| P01  | 테스트 공정 01 |  1,100 |
| P02  | 테스트 공정 02 |  1,050 |
| P03  | 테스트 공정 03 |  1,000 |
| P04  | 테스트 공정 04 |  1,000 |
| P05  | 테스트 공정 05 |  1,000 |
| P06  | 테스트 공정 06 |    950 |
| P07  | 테스트 공정 07 |    900 |
| **합계** |            | **7,000** |

## Work Orders (초기화 시 자동 생성)

Reset 실행 시 기존 WorkOrder를 전부 삭제하고 아래 2개 샘플 주문을 새로 생성한다.

### 사이즈 분포 기준표

| Size | 375개 | 350개 | 250개 |
|------|------:|------:|------:|
| XS   |    25 |    25 |    15 |
| S    |    50 |    45 |    35 |
| M    |   100 |    90 |    70 |
| L    |   125 |   110 |    85 |
| XL   |    50 |    55 |    30 |
| 2XL  |    25 |    25 |    15 |
| **합계** | **375** | **350** | **250** |

### ORD-2025-SA (샘플 스타일 A 주문)

- `orderId`: `order-baseline-sa`
- `orderNumber`: `ORD-2025-SA`
- `dueDate`: `2025-06-30`
- `status`: `주문접수`
- buyer: TSBR / seller: TSMF
- 총 수량: 1,500개 (375 × 4 조합)

| 성별 | 색상 | 수량 |
|------|------|------|
| M    | BLK (Black) | 375 |
| M    | WHT (White) | 375 |
| W    | BLK (Black) | 375 |
| W    | WHT (White) | 375 |

### ORD-2025-SB (샘플 스타일 B 주문)

- `orderId`: `order-baseline-sb`
- `orderNumber`: `ORD-2025-SB`
- `dueDate`: `2025-07-31`
- `status`: `주문접수`
- buyer: TSBR / seller: TSMF
- 총 수량: 1,500개 (375 × 4 조합)

| 성별 | 색상 | 수량 |
|------|------|------|
| M    | BLK (Black) | 375 |
| M    | RED (Red)   | 375 |
| W    | WHT (White) | 375 |
| W    | BLU (Blue)  | 375 |

### ORD-2025-MIX (혼합 주문 — 스타일 A+B)

- `orderId`: `order-baseline-mix`
- `orderNumber`: `ORD-2025-MIX`
- `dueDate`: `2025-08-31`
- `status`: `주문접수`
- buyer: TSBR / seller: TSMF
- 총 수량: 1,200개 (250×2 + 350×2)

| 스타일 | 성별 | 색상 | 수량 |
|--------|------|------|------|
| A (SA-001) | M | RED (Red)   | 250 |
| A (SA-001) | W | BLU (Blue)  | 250 |
| B (SB-001) | M | WHT (White) | 350 |
| B (SB-001) | W | BLK (Black) | 350 |

## Notes

- If future changes are intended as a new reset target, update this file first.
- Reset scripts should be implemented to match this baseline exactly.
- This baseline is a living snapshot and should be updated continuously as
  agreed test defaults change.
