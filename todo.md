# TODO - FK column cleanup

---

## 2026-07-01 WorkRecord styleId / styleProcessId 데이터 유실 조사

FK 도입 이전에 저장된 WorkRecord 행에서 styleId가 비어있는 걸 사용자가 발견해서 조사함.

### 원인
- `backend/migration_fix.sql:807-820`: `WorkRecord.styleId`는 `styleUid IS NOT NULL`일 때만 백필. FK 도입 이전 대량 입력분은 `styleUid`도 없이 `styleName`/`styleCode` 텍스트만 갖고 있었음.
- `migration_fix.sql:822-833`: 그 텍스트 컬럼(`styleName`, `processId`, `processCode`, `processName`)을 백필 시도나 검증 없이 그대로 DROP함.
- 결과: FK 도입 이전 WorkRecord 행은 `styleId`, `styleProcessId`가 DB에서 복구 불가능한 상태로 영구 NULL.
- `assignmentPlanId` NULL은 이 건과 별개로, AGENTS.md에 이미 "orphan WorkRecord"로 문서화된 알려진 구조적 상태.
- 근본 원인: AGENTS.md에 명시된 "백필 → 신규 저장 차단 → 참조 제거 → 검증 → DROP" 순서 중 백필/검증 단계 없이 바로 DROP함.

### 영향
- `정확 계산 원칙`에 따라 이 행들은 fallback 없이 계산에서 제외됨 (숫자 오염은 아님).
- 다만 해당 기간 작업기록이 AT 학습/진행률/스케줄러 남은작업량 집계에서 조용히 빠짐.

### 재업로드로 복구되는지 여부 (별도 확인 완료)
- `POST /work-logs/import` (`index.ts:22769-22787`)는 그룹마다 무조건 `workLog.create` + `workRecord.createMany`를 실행하며, 같은 기간/작업자의 기존 WorkLog를 찾아 업데이트하는 로직이 없음.
- 즉 같은 파일을 재업로드하면 기존 null 행은 그대로 남고 완전히 새 WorkLog+WorkRecord가 추가됨 (중복 생성, 채워지는 게 아님).

## 사용자가 결정/실행해야 할 일

- [ ] 4~5월 초기 대량 입력에 썼던 원본 엑셀/CSV가 남아있는지 확인. 있으면 원본 기준으로 별도 backfill 스크립트 작성 가능(재업로드 아님, 기존 행에 styleId/styleProcessId만 채우는 방식). 없으면 해당 기간 연결은 영구 유실로 받아들여야 함.
- [ ] 영향 범위(몇 건이 styleId/styleProcessId null인지) 파악 필요. `backend/.env`의 `DATABASE_URL`은 Supabase를 가리키고 있어 실제 운영 DB(Railway Postgres)가 아니므로 여기서 조회하지 않았음. Railway 콘솔에서 실제 운영 `DATABASE_URL`을 가져와 `node backend/scripts/inspect-workrecord-state.js`를 직접 실행해서 확인할 것.
- [ ] 유실분을 복구 시도할지, 그냥 레거시 미연결 데이터로 받아들이고 넘어갈지 결정.
- [ ] (선택) 앞으로 같은 사고를 막으려면 DROP COLUMN 전에 "대상 컬럼이 이미 canonical FK로 대체 가능한지" 검증하는 스크립트를 만들어 마이그레이션 배포 전에 강제할지 결정.

---

## 2026-07-01 Railway 배포 실패 원인 기록

Codex 리팩토링 이후 최근 3개 커밋의 DB 마이그레이션이 프로덕션에 전혀 적용되지 않은 상태에서, 새 배포마다 서버가 시작되지 않고 헬스체크 실패가 반복됐다. 원인은 4가지가 순서대로 겹쳐 있었다.

### 원인 1: preDeployCommand 포맷 오류 (커밋 af26c9d)
- `railway.json`의 `preDeployCommand`가 배열(`["npm run railway:predeploy"]`)로 설정돼 있었다.
- Railway는 배열 포맷을 무시하고 pre-deploy를 실행하지 않는다.
- 결과: migration_fix.sql이 배포 전에 전혀 실행되지 않았다.
- 수정: 문자열 `"npm run railway:predeploy"`로 변경.

### 원인 2: start 커맨드에서 마이그레이션 실행 (커밋 af26c9d, 4d63bc9로 복구)
- 같은 커밋에서 `start` 스크립트가 `npm run railway:startup && node dist/index.js`로 변경됐다.
- 마이그레이션이 실패하면 서버 자체가 시작되지 않아 헬스체크 타임아웃 → Railway가 구 버전 유지.
- 결과: 구 배포가 계속 살아남아 겉으로는 "정상"처럼 보였다.
- 수정: `start`를 `node dist/index.js`로 복구하고, 마이그레이션은 `ensureRuntimeSchemaReady()`에서 서버 시작 전에 처리.

### 원인 3: PostgreSQL enum 트랜잭션 제한 (커밋 e1b2206로 수정)
- `migration_fix.sql` Step 0h-2에서 두 SQL이 하나의 트랜잭션 안에 있었다:
  ```sql
  ALTER TYPE "WorkOrderStatus" ADD VALUE IF NOT EXISTS 'EDITING';
  ALTER TABLE "WorkOrder" ALTER COLUMN "status" SET DEFAULT 'EDITING'::"WorkOrderStatus";
  ```
- PostgreSQL 제한: `ALTER TYPE ADD VALUE`로 추가한 enum 값은 **같은 트랜잭션 안에서 바로 사용할 수 없다**. 먼저 커밋돼야 한다.
- `prisma db execute`는 SQL 파일 전체를 단일 트랜잭션으로 실행하므로 SET DEFAULT가 항상 실패했다.
- 에러: `ERROR: unsafe use of new value "EDITING" of enum type "WorkOrderStatus" HINT: New enum values must be committed before they can be used.`
- 수정: `SET DEFAULT` 줄을 migration_fix.sql에서 제거하고, 마이그레이션 커밋 후 별도 트랜잭션인 `ensureWorkOrderStatusSchemaReady()` 안에서 `prisma.$executeRaw`로 처리.
- 추가 수정: `findRuntimeSchemaDriftReasons()`에서 `WorkOrder.status default EDITING` 체크도 제거 (SET DEFAULT는 별도 함수에서 처리하므로 drift 체크 대상이 아님).

### 원인 4: migration_fix.sql의 RAISE EXCEPTION 가드 — 레거시·신규 컬럼 동시 존재 (커밋 2ff14ef로 수정)
- Codex 리팩토링 중 신규 컬럼(`code`, `styleId` 등)이 추가됐지만 레거시 컬럼(`styleCode`, `styleUid` 등)은 프로덕션 DB에 그대로 남아 있었다.
- migration_fix.sql은 두 컬럼이 동시에 존재하고 값이 다를 경우 `RAISE EXCEPTION ... resolve manually`로 중단하도록 설계돼 있었다.
- 실제로 발생한 케이스 (5개):
  - `Style.styleCode` vs `Style.code`
  - `StyleProcess.styleUid` vs `StyleProcess.styleId`
  - `AtTrainingBucketProcess.styleUid` vs `AtTrainingBucketProcess.styleId`
  - `WorkOrderItem.styleUid` vs `WorkOrderItem.styleId`
  - `WorkRecord.styleUid` vs `WorkRecord.styleId`
- 수정: RAISE EXCEPTION 대신 자동 해결로 변경.
  - `code`/`styleId`는 현재 앱이 읽는 canonical 컬럼이므로 값을 유지.
  - 레거시 컬럼이 null인 row에만 레거시 값을 복사한 뒤 레거시 컬럼 DROP.

### 원인 5: migration_fix.sql DROP 목록 누락 (커밋 309af3a로 수정)
- 마이그레이션이 성공적으로 실행(`Script executed successfully`)됐지만 서버가 여전히 시작되지 않았다.
- 에러: `migration_fix.sql completed but required DB schema updates are still missing: WorkRecord.workerName still present, WorkRecord.orderNo still present`
- drift 체크가 금지 컬럼으로 등록한 `WorkRecord.workerName`과 `WorkRecord.orderNo`가 migration_fix.sql의 DROP COLUMN 목록에서 빠져 있었다.
- 수정: 두 컬럼을 WorkRecord DROP 목록에 추가.

### 교훈
- `ensureRuntimeSchemaReady()`의 금지 컬럼 목록(`STARTUP_FORBIDDEN_RUNTIME_COLUMNS` 또는 drift 체크)과 migration_fix.sql의 DROP 목록은 항상 같이 관리해야 한다. 하나에 추가하면 반드시 다른 쪽에도 반영.
- PostgreSQL에서 `ALTER TYPE ADD VALUE`와 해당 새 값의 사용(SET DEFAULT, INSERT 등)은 반드시 별개 트랜잭션으로 분리해야 한다.
- Railway `preDeployCommand`는 반드시 문자열이어야 한다. 배열 포맷은 무시된다.

---

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
- Stop storing `WorkOrder.buyerOrgName`, localized buyer names, `sellerOrgName`, and `customerName`; derive them from `buyerOrgId`, `sellerOrgId`, and `customerId`.
- Stop storing `WorkOrderItem.colorCode`; derive it from `colorId -> AttrColor`.
- Stop storing `WorkLog.factoryName`; derive it from `factoryId -> Factory`.
- Add `WorkRecord.lineId -> Line.id` FK relation.

## 남은 작업 (FK 리팩토링 후속)

### 단기 (다음 배포 전 확인)
- [ ] Railway 배포 성공 후 migration_fix.sql 로그에서 아래 확인:
  - `AtTrainingBucket_sourceWorkLogId_fkey` FK constraint 생성됨
  - `AtTrainingBucket_factoryId_fkey` FK constraint 생성됨
  - `AtTrainingBucket_factoryId_idx` 인덱스 생성됨

### 중기 (알려진 구조적 한계, 우선순위 낮음)
- [ ] `WorkLog.records` JSON 안에 `lineId`가 비정규화로 저장됨 (DB FK 없음)
  - 원인: WorkLog 저장 시 records JSON을 그대로 저장하는 구조
  - 영향: WorkLog에서 lineId로 DB JOIN 불가
  - 해결 방향: WorkLog에 lineId 컬럼 추가하거나 현 구조 유지 결정 필요
- [ ] `AssignmentPlan`에 텍스트 스냅샷 필드가 FK와 함께 존재 (의도적 비정규화)
  - `orderNo`, `customer`, `colorName`, `color` — 보드 렌더 캐시용
  - FK(`workOrderId`, `colorId`)가 있으므로 JOIN 가능하지만 텍스트 복사본이 stale해질 수 있음
  - 해결 방향: 보드 저장 시 FK 기준으로 텍스트 필드도 항상 동기화하거나 제거 결정 필요

### 완료됨
- [x] Employee.lineName → lineId FK (완료)
- [x] WorkRecord.workerName/orderNo/etc. 레거시 컬럼 제거 (완료)
- [x] WorkOrder buyerOrgName/sellerOrgName/customerName → FK (완료)
- [x] WorkOrderItem colorCode/styleName/styleCode → FK (완료)
- [x] WorkLog.factoryName → factoryId FK (완료)
- [x] StyleProcess.styleUid → styleId FK (완료)
- [x] WorkRecord.lineId FK 추가됨 (Codex가 추가, 이전엔 없었음)
- [x] AtTrainingBucket.sourceWorkLogId → WorkLog FK 추가 (2026-07-01)
- [x] AtTrainingBucket.factoryId → Factory FK 추가 (2026-07-01)

## Check on production DB after deploy

- Railway deploy log shows `migration_fix.sql` applied.
- `Employee` has no `lineName` column and has `lineId` FK.
- `Style` has no `uid`, `styleId`, `customer`, `customerNameKo`, or `customerNameVi` columns.
- `WorkRecord` has no `workerName`, `customerName`, `styleUid`, `styleName`, `processId`, `processCode`, `colorId`, or `colorCode` columns.
- `WorkOrder` has no `buyerOrgName`, `buyerOrgNameKo`, `buyerOrgNameVi`, `sellerOrgName`, or `customerName` columns.
- `WorkOrderItem` has no `colorCode` column.
- `WorkLog` has no `factoryName` column.
- `WorkRecord.lineId` has FK constraint to `Line.id`.
- If legacy `Employee.lineName` cannot map to exactly one `Line.name`, migration fails; set the affected `Employee.lineId` manually and rerun.
- If legacy `WorkOrder` org names, `WorkOrderItem.colorCode`, or `WorkLog.factoryName` cannot map to exactly one FK target, migration fails; set the affected FK manually and rerun.

## Verified

- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`
- `node --check backend/scripts/reset-to-baseline.js`
- `node --check backend/scripts/inspect-workrecord-state.js`
- `node --check backend/scripts/normalize-process-master-names.js`
- `node --check backend/scripts/verify-snapshot-st-backfill.js`

---

## 2026-07-01 Factory management start date and business UI

### Done
- Added `Factory.nameKo`, `Factory.nameVi`, and `Factory.managementStartDate`.
- Added `Organization.nameKo` and `Organization.nameVi`.
- Updated `migration_fix.sql` to backfill existing factory `managementStartDate` values to `2026-04-01`.
- Switched work log / work history / production analysis minimum-date guards from the BARO-only hardcoded date to factory-scoped management start dates.
- Reworked business and customer basic-info forms to group related fields and support Korean/Vietnamese inputs.

### Remaining
- Recheck whether the global assignment board should keep using the earliest factory management start date or move to a stricter per-factory rule.
- Remove the hidden legacy basic-info block in `frontend/src/pages/App/customer/CustomerDetail.jsx` once the new panel is fully settled.

### Verify
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`
- Create/update organization and factory records and confirm localized names persist.
- Change a factory `managementStartDate` and confirm selected-factory date pickers clamp correctly in work history and production analysis screens.
