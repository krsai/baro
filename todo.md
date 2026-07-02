# TODO - FK column cleanup

---

## 2026-07-02 Assignment board JSON dual-write removal

### Done
- `AssignmentCard` and `AssignmentPlan` are now the canonical board stores.
- `GET /assignment-board-state`, `/assignment-board-view`, `/assignment-board-versions`, and `/assignment-plans` assemble board assignments from `AssignmentPlan` rows instead of `AssignmentBoardState.assignments`.
- `PUT /assignment-board-state` updates cards/plans in one transaction and stores `AssignmentBoardState.cards/assignments` as `Prisma.JsonNull` metadata only.
- Board assignment delete/reset and order unlock paths no longer update assignment JSON.
- Payroll locked assignments preserve persisted coordinates during board save, and invalid `startIndex`/`endIndex` is rejected.
- Added `migration_fix.sql` diagnostics for legacy JSON rows missing relation rows.

### Verify
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`

### Remaining
- After deployment, inspect migration warnings for legacy `AssignmentBoardState.cards/assignments` rows missing `AssignmentCard`/`AssignmentPlan`.
- Physically drop `AssignmentBoardState.cards/assignments` only after relation backfill verification is clean.

---

## 2026-07-02 WorkOrder/Style JSON 제거 2차 후속 수정 (f76b2cd 코드리뷰 반영)

### Done
1. **`PUT /styles/:styleId`가 여전히 레거시 seed를 먼저 지울 수 있었음** — `processesProvided=false`여도 `tx.style.update`가 `processes: Prisma.JsonNull`을 무조건 실행해서, `Style.processes` JSON은 있고 `StyleProcess` relation은 없는 레거시 스타일을 이름만 고쳐도 유일한 백필 seed가 지워질 뻔했음. `processesProvided=false`일 때 같은 트랜잭션 안에서 `ensureStyleProcessStorageForStyles([existing], { processOrgId, db: tx })`로 먼저 자가치유 백필을 실행한 뒤에 JSON을 비우도록 순서 변경. 백필 실패 시 트랜잭션 롤백되어 JSON은 지워지지 않음.
2. **`verify-style-process-backfill.js`가 부분 불일치를 놓쳤음** — "StyleProcess 0개"만 확인하던 것을 `jsonb_array_length(processes) <> COUNT(StyleProcess)` 비교로 교체 (JSON 5개/relation 3개 같은 부분 불일치도 잡음). 출력에 styleId/orgId/code/name/jsonProcessCount/relationProcessCount 샘플 추가. PASS 문구를 "count 비교만으로는 완전한 검증 아님, 최종 수동 리뷰 권장"으로 보수적으로 변경.
3. **`jsonb_array_elements`/`jsonb_array_length`가 비배열 JSON에 안전하지 않았음** — `migration_fix.sql`의 `CROSS JOIN LATERAL jsonb_array_elements(w."items"::jsonb)`는 WHERE의 `jsonb_typeof = 'array'` 필터와 무관하게 FROM/JOIN 단계에서 먼저 평가되므로, 비배열 `items`가 있으면 WHERE 도달 전에 에러가 날 수 있었음(Postgres AND 평가 순서도 보장 안 됨). `jsonb_array_elements`/`jsonb_array_length` 호출 인자를 전부 `CASE WHEN jsonb_typeof(...)='array' THEN ... ELSE '[]'::jsonb END`로 감싸서, 함수가 항상 안전하게 배열만 받도록 수정 (`migration_fix.sql` Step 0d-5 INSERT/진단 블록, `verify-workorder-item-backfill.js`, `verify-style-process-backfill.js` 전부 동일 패턴 적용).

### Verify
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`
- `node --check backend/scripts/verify-workorder-item-backfill.js`
- `node --check backend/scripts/verify-style-process-backfill.js`

### Remaining
- 여전히 운영 DB 접근 권한이 없어 이 환경에서 실제 SQL 실행/verify 스크립트 실행은 못 함. 배포 후 Railway DB 대상으로 두 verify 스크립트 실행해 0 확인 전까지 `WorkOrder.items`/`Style.processes` 컬럼 DROP 금지 — 위 섹션과 동일.

---

## 2026-07-02 WorkOrder/Style JSON 제거 후속 수정 (코드리뷰 반영)

바로 아래 "WorkOrder.items / Style.processes JSON 이중 저장 제거" 커밋(c3af0df)을 리뷰받아 발견된 실질적 누락 4건을 수정.

### Done
1. **WorkOrder.items 신규 쓰기가 실제로는 안 끊겨 있었음** — `createOrReuseSharedOrder`(주문 생성)와 `PUT /orders/:orderId`(주문 수정)가 `data: { ...normalized }` 스프레드로 `normalizeOrderPayload()`가 만든 `items` 필드를 그대로 `WorkOrder.items` JSON 컬럼에 쓰고 있었음. 두 곳 모두 `items`를 destructure로 빼고 `items: Prisma.JsonNull`을 명시.
2. **`PUT /styles/:styleId`가 processes 누락 시 기존 StyleProcess를 삭제할 수 있었음** — `processes: req.body?.processes ?? existing.processes`가 이전 커밋에서 `existing.processes`가 항상 `null`이 되도록 바뀐 것과 충돌해, 이름만 고쳐도 기존 공정이 전부 삭제될 뻔했음. `req.body.processes !== undefined`일 때만 관계형 sync를 실행하도록 수정(`processesProvided` 플래그). 누락 시에는 기존 `StyleProcess`/`StyleProcessStandard`를 건드리지 않음.
3. **`syncStyleProcessNamesFromMaster`가 여전히 `Style.processes` JSON을 읽고 되쓰고 있었음** — 공정 마스터 이름 변경 시 `StyleProcess.processName` 갱신은 유지하고, `Style.processes` JSON을 순회하며 되쓰던 블록 전체 제거. 반환값 `updatedStyleCount`는 항상 0(호출부에서 미사용 확인).
4. **WorkOrderItem 백필 검증이 부분 불일치를 놓쳤음** — `verify-workorder-item-backfill.js`가 "관계형 행 0개"만 확인해서 JSON 3개/relation 1개 같은 부분 불일치는 PASS로 처리될 수 있었음. `jsonb_array_length(items) <> COUNT(WorkOrderItem)` 비교로 교체해 부분 불일치도 잡도록 수정. `migration_fix.sql`에도 백필 후 남은 불일치 건수를 `RAISE NOTICE`로 남기는 진단 블록 추가(자동 수정은 안 함 — 부분 불일치는 이름/코드 재탐색 없이 안전하게 자동 병합할 방법이 없음).

### Verify
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`
- `node --check backend/scripts/verify-workorder-item-backfill.js`
- `node --check backend/scripts/verify-style-process-backfill.js`

### Remaining
- 아래 섹션의 "Remaining (배포 전 필수)"와 동일 — 운영 DB에 대해 두 verify 스크립트를 실행해 0 확인 전까지 컬럼 DROP 금지.

---

## 2026-07-02 WorkOrder.items / Style.processes JSON 이중 저장 제거

### Done
- `Style.processes` 저장 3곳(`POST /styles`, `PUT /styles/:styleId`, `POST /styles/import`)에서 JSON에 더 이상 쓰지 않음(`Prisma.JsonNull`). 관계형 쓰기(`syncStyleProcessStorageForStyle`)는 그대로 유지.
- AT 학습 파이프라인이 `StyleProcess.atParams`를 다시 `Style.processes` JSON에 되써넣던 역방향 동기화 블록 제거.
- `WorkOrder.items`/`Style.processes` 읽기 fallback 전부 제거: `toOrderResponse`, 주문→배정카드 빌더, `collectStyleQuantityRequirementsFromOrders`, `findOrderItemByAssignmentIdentity`, `toStyleResponse`, 카드 빌더의 `stylesWithProcesses`/`hydratedStyles` 두 곳. 전부 relation-only로 전환(비면 빈 배열).
- `resolveWorkLogRecordResponses`의 `records.rows`/`records` 2단계 JSON fallback 제거 (WorkRecord relation만 읽음). `WorkLog.records`는 원래 레코드 데이터를 복제한 적이 없고 `{lineId,lineName}` 헤더 메타데이터만 저장하는 것으로 확인됨 — 별도 스키마 변경 없음.
- **부수 발견 및 수정**: `PUT /orders/:orderId`의 부분 업데이트가 누락 필드를 `existing`으로 채우는데 `items`만 `existing.items`(JSON, relation include 안 됨)를 읽고 있었음. JSON 쓰기를 끊으면 `items` 없는 저장 요청마다 기존 주문 품목이 삭제될 뻔했음. `existing` 조회에 `workOrderItems` relation 추가 + fallback을 relation 기반으로 변경.
- `migration_fix.sql`에 `Step 0d-5`로 `WorkOrderItem` 백필 SQL 추가 (JSON에 항목이 있는데 관계형 행이 0개인 주문만 대상, idempotent).
- `Style.processes → StyleProcess` 백필은 raw SQL로 새로 만들지 않음 — processCode 다단계 fallback/로컬라이즈드 이름 합성이 복잡해 잘못 재구현하면 데이터가 틀어질 위험이 큼. 기존 자가치유 함수(`ensureStyleProcessStorageForStyles`)를 백필 메커니즘으로 그대로 유지 (JSON을 시드로 관계형 행을 영구히 다시 쓰는 1회성 로직이라 매 요청 조용한 fallback과는 다름).
- 신규 스크립트: `backend/scripts/verify-workorder-item-backfill.js`(실제 검증), `backend/scripts/verify-style-process-backfill.js`(진단 전용), `backend/package.json`에 `verify:workorder-item-backfill`/`verify:style-process-backfill` 등록.
- `backend/prisma/schema.prisma`: `WorkOrder.items`, `Style.processes`, `WorkLog.records`에 상태 설명 doc comment 추가. 컬럼은 유지(DROP 안 함).
- `AGENTS.md` "DB 설계 원칙" 표 및 §38 갱신.

### Verify
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`

### Remaining (배포 전 필수)
- 이 개발 환경에는 운영 `DATABASE_URL` 접근 권한이 없어 아래를 로컬에서 실행하지 못했음. **운영 배포 후 반드시 Railway DB를 대상으로 실행**:
  - `npm --prefix backend run verify:workorder-item-backfill` → 0이어야 함 (0이 아니면 `migration_fix.sql`이 아직 적용 안 된 것이거나 재확인 필요).
  - `npm --prefix backend run verify:style-process-backfill` → 0이 아니어도 실패 아님. 보고된 styleId들에 대해 `GET /styles?includeProcesses=1`을 한 번 호출하거나 스타일 편집 화면에서 재저장하면 자가치유 백필이 실행됨. 전부 0이 될 때까지 반복 확인.
- 두 verify가 모두 0을 보고하면, `WorkOrder.items`/`Style.processes` 컬럼 물리 DROP은 **별도 후속 커밋**으로 진행한다 (이번 커밋에는 DROP 없음 — todo.md 2026-07-01 WorkRecord styleId 유실 사고 재발 방지).
- `AssignmentBoardState.cards`/`assignments` JSON ↔ `AssignmentCard`/`AssignmentPlan` 이중 저장은 2026-07-02 Assignment board JSON dual-write removal에서 relation canonical으로 전환함. 물리 DROP은 backfill 진단 확인 뒤 별도 진행.

---

## 2026-07-02 syncWorkRecordRefs 멀티테넌시 필터 누락 수정

### Done
- `backend/src/index.ts`의 `syncWorkRecordRefs`에서 `prisma.styleProcess.findMany`가 `orgId` 없이 `id: { in: styleProcessIds }`만으로 조회되던 것을 확인. 바로 위 `style.findMany`는 `orgId`로 스코프돼 있었는데 이 조회만 빠져 있었음.
- `where`에 `orgId`를 추가해 다른 조직의 `StyleProcess`가 섞여 매칭되지 않도록 수정 (한 줄 변경, 이름/코드 fallback 신규 추가 없음).

### Verify
- `npm --prefix backend run build` 통과 확인.
- `npm run test:regression`(루트) 등 DB 연결이 필요한 회귀 테스트는 이 환경에 운영 `DATABASE_URL`이 연결돼 있지 않아 실행하지 않음. 배포 전 실제 DB 대상으로 별도 실행 필요.

### Remaining
- 없음 (단일 지점 수정, 스코프 확장 안 함).

---

## 2026-07-02 Organization representative employee FK

### Done
- Added `Organization.representativeEmployeeId -> Employee.id`.
- Added `migration_fix.sql` backfill from unique legacy `Organization.representative` name matches.
- Updated organization responses to include joined representative employee contact fields.
- Updated `/employees` responses to include membership email for representative selection.
- Reworked business/legal info UI into one group: industry, English/Korean/Vietnamese company names, representative, contact/email, address.

### Remaining
- After deploy, confirm `Organization_representativeEmployeeId_fkey` exists and invalid cross-org representative IDs were cleared.
- Decide later whether legacy `Organization.representative`, `phone`, and `email` should remain as compatibility snapshots or be fully derived.

### Verify
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`
- In business > legal info, choose a representative and confirm contact/email are read from the selected employee.

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
- Updated `migration_fix.sql` FK-add pattern so `AtTrainingBucket` cleans orphaned `sourceWorkLogId` rows and orphaned `factoryId` references before adding those FKs.
- Changed factory manager storage to `managerEmployeeId` so the business UI selects a manager from employees assigned to the same factory instead of free-text input.
- Switched work log / work history / production analysis minimum-date guards from the BARO-only hardcoded date to factory-scoped management start dates.
- Reworked business and customer basic-info forms to group related fields and support Korean/Vietnamese inputs.
- Added startup schema drift checks for `Organization.nameKo/nameVi` and `Factory.nameKo/nameVi/managementStartDate` so `/factories` does not serve before those DB columns exist.
- Made `PUT /factories/:id` preserve existing address/contact/wage fields when omitted from partial payloads.
- Documented the remaining legacy `workDate` fallback as form-initialization-only and clarified the assignment board's earliest-factory min-date intent in code.

### Remaining
- Recheck whether the global assignment board should keep using the earliest factory management start date or move to a stricter per-factory rule.
- Remove the hidden legacy basic-info block in `frontend/src/pages/App/customer/CustomerDetail.jsx` once the new panel is fully settled.
- Decide when to fully drop legacy `Factory.manager` text after `managerEmployeeId` backfill has been checked on production data.

### Verify
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix backend run build`
- `npm --prefix frontend run build`
- Create/update organization and factory records and confirm localized names persist.
- Change a factory `managementStartDate` and confirm selected-factory date pickers clamp correctly in work history and production analysis screens.
- On a DB missing the new business/factory columns, confirm backend startup applies `migration_fix.sql` before accepting `/factories` traffic.
- Send a partial `PUT /factories/:id` payload that omits address/contact/wage fields and confirm existing DB values are preserved.
- On a DB with orphaned `AtTrainingBucket.sourceWorkLogId` / `factoryId`, confirm `migration_fix.sql` deletes or nulls the violating rows before FK creation.
- In the business > factory drawer, confirm manager options come only from `/employees?factoryId={id}` and saving rejects employees from other factories.
