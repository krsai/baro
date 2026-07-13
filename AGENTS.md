# BARO 프로젝트 컨텍스트

> 이 파일은 Claude Code, Codex 등 모든 AI 도구의 단일 진입점이다.  
> 내용을 수정할 때는 이 파일 하나만 수정한다.

봉제 공장 생산 관리 SaaS. 핵심 기능: **AT 추정** + **스케줄러**.

---

## ⚠️ DB 접속 전 필독: Supabase ≠ 운영 DB

- **운영 데이터(주문/스타일/작업기록/배정 등)는 전부 Railway Postgres에 있다. Supabase에는 없다.**
- Supabase는 **소셜 로그인(Auth, Google OAuth)만** 담당한다. Supabase 안에 Postgres가 딸려 있어서 헷갈리기 쉽지만, 그 Postgres는 앱 데이터 저장용으로 쓰이지 않는다(테이블은 존재해도 전부 빈 상태).
- **`backend/.env`의 `DATABASE_URL`/`DIRECT_URL`은 현재 Supabase Postgres를 가리키고 있다.** 이 파일을 그대로 믿고 접속하면 "테이블은 다 있는데 전부 0건"인 빈 DB에 연결된다 — 실제로 반복 발생한 혼동의 원인이다.
- 실제 운영 데이터를 조회/조사해야 하면 `.env`를 쓰지 말고, Railway 콘솔 → **Postgres 서비스 → Variables 탭 → `DATABASE_PUBLIC_URL`** 값을 받아서 그걸로 접속한다. (`DATABASE_URL`이라는 이름의 변수가 Railway Variables에도 있지만 그건 `*.railway.internal` 내부 전용 호스트라 Railway 네트워크 밖에서는 연결 자체가 안 된다. 반드시 `DATABASE_PUBLIC_URL`을 써야 한다.)
- 이 값은 비밀번호가 포함된 민감정보이므로 세션에서만 임시로 쓰고 `.env`에 영구 저장하지 않는다.

---

## 핵심 용어

| 용어 | 정의 |
|---|---|
| **스타일** | 옷 한 종류 (예: 재킷 A형) |
| **공정** | 스타일을 만들기 위한 작업 단계. 순서 없음. 공정 N개가 각 1회씩 완료 = 옷 1벌 완성 |
| **라인** | 작업자들의 팀. "라인 1 = A팀(작업자 1, 2, 3)" |
| **PT** | Physical Time. 기본 물리 시간 (`process.pt`) |
| **ST** | Standard Time. 수량 구간별 수동 설정 기준 시간 (`stValues[bucket].seconds`). 구간: 1,3,5,10,30,50,100,300,500,1000,3000,5000,10000 |
| **CT** | Contract Time. ST 기반 계약 시간(초/공정). **급여 기준**: `CT × 수량 × 초당공임 = 급여` |
| **AT** | Actual Time. 작업기록으로 학습한 실제 시간. 모델: `AT(q) = a*q + b` |

### 시간 필드 규칙 (강제)
- **PT (`ptSeconds`)**: 공정 row 1개를 1장 수행하는 전체 물리 시간이다. `timesPerPiece`를 다시 곱하지 않는다.
- **ST (`stSeconds`)**: 공정 row 1개를 1장 수행하는 전체 표준 시간이다. 스케줄러 예상 기간, 배정 카드 길이, 계획 소요 시간 계산의 기준이며 `timesPerPiece`를 다시 곱하지 않는다.
- **CT (`ctSeconds`)**: 공정 row 1개를 1장 수행하는 전체 계약/급여 기준 시간이다. 배정 카드에서 수정할 수 있지만, 스케줄러 길이 계산에 사용하면 안 되며 `timesPerPiece`를 다시 곱하지 않는다.
- **AT**: WorkLog/WorkRecord와 출퇴근 데이터로 학습한 실제 시간 추정값이다. 스케줄 보정/예측 참고값이지 CT가 아니다.
- `AssignmentPlan.assignmentStTotalSeconds`(물리 컬럼명, §24에서 `stTotalSeconds`에서 리네임됨): 배정 카드 전체의 계획 ST 총초. 스케줄러 길이 계산 전용이다. API/board payload 호환 키로 `stTotalSeconds`가 여전히 노출될 수 있다.
- `AssignmentPlan.assignmentCtTotalSeconds`(물리 컬럼명, §24에서 `ctTotalSeconds`에서 리네임됨): 배정 카드 전체의 계약 CT 총초. 급여/계약 기준 전용이며 스케줄러 길이 계산에 사용 금지. API/board payload 호환 키로 `ctTotalSeconds`가 여전히 노출될 수 있다.
- `WorkRecord.ctSeconds`: 작업기록 상세 행의 급여 계산용 CT. 진행률/스케줄 실제 기간 계산에서 ST처럼 쓰면 안 된다.
- `WorkLog.totalCtSeconds`: 작업기록 헤더의 CT 합계. 작업기록 목록/요약과 급여 참고용이며 스케줄러 길이 계산에 사용 금지.
- `AtTrainingBucket.laborInputSeconds`: AT 학습용 실제/대체 투입 노동 시간 합이다. 스케줄러 계획 시간이나 계약 시간과 섞으면 안 된다.
- 같은 의미는 같은 단어를 쓴다. 공정 단위는 `stSeconds`/`ctSeconds`, 배정카드 총합은 `stTotalSeconds`/`ctTotalSeconds`, AT 투입 노동 시간은 `laborInputSeconds`.
- 신규 코드에서 `contractedSeconds`나 도메인 필드명 `totalSeconds`를 추가하지 않는다. `totalSeconds`는 화면 포맷팅 같은 일반 지역 변수에만 허용한다.

### 인증/권한 가드레일 (강제)
- 백엔드는 `x-user-email`, `x-org-id`, 쿼리 `orgId`를 **신원/권한의 소스오브트루스**로 사용하면 안 된다.
- 사용자 신원, 조직 소속, 시스템 관리자 판정은 **백엔드가 검증한 인증 토큰(JWT 등)** 에서만 유도한다.
- 헤더의 이메일/조직 값은 디버그/보조 정보로만 취급할 수 있으며, 검증된 actor context와 불일치하면 401/403으로 거부한다.
- `createdBy` / `updatedBy` / `requireSystemAdmin` / 조직 범위 접근 체크는 모두 같은 검증된 actor context를 사용해야 한다.
- **2026-07-11 리뷰 확인:** 현재 코드(`backend/src/middleware/access.ts`, `frontend/src/utils/apiClient.js`)는 이 원칙을 아직 만족하지 못한다. 이 항목은 최우선 미해결 위험이다.

### DB 설계 원칙 (강제)
- 엔티티 간 관계는 JSON blob 안에 값을 복사해서 표현하지 않고 FK 컬럼 + Prisma relation으로 표현한다. "A가 B를 참조한다"는 항상 `aId Int` FK 컬럼과 `@relation`으로 만들고, 조회는 JOIN(Prisma `include`/`select`)으로 한다.
- `Json?` 필드는 아래 두 용도로만 신규 사용을 허용한다.
  1. 저장 시점 값을 의도적으로 얼려서 보존해야 하는 스냅샷 (`AssignmentPlan.assignmentCtSnapshot` 등).
  2. 다른 테이블 PK를 참조하지 않는, 구조가 자주 바뀌는 순수 표시/메타 데이터 (`imageUrls`, `bom` 등).
  - 다른 테이블의 PK를 담거나 이미 FK로 연결된 테이블과 같은 의미의 데이터를 다시 담는 JSON은 신규로 추가하지 않는다.
- 신규 스키마 변경/리뷰 시 "이 값이 이미 FK로 연결된 다른 테이블에도 존재하는가"를 먼저 확인한다. 존재하면 JSON에 중복 저장하지 말고 relation을 통해 조회한다.
- **JSON-관계형 이중 저장 정리 현황 (2026-07-02 업데이트)**:
  - `WorkOrder.items` (Json) ↔ `WorkOrderItem` (FK `workOrderId`) — **쓰기 중단 완료**. 신규 생성/수정 경로는 더 이상 `items` JSON에 쓰지 않는다(항상 `Prisma.JsonNull`). 읽기 fallback(`itemsFromRelation ?? normalizeOrderItems(order?.items)`)도 전부 제거해 이제 relation만 읽는다(비어 있으면 그냥 빈 배열). `PUT /orders/:orderId`의 부분 업데이트 fallback도 과거엔 `existing.items`(JSON) 을 읽었는데, 이제 `existing.workOrderItems`(relation)를 읽도록 같이 고쳤다 — 그대로 뒀으면 Phase 2 이후 items 없는 payload로 저장할 때마다 기존 주문 품목이 삭제되는 사고였다. 레거시 주문(관계형 행이 없는 주문)은 `migration_fix.sql`의 `Step 0d-5` 백필과 `npm run verify:workorder-item-backfill`로 처리한다. 백필 검증에서 0건이 나오면 컬럼 DROP을 진행할 수 있다.
  - `Style.processes` (Json) ↔ `StyleProcess`/`StyleProcessStandard` (FK `styleId`) — **쓰기 중단, 응답 fallback 제거 완료**. `POST /styles`, `PUT /styles/:styleId`, `POST /styles/import`는 더 이상 `processes` JSON에 쓰지 않는다. `toStyleResponse`와 카드 빌더의 "mirror 없으면 JSON 읽기" fallback도 제거했다. 다만 `ensureStyleProcessStorageForStyles`(자가치유 백필)는 그대로 유지한다 — 이건 매 요청마다 조용히 JSON을 대신 보여주는 fallback이 아니라, JSON을 시드로 관계형 행을 영구히 다시 써서 그 스타일을 완전히 마이그레이션시키는 1회성 백필이라 성격이 다르다. `npm run verify:style-process-backfill`(진단 전용, 미백필 스타일 수만 셈)로 남은 레거시 스타일을 확인하고, `GET /styles?includeProcesses=1` 호출(또는 스타일 편집 화면에서 재저장)로 개별 마이그레이션시킬 수 있다. `Style.processes` → `StyleProcess` 매핑은 processCode 다단계 fallback/로컬라이즈드 이름 합성 등 복잡한 정규화 로직이 얽혀 있어 raw SQL로 새로 백필하지 않았다 — 잘못 재구현하면 todo.md에 기록된 과거 데이터 유실 사고를 반복할 위험이 커서다. 0건 확인 후 컬럼 DROP.
  - `WorkLog.records` (Json) ↔ `WorkRecord` (FK `workLogId`) — 애초에 레코드 데이터를 복제 저장한 적이 없다. `{ lineId, lineName }` 헤더 메타데이터만 담으며, 실제 작업기록은 항상 같은 트랜잭션에서 `WorkRecord`로만 저장돼 왔다. 응답 조립 함수(`resolveWorkLogRecordResponses`)에 있던 `records.rows`/`records` 2단계 JSON fallback만 제거했다(이제 `workRecords` relation만 읽는다). `WorkRecord.lineId`는 이미 `Line`에 대한 실제 FK가 걸려 있다. `WorkLog.records` JSON 내부의 `{lineId,lineName}` 메타데이터는 여전히 비정규화 상태이지만, 이는 WorkRecord 데이터 복제가 아니라 별도 트래킹 대상(구조적 문제 #1)이라 이번 정리 범위에 포함하지 않았다.
  - `AssignmentBoardState.cards`/`assignments` (Json) ↔ `AssignmentCard`, `AssignmentPlan` (FK) — **완료 (2026-07-06 정정)**. 이 항목이 예전엔 "아직 미착수"이고 board JSON이 `$transaction` 안에서 커밋된 뒤 `AssignmentPlan` relation sync가 트랜잭션 밖에서 따로 실행된다고 적혀 있었으나, 실제 코드(`PUT /assignment-board-state`)를 다시 확인한 결과 이미 그렇지 않다 — `AssignmentCard` upsert(`syncAssignmentCardsForOrg`)와 `AssignmentPlan` 갱신, `AssignmentBoardState` upsert(`cards`/`assignments`를 항상 `Prisma.JsonNull`로 기록)가 전부 하나의 `prisma.$transaction` 안에서 실행된다. `shouldSyncPlans`라는 이름의 블록 자체도 더 이상 코드에 없다(§44~46 FK+join 재설계 과정에서 이 트랜잭션 구조로 이미 정리됨). board JSON 컬럼은 이제 순수 레거시 응답 호환용 빈 값일 뿐, 실제 읽기/쓰기 소스오브트루스는 `AssignmentCard`/`AssignmentPlan` relation이다.
  - `AssignmentCard`/`AssignmentPlan` FK 정확성 (2026-07-08): `styleId`/`workOrderId`/`buyerOrgId`는 row의 FK 컬럼만 소스오브트루스다. `AssignmentCard.payload`, `AssignmentPlan.cardId`, `originOrderId`, 스타일명/주문번호 문자열로 누락 FK를 복원하거나 매칭하지 않는다. 저장/동기화 경로에서 필요한 FK가 없으면 409로 드러내고, 운영자가 백필/수리해야 한다.
- 위 이중 저장을 정리할 때는 "JSON을 read source of truth에서 제외 → 코드 전체가 relation만 읽는지 검증 → JSON 컬럼 제거"의 단계적 순서를 따른다 (레거시 컬럼 제거 원칙과 동일). raw SQL 백필이 원본 정규화 로직(다단계 fallback, 파생 필드 등)을 완전히 재현하기 어려우면 SQL로 새로 만들지 말고 앱이 이미 쓰는 검증된 로직(자가치유 함수, 재저장 트리거 등)을 백필 메커니즘으로 재사용한다.

### 정확 계산 원칙 (강제)
- 핵심 지표(생산률, 실제 생산 ST, 진행률, 급여, AT 학습 입력)는 정확한 소스오브트루스가 연결될 때만 계산한다.
- 계산에 필요한 FK/마스터/ST bucket/작업기록 연결이 없으면 임의 추정, 우회 공식, 보완 fallback으로 그럴듯한 값을 만들지 않는다.
- 계산 실패는 0/null/미계산 상태와 진단 로그로 드러내며, 조용히 다른 공식으로 대체하지 않는다.
- 호환성 dual-read나 schema migration fallback은 명시된 migration 단계에서만 허용한다. 운영 지표 계산 로직에 섞지 않는다.
- 운영 지표 조회 중에 정규 참조를 다시 붙이는 helper를 호출하지 않는다. 예를 들어 실제 생산 계산은 저장된 `WorkRecord.styleProcessId`로 `StyleProcess/StyleProcessStandard`를 조회하며, `styleId/styleCode/name`, `processCode`, `AttrProcess.code`, 공정명으로 재탐색하지 않는다.
- `WorkRecord.assignmentPlanId/styleId/styleProcessId`는 신규 작업기록 저장 시점에 확정되어야 한다. 비어 있으면 저장을 거부하고 원인을 노출한다. `styleId`는 `Style.uid` 정수 FK이며 스타일 코드 문자열이 아니다. `processId`는 WorkRecord에 저장하지 않는다.
- 작업기록/배정의 실제 생산 계산은 색상, 사이즈, 성별을 구분하지 않는다. 정산에서 WorkRecord 생산량을 볼 때도 색상 기준으로 나누지 않는다. `colorId`, `colorCode`, `colorName`, `gender`를 WorkRecord 저장값이나 실제 생산/정산 매칭 키로 재도입하지 않는다.
- 레거시 컬럼/JSON key는 "백필 -> 신규 저장 차단 -> 운영 조회 참조 제거 -> 검증 -> DB DROP" 순서로만 제거한다. 참조 제거 전 DROP 금지, DROP 대상 컬럼을 새 코드에서 읽는 것도 금지한다.
- 진행 중인 DB/계산 정리 작업의 **원인 분석, 정책 판단, 로직 메모**는 `AGENTS.md`에 기록한다. `todo.md`에는 **앞으로 해야 할 일과 아직 남은 검증 항목만** 짧게 남긴다.
- 이 파일의 뒤쪽 phase 기록에 과거 dual-read/fallback 허용 문구가 남아 있더라도 현재 개발 정책은 이 "정확 계산 원칙"을 우선한다.

### AT 모델
```
AT(q) = a*q + b
  a = 장당 한계시간(초/장)
  b = 셋업 고정시간(초, 수량 무관)
```
수량이 많아질수록 장당 시간이 `a`에 수렴. AT 목적: 충분한 데이터 축적 후 CT/ST 조정 참고용.

---

## 데이터 구조 핵심

### 사원번호
- 제조사 직원의 사원번호는 `{공장코드}-{4자리 순번}` 형식이다. 예: `HN-0001`.
- 직접 직원 등록과 가입 승인 모두 해당 공장의 현재 최대 순번 다음 번호를 자동 부여한다.
- 기존 1~3자리 숫자 suffix는 배포 migration에서 4자리로 정규화한다. 예: `HN-001` → `HN-0001`.
- 사원번호는 조직 내에서 중복될 수 없다.
- 공장 코드가 변경되면 해당 공장 소속 직원의 사원번호 prefix도 같은 순번을 유지한 채 함께 갱신한다. 예: `HN-0007` → `TB-0007`.

### 조직 계정 / 로그인 이메일 (2026-07-07부터 `Employee`로 통합, §47 참고)
- **`OrgMembership` 테이블은 더 이상 존재하지 않는다.** 로그인 계정/권한(과거 OrgMembership의 책임)은 이제 `Employee.orgRole`(`OrgUserRole`: ADMIN/OPERATOR/ACCOUNTANT/WORKER)과 `Employee.status`가 담당한다. 제조사든 발주처든 조직 소속 계정은 전부 `Employee` 행 하나로 표현된다.
- `Employee.orgRole`이 `ADMIN`, `OPERATOR`, `ACCOUNTANT`면 로그인 이메일이 필수다.
- `Employee.orgRole`이 `WORKER`면 이메일이 선택이다. 비어 있으면 DB에도 실제로 `NULL`로 저장하며, 가짜 내부 이메일을 만들거나 빈값처럼 숨기지 않는다.
- 소셜 로그인 후 온보딩의 기존 회사 가입 신청은 `Employee.requestedName`/`requestedAt`/`approvedAt`/`approvedBy`에 저장한다.
- `Employee.roleId`(→`AttrRole`)는 `orgRole`과 별개의 축이다 — 현장 직무(감독/봉제/다림/검수/포장 등, 조직별 커스터마이징 가능)를 나타내며 시스템 접근 권한이 아니다. 이름이 비슷해 혼동하지 않는다.
- API 경로 `/org-memberships`와 `orgMembershipId`라는 이름은 하위 호환을 위해 남아있지만 내부적으로는 전부 `Employee`를 가리킨다(추가 DB 마이그레이션 없이 나중에 이름만 정리 가능).
- **인증 소스오브트루스(2026-07-12)**: 백엔드 신원 판별은 `Authorization: Bearer <Supabase access token>` 검증 결과의 이메일만 사용한다. `x-user-email`, `/auth/context?email=...`, 요청 body/query의 이메일을 신원 대용으로 쓰지 않는다.
- `x-org-id`와 쿼리 `orgId`는 "어느 조직을 보려는가"를 고르는 힌트일 뿐이며, 실제 접근 허용 여부는 검증된 토큰 이메일이 그 조직의 활성 `Employee`이거나 `SystemUser.SYSTEM_ADMIN`인지로 다시 판정한다.
- `/auth/context`, `/org-memberships/apply`, `/onboarding/company-requests`, `/organizations` 같은 로그인 진입/온보딩 경로도 익명 이메일 입력으로 우회하지 않는다. 토큰이 없으면 401, 이메일이 토큰과 다르면 403으로 드러낸다.
- `SYSTEM_ADMIN_EMAIL`은 서버 환경변수로만 공급한다. 코드 안의 하드코딩 폴백 이메일은 금지하며, 시스템 관리자 row bootstrap도 서버 설정값이 있을 때만 수행한다.
- 프론트 로그인 화면의 dev bypass / 테스트 계정 패널은 제거했다. 프론트 API 클라이언트는 Supabase 세션의 access token을 자동으로 `Authorization` 헤더에 붙인다.

### WorkLog / WorkRecord
- **WorkLog**: 기간 헤더. `coverageStartDate`(시작), `coverageEndDate`(종료)가 소스오브트루스.
  - `displayDate` (DB 컬럼명 `workDate`, Prisma `@map("workDate")`): 목록 표시/정렬 전용 대표 날짜. 항상 `coverageEndDate`와 동일. **계산 로직 사용 금지.**
  - `lineId`가 스키마 FK 없이 `records` JSON 안에 비정규화 저장됨 (DB 조인 불가 — 구조적 한계).
- **WorkRecord**: WorkLog 하위 상세 행. 한 행 = `(workerId, styleId, styleProcessId, quantity, ctSeconds)`.
  - 작업기록은 색상/사이즈/성별을 구분하지 않는다. AJ2102 흰색 S 100장과 검은색 M 100장처럼 주문 상세가 나뉘어도 작업기록은 해당 스타일/공정에서 만든 총 수량만 기록한다.
  - `ctSeconds`는 해당 작업 상세의 급여/계약 기준 시간이다. 스케줄러 계획 길이의 기준은 아니다.
  - `effectiveCoverageStartDate/effectiveCoverageEndDate`는 WorkLog 기간과 작업자의 입사일/퇴사일을 교차해 저장한 작업자별 유효 작업기간 스냅샷이다. 월간 입력 중 중도 입사/퇴사자가 있으면 이 범위로 자동 절단하고 WorkLog 비고에 조정 내역을 남긴다.
  - `lineId Int?` 컬럼은 실제로 존재하지만 FK는 없다. `Line` 테이블과 조인 가능한 정규화 관계가 아니라 비정규화 보조 필드다.
  - 같은 작업자가 같은 기간(또는 같은 날) 여러 공정 입력 가능.
  - 스케줄러 연결의 핵심 키는 `WorkRecord.assignmentPlanId`.
  - 실제 생산/ST 매칭의 핵심 키는 `WorkRecord.styleProcessId -> StyleProcess.id -> StyleProcessStandard.bucketStSeconds`다. `processId`는 WorkRecord에 저장하지 않는다.
  - 신규 WorkLog 저장/수정에서는 모든 WorkRecord가 `assignmentPlanId`, `styleId`, `styleProcessId`를 가져야 한다. 연결 없는 작업행은 백엔드에서도 거부한다.
  - 업로드/입력의 `orderNo`, 스타일 코드, 공정 코드는 배정 카드와 `StyleProcess`를 찾기 위한 입력값일 뿐 WorkRecord 저장 컬럼이 아니다.
  - `workerName`, `customerName`, `orderNo`, `styleUid`, `styleName`, `processId`, `processCode`, `colorId`, `colorCode`는 WorkRecord에 재도입하지 않는다. 화면 표시값은 `worker`, `assignmentPlan`, `style`, `styleProcess` relation에서 읽는다.
- **급여 계산용**: 공정별로 몇 개 만들었는지 집계. 주문 100장이어도 실제로는 95장 또는 105장 만들 수 있음.

### WorkLog 날짜 규칙 (강제)
- 계산/판정 로직(스케줄러, 진행도, 완료일 추정)에서는 항상 기간 `[coverageStartDate, coverageEndDate]`를 기준으로 해석한다.
- 작업자별 계산에서는 WorkRecord의 `effectiveCoverageStartDate/effectiveCoverageEndDate`가 있으면 그 범위를 우선 사용한다. 이 값은 WorkLog 기간을 벗어날 수 없다.
- `displayDate`는 UI 목록 표시/정렬 용도로만 사용한다. 계산 로직의 기준 날짜로 절대 사용하지 않는다.
- `coverageEndDate || displayDate` 형태의 fallback 브릿지 로직은 신규 코드에 추가하지 않는다.
- 기간 입력(`coverageStartDate !== coverageEndDate`)은 절대 하루치로 뭉개지면 안 된다.
- WorkRecord가 AssignmentPlan과 연결되지 않으면(`assignmentPlanId` 없음) 기간이 정확해도 스케줄러/진행도 반영이 불가능하다.
- 작업기록이 이미 연결된 AssignmentPlan은 배정 해제/삭제로 orphan WorkRecord를 만들 수 없다. 연결된 작업기록이 있으면 해당 assignment 제거를 거부한다.
- **2026-07-11 리뷰 확인:** 현재 `lines`/`factories` 삭제 경로 중 일부가 이 원칙을 어기고 `WorkRecord.assignmentPlanId = null` 후 `AssignmentPlan`을 삭제한다. 의도된 예외가 아니라 미해결 버그로 취급한다.

### AssignmentPlan (스케줄 카드)
- 단위: 기본 `주문 × 스타일` (색상/사이즈 단위 미구현)
- `assignmentQuantity`: 계획 수량. §40(2026-07-05)부터 이 값이 항상 "생산한 만큼"과 같다는 보장은 없다 — 주문에서 스타일이 빠지면 작업기록 유무에 따라 0으로 남을 수 있다(아래 "0-수량 오버플로우" 참고).
- `assignmentStTotalSeconds`(물리 컬럼명): 스케줄러 계획 길이 계산에 쓰는 배정카드 전체 ST 총초.
- `assignmentCtTotalSeconds`(물리 컬럼명): 급여/계약 계산에 쓰는 배정카드 전체 CT 총초. 스케줄러 길이 계산에 사용 금지.
- `assignmentCtSnapshot`: assignment 저장 시점의 CT 스냅샷 JSON. `processes[].snapshotCtSeconds`와 `processes[].pieceCtSeconds`는 급여/계약 CT 기준이며, snapshot 안에 ST 복사본을 저장하지 않는다. `PUT /assignment-board-state`는 편집 가능한 배정에 대해 서버가 `AssignmentCard.styleId` FK가 가리키는 라이브 `StyleProcess`/`StyleProcessStandard` 기준으로 CT 스냅샷을 재생성하거나 기존 유효 스냅샷을 보존해야 하며, 그래도 유효한 CT를 만들 수 없으면 저장을 거부한다(조용히 `null` 저장 금지).
- **2026-07-12 적용 완료:** `PUT /assignment-board-state` 저장 경로에서 `preserveExistingAssignmentCtSnapshotsForSave` 우회는 제거됐다. 편집 가능한 assignment는 저장 직전에 서버가 `AssignmentCard.styleId` FK의 라이브 `StyleProcess`/`StyleProcessStandard` 전체를 기준으로 CT snapshot을 다시 조립하고 검증한다. incoming/existing snapshot의 공정 CT를 재사용하는 경우도 `styleProcessId` 일치 또는 현재 `processKey` 일치일 때만 허용한다. 카드/style FK가 없거나, 라이브 공정 전체를 덮는 CT를 만들 수 없거나, 재조립 결과와 현재 payload snapshot이 다르면 409로 저장을 막는다. 프론트 snapshot payload도 `styleProcessId`를 보존하며 더 이상 "현재 snapshot을 못 만들면 기존 snapshot을 통째로 재사용"하지 않는다.
- `isCompleted / finalQuantity / completedAt`: 생산 완료 확정 결과 (`PATCH /assignment-plans/:externalId/production-complete`)
- `closedQty / closedAt / closedBy / closeMode / closeBasis`: 제작 완료 확정 상태 스냅샷 (구 `/close` 경로와 신규 `/production-complete` 공통 반영)
- **카드/배정 생성 시점 (§40, 2026-07-05부터)**: `AssignmentCard`/`AssignmentPlan`은 주문을 **저장**할 때가 아니라 **잠글 때**(`POST /orders/:orderId/modification-lock`, `locked:true`) 만들어지거나 갱신된다. 잠기지 않은 주문은 카드가 아예 없다. 해제는 순수 권한 플래그라 카드/배정에 손대지 않는다.
- **0-수량 오버플로우 (§40)**: 주문에서 스타일이 빠졌는데 그 스타일에 이미 `WorkRecord`가 있으면, 카드/배정을 지우지 않고 `assignmentQuantity=0`으로만 낮춘다. 이미 생산된 수량은 전부 `overflowQuantity`(진행률 응답 필드)로 잡힌다. 배정 보드에는 별도 "확인 필요" 경고 섹션에 표시되고, 연결된 모든 작업기록의 월이 급여 잠금되면 자동으로 그 섹션에서 빠진다.

### ⚠️ DB 적용 메모
- 모든 스키마/데이터 변경은 `backend/migration_fix.sql`로 관리. `backend/railway.json`의 `deploy.preDeployCommand`가 `npm run railway:predeploy`를 실행하도록 설정되어 있어야 하며, 배포 로그에서 migration 실행 여부를 확인한다.
- rename 필수 컬럼(`StyleProcess.timesPerPiece`, `StyleProcessStandard.bucketQuantity/bucketStSeconds`, `AssignmentPlan.assignment*`)이 운영 DB에 없으면 백엔드 시작 시 `migration_fix.sql`을 먼저 적용하고 나서 traffic을 받는다. 비상 시 `STARTUP_APPLY_MIGRATION_FIX_ON_SCHEMA_DRIFT=false`로 자동 적용을 끌 수 있다.
- **2026-07-06 확인됨: 현재 운영 환경은 `preDeployCommand`가 실제로는 꺼져 있다** (사용자가 의도적으로 비활성화). 즉 위 줄의 "배포마다 자동 적용"은 지금 이 환경에서는 실질적으로 동작하지 않는다. 남은 안전장치는 시작 시 필수 컬럼 체크(`hasField` 목록, `backend/src/index.ts` 상단)뿐인데, 이 목록에 새 컬럼을 추가하는 걸 깜빡하면(§43에서 실제로 그랬음) 드리프트가 감지되지 않고 조용히 운영 장애로 이어진다. **새 컬럼/제약을 `migration_fix.sql`에 추가할 때마다 반드시 이 `hasField` 필수 목록에도 같이 추가하고, 배포 후 실제로 컬럼이 생겼는지 운영 DB를 직접 조회해서 확인할 것** — 자동으로 적용됐을 거라고 가정하지 않는다.
- Prisma migration history drift로 `prisma migrate deploy`는 사용하지 않음. `prisma db push` 사용.
- `AssignmentPlan`의 close 관련 컬럼(`closedQty`, `closedAt`, `closedBy`, `closeMode`, `closeBasis`)은 additive SQL로 실DB에 반영됨.
- 시간 컬럼 리네임 (완료):
  - `AssignmentPlan.totalSeconds`/`stSeconds` → `stTotalSeconds`
  - `AssignmentPlan.contractedSeconds` → `ctTotalSeconds`
  - `AtTrainingBucket.totalSeconds` → `laborInputSeconds`
  - `WorkLog.totalContractedSeconds` → `totalCtSeconds`
- ctSnapshot JSON 내부 구 키명 정리 (2026-05-25 완료):
  - `totalAgreedSeconds` → `totalCtSeconds`
  - `totalAgreedPerPieceSeconds` → `totalCtPerPieceSeconds`
  - `agreedAt` / `agreedBy` → `updatedAt` / `updatedBy`
  - `agreedSeconds` / `agreedPerPieceSeconds` → `ctSeconds` / `ctPerPieceSeconds` (공정 행)
  - `ctAgreedSnapshot` → `ctSnapshot` (AssignmentBoardState.assignments 내부)
  - 런타임에서 구 이름을 읽는 fallback은 제거됨. 다만 저장 전 sanitize와 migration SQL은 유지된다. 신규 코드에 구 이름 쓰지 않는다.
- 새 환경 반영 시에는 해당 컬럼과 enum 2개(`AssignmentCloseMode`, `AssignmentCloseBasis`)를 먼저 생성해야 함.

---

## AT 학습 파이프라인

### 작동 방식
1. WorkLog 기간을 기준으로 버킷화하되, 월 집계 앵커는 종료일(`coverageEndDate` = `displayDate`) 사용
2. **Period Spreading**: 드문드문 입력해도 날짜 간격만큼 시간 자동 분산
   - 예) coverageEndDate: 4/1, 4/15, 4/30 → 각각 1일, 14일, 15일 기간으로 처리
3. `laborInputSeconds` = 해당 기간 작업자 출퇴근 실측 합 (없으면 `workerCount × 기본8h × 일수`)
4. 회귀 분석: `laborInputSeconds ≈ Σ(a_i × q_i + b_i)` → 공정별 `a`, `b` 학습

### 출퇴근 필터 (중요)
출퇴근 데이터가 없으면 **작업기록이 있어도 AT 학습 안 됨**.
월말 일괄 작업기록 입력 시 출퇴근도 같이 입력돼 있어야 함.

### 신뢰도 상태
`COLLECTING → UNRELIABLE → INSUFFICIENT → USABLE → TRUSTED → VERIFIED`
`attendanceFallbackShare`(출퇴근 미입력 비율)가 높을수록 신뢰도 하락.

---

## QC 완료 흐름

```
1. QcReview.jsx: 검수 이력 입력/취소 전용
2. POST /qc-pass-events, PATCH /qc-pass-events/:id/cancel
3. AssignBoard.jsx 상세 드로어(handleConfirmProductionComplete): PATCH /assignment-plans/:externalId/production-complete 호출
4. 백엔드 completeAssignmentPlanProduction: production completed 상태 확정 + 일정/진행도 스냅샷 동기화
5. 완료 시: isCompleted=true, completedAt/productionCompletedAt/closedQty 갱신
```

### Task 1 관련 상태
- 기존 `/assignment-plans/:externalId/complete` 기반 QC hard block 시나리오는 현재 코드 경로에서 사용되지 않음.
- 현재 완료 경로(`/assignment-plans/:externalId/production-complete` → `completeAssignmentPlanProduction`)에는 `producedQuantity < finalQuantity` 하드 블록이 없음.
- `QcReview.jsx`는 검수 이력(`qc-pass-events`) 전용이며, 생산 완료 확정은 배정 보드(`AssignBoard.jsx`) 상세 드로어에서 수행한다 (2026-06-16 이전).

---

## 스케줄러 로직 분석 결과

### 이미 구현돼 있는 것
- **미배정 카드 표시**: `buildAssignmentCardsFromOrders`가 **잠긴** 주문의 카드를 생성한다(§40, 2026-07-05부터 — 예전엔 모든 주문이었으나 지금은 잠금 시점에만 생성됨). 미배정 카드는 보드 풀(pool)에 남아 있어 눈으로 확인 가능.
- **생산 완료 반영**: `completeAssignmentPlanProduction`이 `syncAssignmentSchedulesFromWorkRecordPlans` 및 `persistAssignmentPlanProgressSnapshot`을 호출해 완료 상태와 일정 정보를 갱신.
- **라인 균형**: 시각적으로 보드에서 확인 가능 (별도 지표 불필요).
- **`progressPercent` 필드**: `/assignment-plan-progress` 응답에 포함되며, 현재는 `sum(WorkRecord.quantity) / (planQuantity × processCount)` 공식으로 계산.
- **작업기록 총량 집계**: 진행도 계산 함수(`buildAssignmentPlanProgressRows`)에서 plan별 총 작업량 집계가 가능.
- **라인-월 capacity 보드**: `AssignBoard.jsx` 기본 뷰는 line-month capacity summary이며, 계획 ST는 현재 보드 assignment를 기준으로 월별 분배하고 실제 산출은 `/line-month-capacity`가 WorkLog 기간과 WorkRecord를 기준으로 집계한다.
- **rolling forecast 기준**: line-month 보드의 forecast load/carry는 저장된 예전 assignment range가 아니라 **현재 보드의 미완료 assignment queue**와 `remainingStTotalSeconds`를 기준으로 다시 계산한다. 따라서 현재 보드에서 라인 queue가 0건이면 forecast load도 0이어야 한다.
- **forecast anchor 규칙**: line-level forecast 시작점은 `nextWorkingDay(lastActualCoverageEndDateKey)`다. 아직 actual WorkLog가 하나도 없으면 fallback은 `today` 또는 그 다음 working day다. 기본 working day는 월~토, 일요일과 휴일관리 날짜만 제외한다.
- **anchor month 의미**: actual이 있는 과거 month는 history다. anchor month와 미래 month는 현재 남은 backlog를 앞으로 capacity에 fill-forward 한 rolling forecast다. 6월 capacity를 먼저 채우고 초과분은 7월, 다시 초과하면 8월로 carry한다.
- **과거(historical) month의 "계획 부하"는 forecast 공식을 쓰지 않는다(§41, 2026-07-05)**: 이미 닫힌 달은 "남은 backlog를 채운다"는 개념 자체가 성립하지 않는다 — 그 달에 못 채운 건 자동으로 다음 열린 달의 carry-in으로 넘어가기 때문이다. 그래서 과거 달의 "계획 부하"는 같은 달의 `actualOutputPercent`(실제 생산률)를 그대로 따른다. 예전엔 과거 달을 무조건 100%로 하드코딩했던 버그가 있었다 — 실데이터와 무관하게 100%가 나와 배정이 하나도 없어도 "잔여 데이터가 남아있다"는 오해를 유발했다.
- **anchor month 퍼센트 규칙**: anchor month의 `forecast load percent` 분모는 그 달 전체 capacity가 아니라 **anchor 이후 남은 forecastAvailableCapacitySeconds**다. 예: `2026-06-10~2026-06-30` 구간을 꽉 채우면 6월 cell은 `100%`로 보이고, 보조 문구로 `2026-06-10~2026-06-30` 범위를 함께 보여준다.
- **UI 최소 정보 원칙**: 라인 요약 행은 `라인명`, `인원`, `배정 작업 수(완료 제외)`, `완료 예상 시점`만 우선 표시한다. 월 cell의 carry는 시간(hours)이 아니라 **다음으로 넘어가는 날짜**로 표시한다.
- **세로형 drag/drop 작업 목록**: 라인 대기 작업과 미배정 작업은 각각 `카드 1개 = 전체폭 1행`으로 세로 스택한다. 카드에는 이미지, 고객사, 주문번호, 스타일, 수량, 진행도를 우선 표시한다.
- **배정 취소 전용 drop zone**: 운영 화면에서 `배정 취소`는 별도 박스가 아니라 라인 용량 영역과 미배정 작업 영역 사이의 세로 선으로 표시한다. 배정 카드를 드래그 중일 때는 그 선의 오른쪽 전체(미배정 작업 패널 포함)가 취소 drop zone이며, 그 안에 놓으면 미배정으로 돌아간다. 작업기록이 연결된 assignment는 취소할 수 없다.
- 라인 대기 작업 사이의 순서 변경 drop slot은 평소 `+` 박스를 노출하지 않고 얇은 여백으로 유지하며, drag over 상태에서만 삽입선을 강조한다. 배정 카드를 미배정 작업 패널 위에 실수로 drop했을 때 라인 맨 아래 삽입으로 해석되면 안 되고, 오른쪽 취소 영역으로 우선 판정되어야 한다.
- **직렬 타임라인 비노출**: 기존 `ScheduleTimeline`과 프론트 reflow 코드는 내부 호환을 위해 남아 있을 수 있지만, 운영 화면의 기본 배정 UX로는 사용하지 않는다.

### 2026-06-09 Assignment Forecast Latest Lock
- line-month board의 forecast는 저장된 `AssignmentPlan.startDate/endDate` range가 아니라 **현재 보드의 active assignment queue**를 기준으로 다시 계산한다.
- 따라서 현재 보드에서 특정 line의 active queue가 0건이면 forecast load도 0이어야 한다.
- line-level actual history는 저장된 WorkLog/WorkRecord를 기준으로 유지하고, future forecast만 현재 보드 backlog로 재시뮬레이션한다.
- forecast backlog 입력값은 `remainingStTotalSeconds`다. partially worked assignment도 original planned ST가 아니라 remaining ST만 future forecast에 기여한다.
- actual이 하나도 없는 line의 default forecast anchor는 `today` 또는 그 다음 working day다. actual이 있으면 `nextWorkingDay(lastActualCoverageEndDateKey)`를 사용한다.
- anchor month의 `forecast load percent` 분모는 full-month capacity가 아니라 **anchor 이후 남은 `forecastAvailableCapacitySeconds`**다. 예: `2026-06-10~2026-06-30` 구간을 꽉 채우면 anchor month는 `100%`로 보여야 한다.
- anchor month 보조 문구는 `Forecast from {date}`보다 실제 forecast window range (`2026-06-10~2026-06-30`)를 우선 표시한다.
- carry는 hours가 아니라 **다음으로 넘어가는 날짜**로 보여준다. 의미는 “그 달 capacity로 다 못 끝낸 backlog가 실제로 다음에 이어서 시작되는 예상 date”다.
- 라인 요약 행의 최소 표시 정보는 `라인명`, `인원`, `배정 작업 수(완료 제외)`, `완료 예상 시점`이다.
- anchor month 윗줄은 `이번달 배정된 작업`과 line-level `완료 예상`을 함께 보여준다.
- 아랫줄은 `이번달 누적 생산`이며, 오른쪽에는 해당 월 산출에 반영된 연결 작업기록의 마지막 `coverageEndDate`를 `기록 기준 YYYY-MM-DD`로 보여준다.
- 해당 월 산출에 반영된 연결 작업기록이 없으면 아랫줄 날짜 자리에 `최근 기록 없음`을 보여준다. 이 월별 날짜는 forecast anchor용 line-global `latestActualCoverageEndDateKey`와 별도 값으로 유지한다.
- `lineFreeDateKey`와 line-level ETA는 현재 queue 정렬(`startIndex/endIndex` + source order)에 기대는 추정값이다. DB canonical `queuePosition`이 아직 없으므로 card-level exact ETA보다 **line-level rough ETA**로 해석한다.
- `ready_to_complete`는 canonical completed가 아니다. backlog/queue에서는 active로 남고, `isCompleted === true`가 되기 전까지 finished로 보내지 않는다.
- ST missing assignment는 forecast에서 제외하고 warning만 준다. 따라서 line-level forecast는 과소 추정될 수 있으며, `stUnknownAssignmentCount` 경고를 함께 봐야 한다.
- 관련 핵심 파일:
  - backend: `backend/src/index.ts` (`/line-month-capacity`, anchor date, forecastLoadPercent)
  - frontend util: `frontend/src/pages/App/assign/utils/lineMonthCapacity.js`
  - frontend UI: `frontend/src/pages/App/assign/components/LineMonthCapacityBoard.jsx`
  - docs: `AGENTS.md`

### 현재 이슈 분류 가드레일 (중요)
- WorkLog 기간 입력이 존재하는데도 카드가 밀리거나 길이가 비정상 변경되면, 1차 의심 지점은 날짜 저장이 아니라 **렌더/재배치 로직(C+D)** 이다.
- WorkLog/WorkRecord 날짜 해석 이슈와 프론트 reflow/render-range 이슈를 분리해서 진단한다.
- 미완료 카드는 저장된 계획 좌표(`startIndex/endIndex`, 부분일 퍼센트)를 유지한다. progress API의 `renderStartDate/renderEndDate`는 미완료 카드 좌표에 반영하지 않는다.
- `ScheduleTimeline`은 `useRenderDateRange === true`인 완료 카드에만 render index/date range를 적용한다.
- WorkLog 저장으로 보드/플랜 스케줄 좌표를 직접 변경하는 동기화는 기본 비활성이다. 운영에서 의도적으로 켜려면 `ENABLE_WORKLOG_SCHEDULE_SYNC=true`가 필요하다.
- 생산 완료 시 보드/플랜 스케줄 좌표를 직접 변경하는 동기화도 기본 비활성이다. 의도적으로 켜려면 `ENABLE_PRODUCTION_COMPLETE_SCHEDULE_SYNC=true`가 필요하다.
- 디버깅 순서:
  1. `WorkRecord.assignmentPlanId` 연결 유효성 확인
  2. progress API의 `renderStartDate/renderEndDate`가 미완료 카드에 과적용되는지 확인
  3. AssignBoard reflow에서 완료 카드가 queue로 재배치되는지 확인
- **2026-07-11 통합 리뷰 기준 남은 우선순위**
  1. 인증/조직 컨텍스트를 클라이언트 헤더가 아니라 서버 검증 토큰 기준으로 전환
  2. 라인/공장 삭제에서 orphan `WorkRecord` 생성 금지
  3. 미완료 assignment 일반 저장에도 optimistic locking 추가
  4. `AssignBoard.jsx`의 `getTodayDayIndex` 범위 밖 fallback `0` 수정
  5. 프론트 synthetic card fallback(`cardId`/`originOrderId` 파싱 기반 카드 재구성) 제거

---

## 코딩 명세 (태스크 상태)

### Task 1: QC 완료 hard block 제거
- 상태: **해소됨 (구조 변경)**
- 근거:
  - 생산 완료 엔드포인트는 `PATCH /assignment-plans/:externalId/production-complete`
  - 완료 처리는 `completeAssignmentPlanProduction`이 담당
  - QC 화면(`QcReview.jsx`)은 검수 이력(`qc-pass-events`) 전용이며 완료 버튼 경로를 사용하지 않음
  - 현재 완료 경로에는 `producedQuantity < finalQuantity` 하드 블록이 없음

### Task 2: 진행도 계산 공식 변경
- 상태: **완료**
- 반영 내용:
  - 함수: `backend/src/index.ts`의 `buildAssignmentPlanProgressRows`
  - `progressPercent`를 `sum(WorkRecord.quantity) / (planQuantity × processCount) × 100`으로 계산
  - `processCount`는 `ctSnapshot.processes.length` 우선, 파싱 실패/부재 시 작업기록의 공정 수로 fallback
  - `isCompleted` 또는 `completedAt`이 있으면 `progressPercent = 100`
  - `totalExpected`가 없거나 0이면 `progressPercent = null`
  - 최대 100으로 clamp
  - `producedQuantity`(Math.min 기반)는 기존 로직 유지

### Task 3: 스케줄 카드 배경 진행도 표시
- 상태: **완료**
- 반영 내용:
  - `AssignBoard.jsx`에서 `/assignment-plan-progress` 응답을 plan id 기준으로 카드 데이터에 매핑
  - 카드 렌더러(`assign/components/AssignBar.jsx`)에 진행도 배경 오버레이 추가:
    - 조건: `progressPercent > 0 && !isCompleted`
    - 스타일: `position: absolute`, `width: ${progressPercent}%`, `backgroundColor: rgba(255,255,255,0.25)`, `zIndex: 0`
  - 완료 카드(`isCompleted`)는 오버레이 없이 기존 완료 스타일 유지

---

## 구조적 문제 (우선순위순)

| # | 문제 | 위치 | 영향 |
|---|---|---|---|
| 1 | `WorkLog.records` JSON 내부 `lineId`는 FK 없이 비정규화 저장됨 (해소됨: `WorkRecord.lineId`는 이미 `Line`에 대한 실제 FK다 — `"WorkRecordLine"` relation, `schema.prisma`) | `backend/prisma/schema.prisma` | WorkLog 레벨 라인 조인은 여전히 JSON 파싱 필요, WorkRecord 레벨은 정규 JOIN 가능 |
| 2 | 재배치 로직이 프론트에 있음 | `frontend/src/pages/App/assign/AssignBoard.jsx` | 서버 이벤트에 자동 반응 불가 |
| 3 | 소스오브트루스 이중화 | 여러 곳 | WorkLog.records vs WorkRecord, ctSnapshot 등 |
| 4 | 실행 엔티티 부재 | — | 시작/중단/완료 이벤트 모델 없음 |

---

## 현재 상황 (2026-07-05 기준, 이 섹션은 자주 갱신할 것 — 오래되면 날짜만 보고도 신뢰하지 말 것)

- 2026-07-03 운영 데이터 삭제 사고(§39) 이후 `AssignmentPlan`/`AssignmentCard`가 전체 조직 0건 상태에서 복구 중. `WorkOrder`/`WorkOrderItem`/`Style`은 살아있음.
- 카드/배정 생성 로직을 저장 시점 → 잠금 시점으로 재설계(§40)했고, 이 재설계에 실제 버그가 있어 디버깅 진행 중(진단 로그 배포함, Railway 로그 대기 중 — todo.md 최신 항목 참고).
- 과거(4월) 데이터 입력은 이미 끝났고 지금은 운영 단계 — "최초 입력 중" 문구는 더 이상 유효하지 않음.
- 병렬 생산(라인에서 A+B 동시 작업)은 AT 추정에 문제 없음. 스케줄은 순차 계획이지만 현실은 병렬 — 이 특성 자체는 변하지 않음.

---

## 주요 파일 위치

| 역할 | 파일 |
|---|---|
| AT 계산/신뢰도 유틸 | `frontend/src/utils/processTime.js` |
| AT 학습 파이프라인 | `backend/src/index.ts` 내 AT 학습/동기화 로직 |
| 생산 완료 엔드포인트 | `backend/src/index.ts`의 `/assignment-plans/:externalId/production-complete` |
| 작업기록 저장 엔드포인트 | `backend/src/index.ts`의 `/work-logs` 저장/수정 라우트 |
| 스케줄 재배치 (프론트) | `frontend/src/pages/App/assign/AssignBoard.jsx` 내 스케줄 재배치 로직 |
| 진행률 계산 | `backend/src/index.ts`의 `buildAssignmentPlanProgressRows` |
| DB 스키마 | `backend/prisma/schema.prisma` |
| API 클라이언트 | `frontend/src/utils/apiClient.js` |
| 테스트 리셋 스크립트 | `backend/scripts/reset-to-baseline.js` |

---

## 기술 스택

### 프론트엔드
- React 19, React Router 7, Vite 7, MUI 7
- Drag & Drop: `@dnd-kit/core`, `@hello-pangea/dnd`
- 상태/컨텍스트: `AuthContext`, `AppContext`, `LanguageContext`
- 데이터 호출: 공통 `requestJSON` 래퍼 (캐시, 요청 스코프, 로딩 추적)

### 백엔드
- Express 5 (TypeScript), Prisma 6 + PostgreSQL
- 대형 `index.ts` + 일부 도메인 라우터 모듈 분리 구조

### 인증/인프라
- Supabase Auth (Google OAuth), Railway 배포 (프론트/백/DB 분리 서비스)
- 운영 DB와 Supabase 혼동 주의: 파일 최상단 "⚠️ DB 접속 전 필독" 참고.

---

## 프론트엔드 아키텍처

### 라우팅 (`frontend/src/router.jsx`)
보호 라우트: `ProtectedRoute` 사용. 주요 경로:
- `/workspace`, `/assignment`, `/work-history`, `/work-history-monthly`
- `/attendance`, `/payroll`, `/style`, `/order`, `/customer`
- `/line`, `/business`, `/employee`, `/profile`, `/holiday`
- 비활성화(메뉴에서 숨김): `/production-plan`, `/st-review`, `/shipment-review`, `/inventory`

### 구독 관리 접근 규칙
- `/system-setting`의 구독 관리 화면과 메뉴는 `entryType=SYSTEM`이면서 `systemRole=SYSTEM_ADMIN`인 시스템 운영 계정에만 노출한다.
- 조직 계정의 역할별 접근 정책에는 `SUBSCRIPTION`을 포함하지 않으며, 저장된 과거 정책에 값이 남아 있어도 직접 URL 접근을 허용하지 않는다.
- 구독 조회/변경 API(`GET/PATCH /organizations/:id/subscription`)도 `requireSystemAdmin` 검사를 유지한다.

### API 클라이언트 (`frontend/src/utils/apiClient.js`)
- `x-user-email`, `x-org-id` 헤더 자동 부착
- GET 응답 캐시(TTL 기본 45초) + 중복 요청 합치기
- mutation 후 경로 단위 캐시 무효화
- `createHttpError` 구조: 서버 응답 전체가 `error.details`에 담김

### 화면 동기화
- `workspaceDataEvents` + `useWorkspaceRefreshOnEvent`: 브라우저 CustomEvent 기반
- 서버 push(WebSocket/SSE) 없음 — 다른 사용자 변경은 재조회 시점에만 반영

### 다국어
- 지원: `ko`, `en`, `vi`
- `uiMessages`, `staticOptionRegistry`로 텍스트 중앙 관리

---

## 백엔드 아키텍처

### 도메인 라우팅
모듈 라우터: `organizations`, `org-memberships`, `employees`, `factories`, `lines`, `payroll`  
나머지는 `index.ts` 직접 라우트.

### 접근 제어 (`middleware/access.ts`)
- 구독 상태(`TRIAL`, `ACTIVE`, `GRACE`) 기반 워크스페이스 접근 제어
- `entryType` 분기: `SYSTEM` / `ORG` / `ONBOARDING`
- 조직 역할별 메뉴 접근 정책은 `SystemSetting`의 `ROLE_ACCESS_POLICY`에 공용 저장한다.
- `GET/PUT /system/access-policy`는 시스템 관리자만 사용하며, `/auth/context`가 현재 정책을 각 조직 계정에 전달한다.
- 프론트의 사이드바와 보호 라우트는 같은 `accessPolicy`를 사용한다. 정책 조회와 `/auth/context`는 계정 전환 및 저장 직후 반영을 위해 GET 캐시를 사용하지 않는다.
- `생산 분석`(`/production-analysis`)과 `작업 기록`(`/work-history`)은 별도 권한 항목이다. 각각 `PRODUCTION_ANALYSIS`, `WORK_HISTORY` feature key를 사용하며, 접근 권한 화면에서 함께 토글되면 안 된다.
- `수익 분석`(`/revenue-analysis`)과 `사업체`(`/business`)도 별도 권한 항목이다. 각각 `REVENUE_ANALYSIS`, `BUSINESS` feature key를 사용하며, 접근 권한 화면에서 함께 토글되면 안 된다.
- 직원 등록/수정, 가입 승인/반려, 퇴사/재입사 같은 직원 관리 mutation API도 역할명 하드코딩이 아니라 `ROLE_ACCESS_POLICY`의 `EMPLOYEE` 권한을 사용한다.
- 직원 관리의 신규 추가는 `/org-memberships` 생성 시 employee 기본정보(이름, 공장, 직무, 급여 타입, 사번, 입사/퇴사일)를 함께 저장한다. 빈 draft row 정리용 삭제는 이름 등 핵심 프로필이 비어 있고 출퇴근/라인배정/작업기록이 없는 membership+employee 쌍에만 허용한다.
- 접근 권한 화면의 메뉴 트리는 `MainLayout`의 실제 SaaS 메뉴 blueprint를 사용하므로 그룹, 순서, 메뉴명, 비활성 상태와 현재 언어를 그대로 반영한다.

### 감사 필드
- `AsyncLocalStorage`로 요청 주체 추적, Prisma extension으로 `createdBy`/`updatedBy` 자동 주입

### 헬스체크
- `GET /health`: 프로세스 상태
- `GET /ready`: 준비 완료 전 503
- DB 연결 실패 시 재시도 (`STARTUP_DB_MAX_RETRIES` 기본 5)

---

## 핵심 API 맵

| 영역 | 엔드포인트 |
|---|---|
| 인증 | `GET /auth/context` |
| 조직/멤버십 | `GET/POST /organizations`, `PATCH /organizations/:id/subscription`, `GET/POST /org-memberships` |
| 인사/라인 | `GET/POST /employees`, `GET/POST /factories`, `GET/POST /lines`, `POST /line-assignments/assign\|unassign` |
| 주문/스타일 | `GET/POST/PUT/DELETE /orders`, `POST /orders/:orderId/modification-lock`(§40 — 잠글 때만 카드/배정 동기화), `GET/POST/PUT/DELETE /styles`, `POST /styles/import` |
| 배정 | `GET /assignment-plans`, `PATCH /assignment-plans/:externalId/production-complete`, `PATCH /assignment-plans/:externalId/final-quantity`, `GET /assignment-board-view`, `GET /assignment-cards`, `GET /line-month-capacity` |
| 배정 (deprecated) | `POST /assignment-plans/:externalId/close` (`production-complete`로 내부 위임, Deprecation 헤더 반환) |
| 검수 이력 | `GET /assignment-plans/:externalId/qc-history`, `POST /qc-pass-events`, `PATCH /qc-pass-events/:id/cancel` |
| 작업기록 | `GET/POST/PUT/DELETE /work-logs` |
| 출퇴근 | `GET/PUT /attendance-entries` |
| 급여 | `GET /payroll`, `POST /payroll/lock`, `DELETE /payroll/snapshots/:month` |
| 시스템 | `GET /system/onboarding-requests`, `PATCH /system/company-requests/:id/approve\|reject` |
| AT 동기화 | `POST /at-sync/run-now` |

---

## 환경 변수

### 프론트 `.env`
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_CANONICAL_ORIGIN`
- `VITE_ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT`
- `VITE_APP_VERSION`

### 백엔드 `.env`
- `DATABASE_URL`, `DIRECT_URL`
- `PORT`
- `BUSINESS_TIME_ZONE`
- 코드 기본 보정: `DIRECT_URL ||= DATABASE_URL`, `PRISMA_CLIENT_ENGINE_TYPE ||= "binary"`
- `WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER`는 `.env.example`에만 있고 실제 코드 어디서도 읽지 않는 죽은 설정이다(2026-07-05 grep으로 확인). 실제로 작업기록 수량이 배정 수량 대비 초과되는 걸 막는 코드는 없다.
- `Factory.managementStartDate`는 스케줄러/계획부하 계산과 무관하다. 작업기록 엑셀 임포트 시 "이 날짜 이전 데이터는 거부"하는 검증에만 쓰인다(2026-07-05 확인). 스케줄 계산의 유일한 기준점은 §25/§34의 anchor(마지막 실제 작업기록 다음 근무일)다.

---

## 기능 상태

| 영역 | 상태 |
|---|---|
| 로그인/권한/온보딩 | 운영 가능 |
| 조직/멤버십/구독 | 운영 가능 |
| 주문/스타일/고객 | 운영 가능 |
| 라인/작업자 배치 | 운영 가능 |
| 배정 보드 | 운영 가능 (고도화 중) |
| 작업기록(일/월) | 운영 가능 |
| 출퇴근 | 운영 가능 |
| 급여 | 운영 가능 |
| 재고 | 프로토타입 |
| ST Review / Shipment Review | 플레이스홀더 |
| 생산계획 보드 | 코드 구현됨, 메뉴 비활성화 |
| 대시보드 | 플레이스홀더 |
| 휴일 관리 | localStorage 기반 (서버 미저장) |

---

## 테스트 기준 데이터 (Baseline v1.9)

- Baseline ID: `test-baseline-v1.9` (Captured: 2026-03-10)
- 단일 진입점: `backend/scripts/reset-to-baseline.js`
- 별도 seed/reset 스크립트 추가 금지

### 계정
- 시스템 관리자: `system-admin@test.local` (리셋 시 보존)
- TSMF 조직: `manufacturer-admin/operator/accountant@test.local`
- TSBR 조직: `brand-admin/operator/accountant@test.local`
- 작업자: `line1-worker01~20@baro.local`, `line2-worker01~20@baro.local` (각 라인 20명)

### 기준 데이터
- 공장: `Sample Factory` (목표 월급: 8,000,000 VND, 초당 10.68 VND)
- 라인: `Sample Line 1`, `Sample Line 2`
- 스타일 3개: `25SS-T001` (공정 8개), `25SS-P002` (9개), `25FW-J003` (10개)
- 공정: `P01~P10`
- 컬러: WHITE, BLACK, NAVY, GRAY-MEL, LT-BLUE, MID-BLUE, INDIGO
- 리셋 시 WorkOrder/AssignmentCard/AssignmentPlan 삭제, WorkLog/WorkRecord는 보존
- 리셋 스크립트는 `WorkOrder`를 새로 만들지 않는다(직접 확인, `reset-to-baseline.js`에 관련 코드 없음). §40(2026-07-05)부터 카드는 주문을 **잠글 때만** 생성되므로, 리셋 후 배정 보드에서 카드를 보려면 테스트용 주문을 만든 뒤 반드시 잠가야 한다 — 저장만으로는 더 이상 카드가 생기지 않는다.

### 회귀 테스트
```
npm run test:time-date
npm run test:regression
```
- `test:quantity-change`(`scripts/quantity-change-regression.test.mjs`, 대상 `frontend/src/utils/quantityChangeBoard.mjs`)는 2026-07-08 삭제했다. §39에서 프로덕션 호출부(`OrderList.jsx`의 이중 저장 경로)가 제거된 뒤 계속 죽은 코드/테스트로 남아 있었고(§39/§45/§46/todo.md에 반복 기록), 테스트 자체도 ST bucket 없이 공정의 `pt` 값만으로 카드 status가 `'ST'`가 되길 기대해 이 문서의 ST/PT/CT 분리 원칙과 어긋났다. `package.json`의 `test:quantity-change` 스크립트와 `test:regression`의 참조도 같이 제거했다.

---

## Railway 배포

### 구조
- `backend` 서비스: Root Directory `/backend`, Config `/backend/railway.json`, Healthcheck `/health`
- `frontend` 서비스: Root Directory `/frontend`, Config `/frontend/railway.json`, Healthcheck `/health`
- DB: Railway Postgres
- Auth: Supabase Auth

### 주의사항
- `DATABASE_URL`과 `DIRECT_URL`은 Railway Postgres 연결 문자열 또는 Railway variable reference로 설정
- Prisma 스키마는 `DIRECT_URL` 기준 동작
- Railway 도메인 Target Port는 수동 고정하지 말고 기본 감지값 사용
- `VITE_*` 값은 빌드 시점에 포함 → 변경 시 프론트 재배포 필요

### 502 트러블슈팅 순서
1. `/backend/railway.json` 적용 확인
2. 배포 로그에서 `API running on http://0.0.0.0:<PORT>` 확인
3. `https://<backend-domain>/health` → `{"ok":true}` 확인
4. `VITE_API_BASE_URL` 맞추고 프론트 재배포

---

## 기술 부채

1. `backend/src/index.ts` 단일 파일 비대화 — 도메인 경계 흐림
2. 실시간 동기화 부재 — 다중 사용자 동시 편집 시 서버 push 없음
3. 휴일 관리 localStorage 의존 — 계정/기기 간 일관성 없음
4. 플레이스홀더 다수 — 권한, 검토 화면 미완성

---

## 유지보수 체크리스트

기능 변경 시 최소 확인:
- 권한: `SYSTEM / ORG / ONBOARDING` 분기 영향
- 구독 상태: `TRIAL/ACTIVE/GRACE/SUSPENDED` 접근 영향
- 캐시: `apiClient` 무효화 맵 반영 여부
- 다국어: `ko/en/vi` UI 메시지 누락 여부
- 데이터: Prisma schema/마이그레이션/리셋 스크립트 동기화
- 회귀: `test:regression` 통과 여부
- 문서: `AGENTS.md` 업데이트 여부
- 배포 준비: 변경 후 검증 결과를 확인하고, 관련 변경분을 커밋한 뒤 원격 브랜치에 푸쉬한다.
- **커밋/푸쉬 자동화 (2026-07-09 사용자 확정)**: 이 저장소에서는 코드 변경(버그 수정, 기능 추가 등)을 완료하고 검증(빌드/테스트)까지 통과하면, 커밋과 `git push`를 사용자에게 다시 물어보지 않고 바로 수행하는 것이 표준 절차다. 매번 "커밋/푸쉬 할까요?"라고 재확인하지 않는다. 단, 아래는 여전히 예외로 확인 후 진행한다:
  - `git push --force`, `git reset --hard`, 브랜치/커밋 삭제 등 되돌리기 어려운 파괴적 작업
  - 원인 분석만 요청받았거나 사용자가 명시적으로 "커밋하지 마"/"제안만 해봐"라고 한 작업
  - main이 아닌 다른 브랜치 전략(PR 생성 등)이 필요할 수 있는 큰 변경

---

## Time Naming Examples

### 핵심 규칙
- `quantityBucket`: ST 조회용 수량 버킷 key다.
- `timesPerPiece`: 공정을 설명하는 메타데이터다. 예: `주머니 달기 2회`, `May miệng túi x2`.
- `standardProcessStSeconds`: 스타일 표준표에서 조회한 공정 row 전체의 1장 기준 ST다.
- `snapshotProcessCtSeconds`: assignment snapshot에 저장된 공정 row 전체의 1장 기준 CT다.
- `resolvedProcessStSeconds`: 화면/저장 직전 실제 계산에 사용되는 공정 row 전체의 1장 기준 ST다.
- `pieceStTotalSeconds`: 한 벌 기준 전체 ST 합이다.
- `pieceCtTotalSeconds`: 한 벌 기준 전체 CT 합이다.
- `assignmentStTotalSeconds`: assignment 전체 수량 기준 ST 합이다.
- `assignmentCtTotalSeconds`: assignment 전체 수량 기준 CT 합이다.
- `cardStTotalSeconds`: card 전체 수량 기준 ST 합이다.

### 예시 1: 반복횟수가 이름 안에 들어간 공정
- 공정명: `주머니 달기 2회`
- `timesPerPiece = 2`
- `standardProcessStSeconds = 500`

이 의미는 아래와 같다.
- `주머니 달기 2회`라는 공정 row 전체가 1장 기준 `500초`
- 계산은 `500 × 수량`
- 계산을 `500 × 2 × 수량`으로 하면 안 된다

### 예시 2: 선택 방식 공정
- 대상=`주머니`
- 동작=`달기`
- 반복횟수=`2`
- `standardProcessStSeconds = 500`

이 의미는 아래와 같다.
- `주머니 + 달기 + 2회` 조합 전체가 공정 row 하나다
- `500초`는 그 row 전체의 1장 기준 시간이다
- 반복횟수는 표준화/번역/표현용 메타데이터이며 ST/PT/CT에 다시 곱하지 않는다

### 예시 3: 한 벌 기준 ST 합
- 공정 A: `12초`
- 공정 B: `주머니 달기 2회`, `500초`
- 공정 C: `8초`

이때 한 벌 기준 합은 아래와 같다.
- `pieceStTotalSeconds = 12 + 500 + 8 = 520초`

### 예시 4: assignment 전체 ST 합
- `pieceStTotalSeconds = 520초`
- assignment 수량 = `100장`

이때 assignment 전체 합은 아래와 같다.
- `assignmentStTotalSeconds = 520 * 100 = 52000초`

### 예시 5: split 정책
- `100장` card를 `60장`, `40장`으로 split하면
- 각 assignment는 자기 수량 버킷 기준 ST를 다시 조회해 계산한다
- 단, 공정 row 시간 자체를 `timesPerPiece`로 다시 곱하지는 않는다

### 예시 6: CT의 의미
- 사용자가 CT를 안 바꾸면 `snapshotProcessCtSeconds = resolvedProcessStSeconds`
- 사용자가 급여 보정을 위해 CT를 올리면 그 공정 row 전체 CT만 바뀐다
- CT를 올려도 ST 표준값 자체가 바뀌는 것은 아니다

### 예시 7: AT의 의미
- 공정 AT 모델: `AT(q) = a*q + b`
- AT도 반복횟수 메타데이터를 다시 곱하는 모델이 아니다
- 실제 작업기록으로 학습된 공정 row 전체 시간 모델이다

### 신규 문서/리뷰에서 피할 이름
- `totalSt`
- `totalSeconds`
- scope 없는 `process.quantity`

대신 아래처럼 쓴다.
- `cardStTotalSeconds`
- `assignmentStTotalSeconds`
- `pieceStTotalSeconds`
- `timesPerPiece`

---

## 2026-06-04 Time Quantity Latest Lock

이 섹션은 시간/수량 개념에 대한 최신 잠금 규칙이다.
위 문서의 예전 예시나 과거 구현 메모와 충돌하면 이 섹션을 우선한다.

### 1. `quantity`는 하나가 아니다

반드시 아래 축을 분리해서 읽는다.

- `timesPerPiece`
  - 공정을 설명하는 메타데이터다.
  - 예: `주머니 달기 2회`, `May miệng túi x2`
  - 시간 계산 변수로 다시 곱하지 않는다.

- `bucketQuantity`
  - ST 표준 조회용 수량 버킷 key다.
  - 예: `40`, `60`, `100`

- `cardQuantity`
  - 원본 카드가 몇 장인가를 뜻한다.

- `assignmentQuantity`
  - 실제 배정된 assignment가 몇 장인가를 뜻한다.

- `producedQuantity`
  - 작업기록에서 실제 몇 장 생산했는가를 뜻한다.

### 2. 시간 필드의 기준 단위

PT/ST/CT는 모두 "공정 row 1개를 1장 수행하는 전체 시간"이다.

예:
- 공정명: `주머니 달기 2회`
- `timesPerPiece = 2`
- `bucketStSeconds = 500`

이 의미는 아래와 같다.
- `주머니 달기 2회`라는 공정 row 전체가 `500초`
- 계산은 `500 × 수량`
- `500 × 2 × 수량`이 아니다

### 3. 공정 row 예시

스타일 `AJ1972`에 아래 공정 row가 있다고 가정한다.

- `주머니 상침`: `12초`
- `주머니 달기 2회`: `500초`
- `어깨 봉제`: `8초`

한 벌 기준 ST 합은

- `pieceStTotalSeconds = 12 + 500 + 8 = 520초`

즉:
- `timesPerPiece`가 `2`여도 ST를 다시 곱하지 않는다
- 반복 의미는 이름/표현/번역용 메타데이터다

### 4. assignment 전체 ST 합 예시

위 예시에서 `assignmentQuantity = 60`이면

- `assignmentStTotalSeconds = 520 * 60 = 31200초`

즉:
- 한 벌 기준 합은 `pieceStTotalSeconds`
- assignment 전체 합은 `assignmentStTotalSeconds`

### 5. split 정책

`100장` 카드/assignment를 `60장`과 `40장`으로 split할 때 기존 총초를 비율로 나누지 않는다.

올바른 방식:
1. `60장` 버킷 기준 ST를 다시 조회
2. `40장` 버킷 기준 ST를 다시 조회
3. 각각 새 `pieceStTotalSeconds`를 계산
4. 각각 새 `assignmentStTotalSeconds`를 계산

즉 split은 "비율 분배"가 아니라 "split 수량 기준 재조회"다.

### 6. CT snapshot 정책

CT는 assignment snapshot 전용값이다.

- 기본은 `ST = CT`
- 필요하면 특정 assignment에 한해 CT를 올릴 수 있다
- CT는 급여 계산 기준이다
- CT는 스케줄 길이 계산 기준이 아니다
- CT 행 값도 공정 row 전체의 1장 기준 시간이다

최신 구조:
- snapshot은 CT 중심 구조다
- ST는 snapshot에 영구 저장하지 않는다
- ST는 최신 전역 표준(`StyleProcessStandard.bucketStSeconds`)에서 다시 읽어 계산한다

저장 설계:
- persisted snapshot은 CT만 저장
- ST 수정값은 저장 요청 payload의 write-only draft로 전달
- 백엔드는 그 draft로
  1. `StyleProcessStandard.bucketStSeconds` 역반영
  2. `pieceStTotalSeconds` / `assignmentStTotalSeconds` 재계산
  3. persisted snapshot에는 ST를 남기지 않음
- `PUT /assignment-board-state`의 최종 CT 저장 책임은 서버 검증이다. 프론트가 보낸 `assignmentCtSnapshot`이나 프론트 `styles` 캐시를 그대로 최종 신뢰하지 않고, 편집 가능한 배정은 해당 `AssignmentCard.styleId` FK로 라이브 스타일 공정을 조회해 CT 스냅샷을 새로 만들 수 있어야 한다. 기존 DB에 유효한 스냅샷이 있는데 클라이언트가 빈/null 스냅샷을 보내면 기존 값을 보존한다. 라이브 기준으로도 만들 수 없고 기존 유효 스냅샷도 없으면 409로 저장을 막고 진단 로그를 남긴다.

### 7. ST 수정 정책

assignment 상세에서 ST를 수정하면
그 값은 해당 assignment에만 머무는 값이 아니다.

정책:
- assignment 상세 ST 수정
- 최신 표준 ST로 간주
- `StyleProcessStandard`에 역반영

### 8. 필드 canonical naming

버킷별 ST 저장값:
- `bucketStSeconds`

버킷별 ST 배열:
- `stBuckets`

assignment CT snapshot 공정 CT:
- `snapshotCtSeconds`

assignment CT snapshot 전체 CT 합:
- `assignmentCtTotalSeconds`

한 벌 기준 ST / CT 합:
- `pieceStTotalSeconds`
- `pieceCtTotalSeconds`

card 전체 ST 합:
- `cardStTotalSeconds`

assignment 전체 ST / CT 합:
- `assignmentStTotalSeconds`
- `assignmentCtTotalSeconds`

WorkLog 헤더 CT 합:
- `workLogCtTotalSeconds`

AT 모델 계수:
- `atModelParams`

runtime 조회값:
- `exactStSeconds`

### 9. 2026-05-26 추가 잠금

아래는 2026-05-26 사용자 확정 답변이다.

- `AssignmentPlan.ctSnapshot`은 물리 DB 컬럼명, Prisma field, API key, 프론트 접근자까지
  전부 `assignmentCtSnapshot`으로 맞춘다
- `AssignmentBoardState.assignments[].ctSnapshot` key도 같이 `assignmentCtSnapshot`으로 바꾼다
- `style.processes[].stValues`는 `stBuckets`로 바꾼다
- `style.processes[].stValues[].quantity`는 `bucketQuantity`로 바꾼다
- `style.processes[].stValues[].seconds`는 `bucketStSeconds`로 바꾼다
- nested snapshot JSON의 `totalCtSeconds`는 `assignmentCtTotalSeconds`로 바꾼다
- snapshot은 최종적으로 CT-only 구조로 정리한다
  - persisted snapshot에는 ST를 남기지 않는다
  - ST 수정값은 저장 요청 payload의 write-only draft로만 전달한다
  - 백엔드는 그 draft로 전역 ST 역반영과 ST 총합 재계산을 수행한다
- 저장 시 ST draft가 없으면 전역 ST 역반영은 skip한다
- assignment는 저장 시점의 공정/표준 구성을 고정한다
  - 이후 스타일 공정이 바뀌어도 기존 assignment는 자동 갱신하지 않는다
  - 다만 assignment 자체에 구조 변경이 생기면 최신 스타일 공정/표준 기준으로 다시 생성한다
  - 구조 변경 예:
    - 배정 취소
    - 배정 이동
    - 날짜 변경
    - 수량 변경
    - split
    - merge
- 완료된 assignment는 읽기 전용이다
  - 상세 열람은 가능
  - 저장/수정/이동/split/merge/cancel은 불가
- `assignmentStTotalSeconds`의 최종 계산 책임은 백엔드 저장 시점에 둔다
  - 프론트 계산값은 참고 입력일 수 있어도 최종 저장값은 백엔드가 재계산해서 확정한다

### 10. 피해야 할 이름

- `quantity` 단독 사용
- `totalSt`
- `totalSeconds`
- scope 없는 `stSeconds`
- scope 없는 `ctSeconds`

최신 문서/리뷰/신규 코드에서는 반드시 scope와 기준을 함께 적는다.

### 11. 2026-05-26 후속 잠금

- 완료 assignment 판정의 단일 소스는 `isCompleted === true`다
  - `completedAt`, `closedAt`은 보조 표시용으로만 쓴다

- `PUT /assignment-board-state` payload에 완료 assignment가 포함되는 것 자체는 정상이다
  - 보드 저장 payload에는 완료/미완료 assignment가 함께 들어올 수 있다
  - 완료 assignment가 DB 기존값과 동일하면 백엔드는 기존값을 그대로 보존하고 나머지 미완료 변경만 저장한다
  - 완료 assignment의 write 필드가 DB 기존값과 하나라도 다르면 요청 전체를 `409`로 reject한다
  - 완료 항목만 조용히 skip하지 않는다
  - 이유: 완료 assignment 변경분이 들어온 것은 프론트 버그 또는 동시성 문제이므로 저장 성공처럼 보이면 안 된다
  - 완료 assignment 변경 감지 대상 write 필드는 `toAssignmentPlanWriteData()`가 저장하는 실데이터 필드 전체다
    - 포함: `lineId`, `cardId`, `orderNo`, `customer`, `label`, `colorId`, `colorName`, `previewUrl`, `imageUrl`, `thumbnailUrl`, `quantity`, `originOrderId`, `basis`, `ctTotalSeconds`, `assignmentCtSnapshot`, `color`, `stripeColor`, `assignmentStTotalSeconds`, `startIndex`, `endIndex`, `startDayOffsetPercent`, `startDayPercent`, `endDayPercent`
    - 제외: `updatedAt`, `version`, `versionUpdatedAt`, `dbId`, `createdAt` 같은 서버/동기화 메타 필드
    - 완료 상태 자체(`isCompleted`, `completedAt`, `finalQuantity`)는 board save가 쓰지 않으며 전용 완료 endpoint 소관이다

- ST draft가 없고 구조 변경도 없으면 기존 `assignmentStTotalSeconds`를 유지한다
  - 예:
    - assignment를 열어서 CT만 바꾸고 저장
    - ST는 수정하지 않음
    - split / merge / 이동 / 날짜 변경 / 수량 변경도 없음
    - 이 경우 기존 `assignmentStTotalSeconds` 유지

- ST draft가 있거나 구조 변경이 있으면 백엔드가 최신 표준 ST로 재계산한다
  - 구조 변경 예:
    - split
    - merge
    - 배정 이동
    - 날짜 변경
    - 수량 변경
    - 배정 취소 후 재생성

- 단순 이동/날짜 변경도 구조 변경으로 본다
  - 수량이 그대로여도
  - 라인 이동 또는 날짜 변경이 있으면
  - 백엔드가 최신 표준 ST로 다시 계산한다

- 예전 assignment를 단순 열람할 때는 예전 공정 구성을 그대로 유지한다
  - 스타일 공정이 나중에 바뀌어도 자동 재매핑하지 않는다
  - 실제 배정 변경을 할 때만 최신 공정/표준 기준으로 다시 생성한다
  - snapshot 공정이 현재 StyleProcess DB에 없으면
    - 해당 공정 행은 읽기 전용으로 표시한다
    - 삭제/자동 재매핑하지 않는다
    - 과거 급여 기준이 바뀌면 안 되기 때문이다

- 스타일 자체는 삭제 불가를 전제로 본다
  - 다만 스타일의 공정은 추가/삭제/수정 가능하다

- 라인 인원 변경만 발생했을 때는 `assignmentStTotalSeconds`를 재계산하지 않는다
  - 라인 인원 변경은 ST 변경 사유가 아니다
  - 대신 라인 capacity / 일정 / reflow 재계산 대상으로 본다
  - 라인 인원은 날짜 기준 이력으로 추적한다
    - 직원 퇴사일
    - 라인 이동일
    - 라인 편성 변경일
    에 따라 해당 날짜부터 capacity / reflow 계산에 반영한다

- reflow로 밀린 다른 assignment의 `startIndex/endIndex` 변경도 구조 변경으로 본다
  - 사용자가 A를 이동해서 B, C가 밀리면
  - B, C도 최신 표준 ST 재계산 대상이다

- `stDrafts`가 PUT body에 아예 없거나 빈 객체(`{}`)면 같은 뜻으로 본다
  - 둘 다 "ST 수정 없음"이다
  - 둘 다 전역 ST 역반영 skip 처리한다
  - `stDrafts: null`은 잘못된 payload로 보고 reject한다
  - `stDrafts`에 assignment/snapshot에 없는 processKey가 오면
    - 해당 key만 무시하고 나머지는 정상 처리한다
    - 저장 전체를 실패시키지 않는다
    - 프론트에는 어떤 공정 key가 무시됐는지 안내 토스트를 보여준다

- 백엔드 구조 변경 감지 기준은 아래 4개다
  - `quantity`가 DB 기존 값과 다름
  - `lineId`가 DB 기존 값과 다름
  - `startIndex` 또는 `endIndex`가 DB 기존 값과 다름
  - 해당 `externalId`가 DB에 없음
  - 위 중 하나라도 해당하면 구조 변경으로 간주하고 `assignmentStTotalSeconds` 재계산 대상이다
  - `coverageStartDate/coverageEndDate`는 WorkLog 기간 필드이며 assignment 구조 변경 감지 기준이 아니다
  - scheduler assignment의 날짜/위치 기준은 `AssignmentPlan.startIndex/endIndex`다

- 백엔드가 `assignmentStTotalSeconds`를 재계산하면 그 값은 반드시 세 군데에 같은 값으로 반영한다
  - `AssignmentBoardState.assignments[]`
  - `AssignmentPlan.assignmentStTotalSeconds`
  - `PUT /assignment-board-state` 응답 payload
  - 프론트가 보낸 `stTotalSeconds`를 board state에 먼저 저장하고 DB plan만 나중에 재계산하면 안 된다
  - 이유: 저장 직후 프론트 상태와 DB plan 값이 달라져 다음 저장/충돌 감지가 오염된다
  - PUT 1회 안에서 여러 assignment가 재계산되면 Style/StyleProcess/StyleProcessStandard 조회는 batch/cache로 묶는다
  - reflow cascade로 밀린 B, C, D도 구조 변경이면 재계산 대상이며, 성능 때문에 제외하지 않는다

- snapshot ST 제거 전에는 `StyleProcessStandard` 백필이 선행되어야 한다
  - 기존 활성 assignment의 `assignmentCtSnapshot.processes[].stSeconds`를 읽어 `StyleProcessStandard.bucketStSeconds`로 일회성 upsert한다
  - 백필 대상은 완료/미완료를 포함한 활성 assignment이며, 삭제/취소된 assignment는 제외한다
  - 백필 검증 전에는 `assignmentCtSnapshot.processes[].stSeconds`와 `assignmentCtSnapshot.totalStPerPieceSeconds`를 제거하지 않는다
  - 2026-06-02 Phase 7에서 백필 검증 통과 후 위 두 snapshot ST 복사 필드는 제거됐다
  - 자연스럽게 PUT이 돌며 채워지기를 기다리는 방식은 금지한다
  - 이유: 한 번도 PUT되지 않은 assignment는 기존 sync 경로를 타지 않아 ST 표준 row가 비어 있을 수 있다

- `final-quantity` 차단 기준은 최종적으로 `isCompleted === true` 단독으로 본다
  - 단, 이 정책 전환 전에 운영 DB에서
    - `isCompleted = false`
    - `completedAt IS NOT NULL`
    레코드가 있는지 먼저 확인한다
  - 있으면 데이터 정합성 정리 후 전환한다
  - 정합성 정리 방식:
    - `isCompleted = false`
    - `completedAt IS NOT NULL`
    레코드는 `isCompleted = true`로 올려서 완료 상태로 맞춘다
    - `completedAt`을 지우지 않는다

### 12. 2026-05-26 Phase 2 implementation status

- Implemented in code:
  - Frontend board save sends write-only `stDrafts` in `PUT /assignment-board-state`.
  - Backend rejects invalid `stDrafts` payloads, including `stDrafts: null`.
  - Backend ignores `stDrafts` process keys that are not present in the assignment snapshot and returns `ST_DRAFT_PROCESS_IGNORED` warnings for frontend toast display.
  - Backend updates `StyleProcessStandard` only from explicit `stDrafts`; board save no longer reverse-syncs every `snapshot.processes[].stSeconds`.
  - Backend recalculates `stTotalSeconds` before saving `AssignmentBoardState`, so board state JSON, `AssignmentPlan`, and the PUT response share the same recalculated value.
  - Backend treats `quantity`, `lineId`, `startIndex`, `endIndex`, or missing DB plan row as structural ST recalculation triggers.
- Still not implemented in this phase:
  - Physical rename of DB columns or JSON keys.
  - Removal of `snapshot.processes[].stSeconds` or `snapshot.totalStPerPieceSeconds`.
  - Frontend split/merge visual calculation cleanup; backend save now protects persisted values, but UI-side ratio/sum cleanup remains a later phase.

### 13. 2026-05-26 Phase 3 implementation status

- Implemented in code:
  - Frontend split/merge card state now recalculates `stTotalSeconds`, `totalPt`, `totalAt`, and `totalSt` from current style processes when the style is available.
  - Split assignment state resets CT (`ctTotalSeconds`, `ctSnapshot`) and recomputes schedule range from the recalculated remaining `stTotalSeconds`.
  - Merge assignment state resets CT (`ctTotalSeconds`, `ctSnapshot`) and recomputes schedule range from the merged quantity's recalculated `stTotalSeconds`.
  - If the style/process source is unavailable, split/merge keeps a fallback path using the previous scaled or summed values. Backend Phase 2 recalculation remains the persisted source of truth.
- Still not implemented in this phase:
  - Backend/API endpoint dedicated to previewing split/merge recalculated totals before save.
  - Physical rename of DB columns or JSON keys.
  - Removal of `snapshot.processes[].stSeconds` or `snapshot.totalStPerPieceSeconds`.

### 14. 2026-05-27 Phase 5A implementation status

- Scope:
  - This phase covers only Style/process JSON naming.
  - Assignment snapshot/card JSON rename and DB column rename remain separate later phases.
- Implemented in code:
  - `Style.processes[].quantity` is now written as `timesPerPiece`.
  - `Style.processes[].stValues` is now written as `stBuckets`.
  - `Style.processes[].stValues[].quantity` is now written as `bucketQuantity`.
  - `Style.processes[].stValues[].seconds` is now written as `bucketStSeconds`.
  - Frontend/backend read paths keep dual-read fallback for old Style JSON keys:
    `timesPerPiece ?? quantity`, `stBuckets ?? stValues`,
    `bucketQuantity ?? quantity`, and `bucketStSeconds ?? seconds`.
  - `backend/migration_fix.sql` includes a bulk JSON migration for `Style.processes`.
- Still not implemented in this phase:
  - `AssignmentPlan.ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentBoardState.assignments[].ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentCard.payload.quantity/totalSt/totalPt/totalAt` JSON rename.
  - `StyleProcessStandard.quantity/stSeconds` DB column rename.
  - `AssignmentPlan.quantity/stTotalSeconds/ctTotalSeconds` DB column rename.
  - Removal of Style JSON dual-read fallback.

### 15. 2026-05-27 Phase 6A implementation status

- Scope:
  - This phase covers only `StyleProcessStandard` physical column naming.
  - AssignmentPlan/AssignmentBoardState/AssignmentCard rename remains pending.
- Implemented in code:
  - Prisma schema uses `StyleProcessStandard.bucketQuantity`.
  - Prisma schema uses `StyleProcessStandard.bucketStSeconds`.
  - The unique input is now `styleProcessId_bucketQuantity`.
  - Backend reads/writes StyleProcessStandard through `bucketQuantity` and `bucketStSeconds`.
  - `backend/migration_fix.sql` includes idempotent physical rename SQL:
    `quantity -> bucketQuantity`, `stSeconds -> bucketStSeconds`.
- Deployment note:
  - `railway:predeploy` runs `prisma generate`, then `migration_fix.sql`, then `db push`.
  - Therefore Prisma schema must match the final physical DB column names for this phase.
  - Do not use `@map("quantity")` or `@map("stSeconds")` after the migration SQL renames the columns.
- Still not implemented in this phase:
  - `AssignmentPlan.ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentPlan.quantity/stTotalSeconds/ctTotalSeconds` column rename.
  - `AssignmentCard.payload` JSON key rename.
  - Removal of snapshot ST fields.

### 16. 2026-05-27 Phase 6B implementation status

- Scope:
  - This phase covers only `StyleProcess.processQuantity -> timesPerPiece` physical column naming.
  - AssignmentPlan/AssignmentBoardState/AssignmentCard rename remains pending.
- Implemented in code:
  - Prisma schema uses `StyleProcess.timesPerPiece`.
  - Backend StyleProcess storage writes `timesPerPiece`.
  - Backend StyleProcess reads and ST recalculation use `timesPerPiece`.
  - `backend/migration_fix.sql` includes idempotent physical rename SQL:
    `processQuantity -> timesPerPiece`.
- Boundary:
  - Frontend local variables named `processQuantity` are not DB columns and may remain local calculation variables.
  - Assignment CT snapshot `processes[].quantity` remains pending until snapshot JSON rename.
  - Legacy input fallback still accepts `processQuantity` from old JSON/API payloads.

### 17. 2026-05-27 Phase 6C implementation status

- Scope:
  - This phase covers top-level assignment CT snapshot naming:
    `AssignmentPlan.ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentBoardState.assignments[].ctSnapshot -> assignmentCtSnapshot` is migrated and new writes use `assignmentCtSnapshot`.
- Implemented in code:
  - Prisma schema uses `AssignmentPlan.assignmentCtSnapshot`.
  - Backend reads assignment snapshots with dual-read fallback:
    `assignmentCtSnapshot ?? ctSnapshot`.
  - Backend writes AssignmentPlan and AssignmentBoardState with `assignmentCtSnapshot`.
  - Frontend writes assignment board state with `assignmentCtSnapshot`.
  - `backend/migration_fix.sql` physically renames the DB column and migrates board-state JSON keys.
- Boundary:
  - Snapshot nested keys are handled by Phase 6D, not by this phase:
    `totalCtSeconds`, `totalCtPerPieceSeconds`, `processes[].quantity`,
    `processes[].ctSeconds`, and `processes[].ctPerPieceSeconds`.
  - Snapshot ST fields are still present until the final backfill/removal phase.

### 18. 2026-05-27 Dual-read cleanup backlog

- Dual-read fallback is temporary migration protection, not permanent application logic.
- Do not remove dual-read fallback in the same phase/commit that introduces a rename or migration.
- Remove fallback only after production data has been migrated and verified.
- Cleanup must be a separate follow-up commit so regressions can be isolated from rename/migration work.
- Before cleanup, verify there are no remaining records that require old-key reads:
  - `Style.processes[].stValues`
  - `Style.processes[].stValues[].quantity`
  - `Style.processes[].stValues[].seconds`
  - `Style.processes[].quantity`
  - `Style.processes[].processQuantity`
  - `AssignmentBoardState.assignments[].ctSnapshot`
  - `AssignmentBoardState.assignments[].ctAgreedSnapshot`
  - `assignmentCtSnapshot.totalCtSeconds`
  - `assignmentCtSnapshot.totalCtPerPieceSeconds`
  - `assignmentCtSnapshot.processes[].quantity`
  - `assignmentCtSnapshot.processes[].ctSeconds`
  - `assignmentCtSnapshot.processes[].ctPerPieceSeconds`
  - old `AssignmentCard.payload` keys:
    `quantity`, `totalPt`, `totalAt`, `totalSt`, `stTotalSeconds`,
    `totalSeconds`, `stSeconds`, `contractedSeconds`
- Cleanup targets after verification:
  - `stBuckets ?? stValues`
  - `bucketQuantity ?? quantity`
  - `bucketStSeconds ?? seconds`
  - `timesPerPiece ?? quantity/processQuantity`
  - `assignmentCtSnapshot ?? ctSnapshot`
  - `assignmentCtTotalSeconds ?? totalCtSeconds`
  - `pieceCtTotalSeconds ?? totalCtPerPieceSeconds`
  - `snapshotCtSeconds ?? ctSeconds`
  - `pieceCtSeconds ?? ctPerPieceSeconds`
- Snapshot ST fallback was removed in Phase 7 after the StyleProcessStandard backfill verification passed.

### 19. 2026-05-27 Phase 6D implementation status

- Scope:
  - This phase covers nested JSON keys inside `assignmentCtSnapshot`.
  - It does not remove snapshot ST fields.
- Implemented in code:
  - Snapshot processes write `timesPerPiece`, `snapshotCtSeconds`, and `pieceCtSeconds`.
  - Snapshot totals write `pieceCtTotalSeconds` and `assignmentCtTotalSeconds`.
  - Frontend/backend normalizers keep dual-read fallback for old nested keys:
    `quantity`, `ctSeconds`, `ctPerPieceSeconds`, `totalCtPerPieceSeconds`, and `totalCtSeconds`.
  - `backend/migration_fix.sql` migrates nested CT keys inside both
    `AssignmentPlan.assignmentCtSnapshot` and
    `AssignmentBoardState.assignments[].assignmentCtSnapshot`.
- Still not implemented in this phase:
  - Snapshot ST field removal.
  - AssignmentCard payload JSON rename.
  - AssignmentPlan `quantity/stTotalSeconds/ctTotalSeconds` physical column rename.

### 20. 2026-05-31 Phase 6E preflight implementation status

- Scope:
  - This phase prepares for snapshot ST removal but does not remove snapshot ST fields.
- Implemented:
  - `backend/migration_fix.sql` updates legacy inconsistent completion rows:
    `isCompleted=false AND completedAt IS NOT NULL` -> `isCompleted=true`.
  - Backend completion checks now use `isCompleted === true` as the assignment completion source.
  - `backend/migration_fix.sql` backfills missing `StyleProcessStandard.bucketStSeconds`
    from active assignment snapshots:
    `assignmentCtSnapshot.processes[].stSeconds`.
  - The backfill preserves existing positive `StyleProcessStandard.bucketStSeconds`
    values and only fills missing/zero standards.
  - The migration emits a notice with:
    `unmatched_processes` and `missing_or_zero_standards`.
  - `ProductionPlanBoard` local process repeat naming was cleaned up to `timesPerPiece`.
- Still blocked:
  - Do not remove `assignmentCtSnapshot.processes[].stSeconds` or
    `assignmentCtSnapshot.totalStPerPieceSeconds` until the backfill notice reports
    zero unmatched processes and zero missing/zero standards in production.
  - Before starting snapshot ST removal, deployment logs must be checked and recorded:
    - `unmatched_processes = 0`
    - `missing_or_zero_standards = 0`
  - If either count is non-zero, stop Phase 7 and inspect the cause first.
    Common causes are `cardId/originOrderId` styleId parsing mismatch or
    snapshot process keys that no longer match `StyleProcess`.

### 21. 2026-05-31 Phase 6F implementation status

- Scope:
  - This phase covers `AssignmentCard.payload` JSON key rename only.
  - It does not remove snapshot ST fields.
- Implemented:
  - Persisted cards now write canonical card keys:
    `cardQuantity`, `cardPtTotalSeconds`, `cardAtTotalSeconds`,
    `cardStTotalSeconds`.
  - Backend card storage strips legacy ambiguous card keys before saving:
    `quantity`, `totalPt`, `totalAt`, `totalSt`, `stTotalSeconds`,
    `totalSeconds`, `stSeconds`, `contractedSeconds`.
  - Frontend board code keeps runtime compatibility aliases after read normalization,
    but PUT payloads send canonical card keys only.
  - `backend/migration_fix.sql` migrates existing `AssignmentCard.payload`
    JSON keys to canonical card keys.
- Still blocked:
  - Do not remove dual-read/runtime compatibility aliases until production
    migration has been applied and verified in a separate cleanup commit.
  - Do not remove `assignmentCtSnapshot.processes[].stSeconds` or
    `assignmentCtSnapshot.totalStPerPieceSeconds` in this phase.

### 22. 2026-06-02 Phase 7 preflight verification status

- Scope:
  - This phase adds an executable verification gate before snapshot ST field removal.
  - It does not remove snapshot ST fields.
- Implemented:
  - Backend script: `npm run verify:snapshot-st-backfill`.
  - The script checks:
    - active snapshot ST process row count
    - `styleLookupFailures`
    - `unmatchedProcesses`
    - `missingOrZeroStandards`
    - `completionInconsistencyRows`
  - Phase 7 can start only when all blocker counts are zero.
- Important:
  - `styleLookupFailures` is stricter than the migration notice because it catches
    `cardId/originOrderId` styleId parsing failures before `StyleProcess` matching.
  - If the script fails, do not remove `assignmentCtSnapshot.processes[].stSeconds`
    or `assignmentCtSnapshot.totalStPerPieceSeconds`.

### 23. 2026-06-02 Phase 7 snapshot ST field removal status

- Scope:
  - This phase removes only persisted ST copies from `assignmentCtSnapshot`.
  - It does not remove `StyleProcessStandard.bucketStSeconds`.
  - It does not remove normal rename dual-read fallback for old CT/card/style keys.
- Implemented:
  - New assignment snapshots no longer write `processes[].stSeconds`.
  - New assignment snapshots no longer write `totalStPerPieceSeconds`.
  - Frontend/backend snapshot normalizers output CT-only process rows:
    `timesPerPiece`, `snapshotCtSeconds`, and `pieceCtSeconds`.
  - Backend ST recalculation no longer reads snapshot ST fallback; it uses
    `StyleProcessStandard.bucketStSeconds` with PT fallback only where policy allows.
  - `backend/migration_fix.sql` removes existing snapshot ST copy fields from
    both `AssignmentPlan.assignmentCtSnapshot` and
    `AssignmentBoardState.assignments[].assignmentCtSnapshot`.
- Boundary:
  - `stDrafts` remains the only board-save path for editing ST.
  - `assignmentStTotalSeconds`/`stTotalSeconds` remains scheduler length data and is not removed.
  - Dual-read cleanup for migrated CT/card/style keys remains a later dedicated cleanup commit.

### 24. 2026-06-02 AssignmentPlan physical column rename status

- Scope:
  - This phase renames only `AssignmentPlan` physical DB/Prisma fields for assignment totals and assignment quantity.
  - It does not rename board state JSON compatibility keys in API payloads.
  - It does not remove normal dual-read fallback.
- Implemented field names:
  - `AssignmentPlan.quantity` -> `AssignmentPlan.assignmentQuantity`
  - `AssignmentPlan.stTotalSeconds` -> `AssignmentPlan.assignmentStTotalSeconds`
  - `AssignmentPlan.ctTotalSeconds` -> `AssignmentPlan.assignmentCtTotalSeconds`
- Runtime/API boundary:
  - Public assignment/board payloads may still expose compatibility keys:
    `quantity`, `stTotalSeconds`, `ctTotalSeconds`.
  - Backend maps those compatibility keys to the canonical Prisma fields at DB write/read boundaries.
  - `AssignmentBoardState.assignments[]` may still use compatibility total keys for now.
- Migration:
  - `backend/migration_fix.sql` performs idempotent three-state column handling:
    old-only, old+new, and new-only.
  - Existing `AssignmentPlan` values are preserved via `COALESCE(new, old)` before dropping old columns.
- Maintenance scripts:
  - Scripts that touch `AssignmentPlan`, `StyleProcess`, or `StyleProcessStandard` must use canonical Prisma fields:
    `assignmentQuantity`, `assignmentStTotalSeconds`, `assignmentCtTotalSeconds`,
    `timesPerPiece`, `bucketQuantity`, `bucketStSeconds`.
- Still separate:
  - Removal of compatibility payload aliases and dual-read fallback is a later cleanup commit after production migration verification.

### 25. 2026-06-04 Scheduler completion planning direction

- Status:
  - Product planning lock. This section records the chosen UX/operation direction before implementation details.
- Completion options considered:
  - `Option 1`: one finishing process on style acts as the completion signal.
  - `Option 2`: user always marks completion manually from assignment/dashboard.
  - `Option 3`: system auto-detects completion from work records, and user only corrects exceptions.
- Chosen direction:
  - Use `Option 3`.
  - Reason:
    - BARO should stay simple for operators.
    - Routine completion state changes should happen automatically from work records.
    - Users must still be able to override mistakes or exceptional cases.
- Current planning policy:
  - The system should auto-switch an assignment to completed when work-record-based progress reaches `>= 100%` of the planned/order quantity.
  - Users must be able to toggle final `completed / incomplete` state from both the dashboard and the assignment board.
  - The dashboard should act primarily as a tracking/report + exception-handling screen, not as a mandatory completion-click flow.
- Follow-up development items after this planning lock:
  - Card progress visualization from work records.
  - Scheduler card length re-adjustment.
  - Scheduler card order/position re-adjustment.
  - Warning UI for overflow or process-quantity imbalance.
- Refined completion policy (2026-06-05):
  - Auto completion/rollback must use only `WorkRecord` rows with explicit `assignmentPlanId`.
  - Work records without `assignmentPlanId` are reference/warning data only; they must not drive official completion state.
  - Official completion quantity should follow the minimum across required process-group totals.
  - Overflow production does not block completion, but must raise a visible warning for review.
  - Before payroll settlement lock, completion state may auto-change again when work logs are corrected.
  - After payroll settlement lock, completion state is frozen; no automatic rollback is allowed.
- Separate emergency recovery concept (2026-06-05):
  - Normal completion rollback and scheduler recovery are different features.
  - Normal rollback is routine app behavior from work-log recalculation before payroll lock.
  - Emergency recovery is a system-admin-only safety tool for scheduler corruption or bad recalculation.
- Emergency recovery must not delete historical cards, work logs, or completion history.
- Emergency recovery should let admins treat all work up to a checkpoint date as closed for scheduler purposes, then reopen scheduling from the next date.
- Example: if scheduler calculation became corrupted after `2026-04-30`, admin may restart scheduler usage from `2026-05-01` without deleting April history.

### 26. 2026-06-05 Meaning Exactness Lock

- AI/code review policy:
  - Canonical naming is not enough by itself.
  - The value stored in that field must also match the exact domain meaning.
  - "Mostly similar" or "close enough" fallback is not acceptable when the scope is different.
- Strict rule:
  - Never populate an assignment-scoped field with WorkLog/WorkRecord meaning as a substitute.
  - Never populate a WorkLog/WorkRecord field with assignment-scoped meaning as a substitute.
  - If the exact meaning is unknown, store `null` or add a new explicit concept.
- Concrete lock:
  - `assignmentQuantity` must mean the planned assignment quantity only.
  - `WorkRecord.quantity` must mean the recorded produced quantity only.
  - `assignmentQuantity = WorkRecord.quantity` is forbidden as a fallback.
  - `assignmentCtTotalSeconds` must mean assignment-level CT total only.
  - `totalCtSeconds` on `WorkLog` must mean WorkLog header CT total only.
- Implementation guidance:
  - When a legacy row has no linked assignment, do not synthesize fake assignment quantity/CT/ST values from work-record values.
  - Keep the assignment-scoped field `null` and treat the row as legacy/unlinked instead.
  - If product behavior needs a visible placeholder concept, add a new explicitly named field instead of overloading an existing canonical field.
- Variable naming guidance:
  - Local/runtime variable names should also reflect exact scope when they carry domain meaning.
  - Example: prefer `workLogCtTotalSeconds` over ambiguous `totalCtSeconds` for a WorkLog-header aggregate variable.

### 27. 2026-06-05 Auto Completion Phase 1 Lock

- WorkLog 저장/수정/삭제는 `assignment isCompleted === true`만으로 차단하지 않는다. 이 차단은 구 생산 현황/수동 완료 레거시로 본다.
- assignment 공식 진행도/완료 판정은 `WorkRecord.assignmentPlanId`가 명확한 행만 사용한다. orphan/추정 매칭 WorkRecord는 공식 완료 근거에서 제외한다.
- 작업기록 기반 자동 완료는 `AssignmentPlan.closedBy = "system:auto-worklog"` 표식으로 남긴다.
- 작업기록 기반 자동 롤백은 위 표식으로 자동 완료된 assignment에만 적용한다. 수동/QC 완료 assignment는 이 자동 롤백이 덮어쓰지 않는다.
- 구 생산 결과 경로 `/production-result`는 2026-06-16 완전히 삭제됐다 (라우트, 페이지, FEATURE_KEYS, 메뉴 권한 전부 제거). 같은 날 별도의 레거시 메뉴 "생산 현황"(`/batch-progress`)도 함께 삭제됐다 — 자세한 내용은 36번 섹션 참고.

### 28. 2026-06-05 Auto Completion Phase 2 Payroll Lock

- 급여 잠금은 assignment 카드별 완료 월 기준으로 판정한다.
- 완료 월은 `AssignmentPlan.productionCompletedAt`를 우선 사용하고, 없으면 `closedAt/completedAt`로 fallback한다.
- 그 완료 월에 `PayrollSnapshot`이 이미 있으면 해당 assignment는 payroll-locked 상태로 본다.
- payroll-locked assignment는 WorkLog 생성/수정/삭제로 변경할 수 없다.
- payroll-locked 상태의 auto-completed assignment는 이후 작업기록 합계가 줄어도 자동 롤백하지 않는다.
- payroll-locked assignment는 `/assignment-plans/:externalId/production-complete`로 수동 재확정할 수 없다.
- progress row는 `isPayrollLocked`, `payrollLockMonth`를 노출할 수 있고, UI는 이 값을 경고/버튼 차단에 사용한다.
- 이 잠금 규칙은 이후 시스템 관리자용 비상 복구 기능과 별개다.

### 28A. 2026-06-18 Board Visibility Follow-up

- Canonical completion statuses are now:
  - `IN_PROGRESS`
  - `REVIEW_REQUIRED`
  - `READY_TO_COMPLETE`
  - `PRODUCTION_COMPLETED`
- line-month capacity UI must group cards by canonical status.
- A card with work progress `100%` must not remain in the active queued group when its `scheduleStatus` is `REVIEW_REQUIRED` or `READY_TO_COMPLETE`.
- Current UI lock:
  - `queued` = still actively in progress
  - `review_required` = progress reached 100% but process quantity exactness needs review
  - `ready_to_complete` = system-validated or manually confirmed work done, but not payroll-finalized
  - `completed` = payroll-finalized canonical completion
- Hiding `PRODUCTION_COMPLETED` assignments from operational boards after payroll is intentionally deferred.
- Reason for defer:
  - payroll detail UX and historical lookup/report requirements are not finalized yet
  - current priority is preserving canonical status semantics and visible grouping first
- Follow-up implementation target:
  - decide whether post-payroll hiding should be frontend-only, API-default filtering, or both
  - once payroll UX is fixed, document the default visibility contract for `/assignment-board-view` and `/line-month-capacity`

### 29. 2026-06-05 Scheduler Length Adjustment Phase 1 Lock

- 이 섹션은 `카드 길이 계산 기준`만 잠근다.
- 카드 순서 재정리(reflow)와 실제 저장 좌표 반영 정책은 아래 `Scheduler Serial Reflow Lock`을 따른다.
- 완료 카드는 기존 완료 로직을 그대로 사용한다. 실제 완료 날짜 기준 표시를 유지한다.
- 미완료 카드는 작업기록 진행률에 따라 길이 조정 대상이 될 수 있다.
- 단, 진행률이 `0%`인 미완료 카드는 길이를 조정하지 않고 원래 계획 길이를 유지한다.
- 진행률이 `0% 초과`이고 `100% 미만`인 미완료 카드는 spillover 길이 조정 대상이다.
- spillover 연장 기준은 실제 속도 예측이 아니라 `계획 길이 기준`이다.
- 기본 개념:
  - `planDays = 원래 계획 길이`
  - `progress = producedQuantity / baselineQuantity`
- `extension = progress > 0 && progress < 1 ? ceil((1 - progress) * planDays) : 0`
- `new visible span = planDays + extension`
- 이 단계의 목적은 `a,b 완료 + c 10%/90%`처럼 미완료 카드에 남은 비율이 얼마든, 작업기록 수정 때마다 남은 일부를 다음 날짜/다음 달로 자연스럽게 넘겨 보이게 하는 것이다.
- 앞 카드가 빨리 끝나서 뒤 카드 시작일이 당겨지는 문제는 길이 공식만으로는 해결되지 않으며, 실제 적용 정책은 아래 직렬 reflow 규칙을 따른다.

### 30. 2026-06-05 Scheduler Serial Reflow Lock

- BARO 스케줄러는 라인 단위로 `무조건 직렬`로 본다. 한 라인의 카드들은 순차 체인처럼 앞 카드의 결과가 뒤 카드 시작에 전파된다.
- 따라서 앞 카드가 늦어지면 뒤 카드들도 모두 같이 밀리고, 앞 카드가 빨리 끝나면 뒤 카드들도 같이 당겨진다.
- 이 reflow는 render-only 표현이 아니라 실제 저장 좌표에도 반영하는 방향을 기본으로 한다.
- 즉 `AssignmentBoardState.assignments[].startIndex/endIndex`와 대응 `AssignmentPlan.startIndex/endIndex`는 직렬 재계산 결과로 업데이트될 수 있다.
- 단, 급여 잠금된 카드와 관리자 복구로 닫힌 과거 구간은 `anchor`로 고정한다. reflow는 그 뒤의 미잠금 카드에만 전파된다.
- period 입력이 있어도 보드 해석은 직렬 체인을 우선한다. 실제 현장 세부 병렬성보다 운영 보드의 순차 계획/재배치를 우선한다.
- 다만 period 입력만으로는 정확한 중간 전환 시점(예: 4/18 종료, 4/19 시작)을 알 수 없으므로, reflow 규칙은 추정 가능한 단일 기준으로 deterministic하게 계산해야 한다.
- 이후 길이/순서 재조정 phase에서는 `카드 길이 계산`과 `라인 전체 직렬 reflow`를 분리해서 설계한다.
### 31. 2026-06-05 WorkLog Completed Assignment Selection Lock

- 완료된 assignment는 새 WorkLog/WorkRecord에서 신규 선택 대상으로 쓰지 않는다.
- `work-log-context`가 내려주는 assignment 목록에서는 `isCompleted === true`인 카드를 제외한다.
- 프론트 WorkDetail의 assignment 선택 목록도 완료 카드를 제외한 상태를 유지한다.
- 다만 이미 해당 completed assignment에 연결되어 저장된 기존 WorkLog/WorkRecord는 예외다.
  - 급여 잠금 전에는 기존 연결 기록의 정정(수정/삭제)을 허용한다.
  - 이 예외는 “기존 연결 유지”에만 해당한다.
  - completed assignment로의 신규 연결 생성은 금지한다.
- 운영 의미:
  - 완료는 “이 카드에 새 작업을 더 쌓지 않는다”는 뜻이다.
  - 완료 후 추가 생산이 필요하면 먼저 assignment를 미완료로 되돌린 뒤 작업기록을 추가한다.

### 32. 2026-06-05 Scheduler Purpose Lock

- 스케줄러의 1차 목적은 과거 실제 작업 날짜를 정밀 복원하는 것이 아니다.
- 스케줄러의 1차 목적은 현재 기준으로:
  - 각 라인에 일이 얼마나 남아 있는지
  - 각 라인이 언제 비는지
  - 어느 라인에 일이 부족한지
  를 보여주는 것이다.
- 카드 길이 계산의 기준 작업량은 `assignmentStTotalSeconds`다.
- WorkLog/WorkRecord는 실제 시간값이 아니라 progress 계산의 근거다.
- 따라서 스케줄러는 `remainingStSeconds = assignmentStTotalSeconds × (1 - progress)`를 중심으로 남은 일감과 라인 비는 시점을 계산한다.
- CT는 급여 기준이므로 스케줄러 길이 계산에 쓰지 않는다.
- AT는 ST 보정 참고값이지 스케줄러 길이의 직접 기준이 아니다.

### 33. 2026-06-05 Scheduler Remaining Work Summary Lock

- `assignment-plan-progress` 응답은 스케줄러용 workload summary 필드를 함께 노출할 수 있다.
- canonical scheduler summary field:
  - `plannedStTotalSeconds`
  - `remainingStTotalSeconds`
  - `completedStTotalSeconds`
  - `operationalProgressRatio`
- `remainingStTotalSeconds = assignmentStTotalSeconds × (1 - operationalProgressRatio)`를 기본 규칙으로 사용한다.
- 완료 assignment는 `remainingStTotalSeconds = 0`으로 본다.
- 라인 요약은 같은 라인의 미완료 assignment들의 `remainingStTotalSeconds` 합으로 계산한다.
- 1차 UI 목표:
  - 이 라인에 일이 얼마나 남았는지
  - 이 라인이 언제 비는지
  - 현재 보이는 기간 안에서 일을 얼마나 더 넣을 수 있는지

### 34. 2026-06-06 Scheduler Predictive Reflow Lock

- 현재 스케줄러 재배치는 `과거 실제 작업일 복원`이 아니라 `오늘 이후 남은 일감 재배치`를 기준으로 한다.
- 미완료 assignment의 직렬 reflow 기준 작업량은 `remainingStTotalSeconds`다.
- `remainingStTotalSeconds`가 있으면 기존 계획 구간에서 이미 지나간 사용량을 다시 차감하지 않는다.
- 즉 진행 중 카드의 미래 점유는 `전체 ST`가 아니라 `남은 ST`만 다시 라인 뒤에 쌓는다.
- reflow 시작점은 기본적으로 `today index`다. 오늘 이전에 끝난 카드/구간은 고정한다.
- 완료 assignment는 신규 WorkLog 선택 대상이 아니며, 스케줄러 reflow에서도 미래 작업량을 소비하지 않는다.
- 현재 구현은 완료 카드의 과거 위치를 새로 복원하는 것이 아니라, 완료/과거 구간은 anchor로 두고 오늘 이후 미완료 카드만 다시 배치한다.
- 같은 규칙을 보드 렌더와 저장 전 재배치에 같이 적용한다.
- 따라서 사용자가 보는 미래 라인 점유와 실제 저장되는 미래 좌표가 서로 다른 방향으로 벌어지지 않게 유지한다.
### 35. 2026-06-06 Scheduler Remaining Work Conservative Lock

- `remainingStTotalSeconds`는 낙관적으로 계산하지 않는다.
- scheduler 남은 일감 계산에는 아래 두 비율을 모두 계산한다.
  - `producedRatio = producedQuantity / plannedQty`
  - `totalDoneRatio = totalDone / totalExpected`
- canonical remaining progress는 아래다.
  - `progressForRemaining = min(producedRatio, totalDoneRatio)`
- canonical remaining workload는 아래다.
  - `remainingStTotalSeconds = plannedStTotalSeconds * (1 - progressForRemaining)`
- 이유:
  - 공정 불균형이 있으면 `totalDoneRatio`는 높아도 실제 완성 가능한 수량(`producedQuantity`)은 낮을 수 있다.
  - line free date 계산은 항상 더 보수적인 쪽을 우선한다.
- fixed / anchor 카드 기준:
  - completed 카드이거나
  - 과거 구간에 있고 `remainingStTotalSeconds <= 0`인 카드만 fixed로 본다.
- 미완료 카드가 `remainingStTotalSeconds > 0`이면, 저장된 end date가 과거에 있어도 reflow queue에 남겨서 미래로 다시 배치한다.
- 아래 상태는 scheduler warning 대상으로 본다.
  - orphan WorkRecord (`assignmentPlanId` 없음)
  - `assignmentStTotalSeconds` 미산정 또는 0
  - period-only 기반 low-confidence free-date estimate
  - `producedRatio`와 `totalDoneRatio` 차이가 큰 공정 불균형

### 36. 2026-06-16 Manual Production Completion Relocated to Assignment Board

- 수동 생산완료 확정 UI를 `AssignBoard.jsx` 상세 드로어로 이전했다. `handleConfirmProductionComplete`가 기존 백엔드 엔드포인트(`PATCH /assignment-plans/:externalId/production-complete`)를 그대로 호출한다.
- 진입 경로(둘 다 동일한 `handleConfirmProductionComplete`를 호출):
  - 빠른 경로: 배정 보드에서 미완료 카드 우클릭 → 컨텍스트 메뉴의 "수동 완료" → `window.prompt`로 확정 수량 입력.
  - 상세 경로: 우클릭 → "Open Detail" → 상세 드로어 하단의 "수동 완료" 패널에서 확정 수량 입력 후 확정.
- 백엔드 `completeAssignmentPlanProduction`과 급여 잠금/중복완료 체크 로직은 변경하지 않았다.
- 완료된 assignment를 다시 미완료로 되돌리는 "되돌리기" 기능은 이번 범위에 포함하지 않았다 (백엔드에 reopen 엔드포인트가 없고, 완료 assignment는 읽기 전용 원칙을 유지).
- 구 레거시 메뉴 "생산 현황"(`menu.batchProgress`, 경로 `/batch-progress`, `frontend/src/pages/App/BatchProgress.jsx`)은 완전히 삭제했다. 이 메뉴는 이미 `disabled: true` + `/workspace` 리다이렉트 상태였고, 그 안의 `handleConfirmClose`가 production-complete를 호출하는 유일한 코드였는데 메뉴 비활성화로 사실상 도달 불가능했던 고아 코드였다.
- `QcReview.jsx`의 "제작 완료 확정은 배치 진행 메뉴에서 처리합니다" 안내 문구는 "배정 화면 상세에서 처리합니다"로 갱신했다.

### 37. 2026-07-02 구동 오류 위험 지점 점검 (미수정 — 향후 조치 필요)

- 이 섹션은 코드 리뷰/조사만 수행한 결과이며 아직 수정하지 않았다. 다음에 이 영역을 건드릴 때 아래 항목부터 재확인한다.
- 심각도 높음 (데이터 오염 / 급여·스케줄 오계산):
  1. `backend/src/index.ts`의 `syncWorkRecordRefs`(6009-6019 부근) — `styleProcess.findMany`에 `orgId` 필터가 없다. 바로 위 `style.findMany`는 `orgId`로 스코프되어 있는데 이 조회만 빠져 있어, 다른 조직의 `styleProcessId`가 섞여 들어오면 타 테넌트 공정명/코드가 WorkRecord에 저장될 수 있다 (멀티테넌시 유출 가능성).
  2. `completeAssignmentPlanProduction`(20899-21037)과 `PATCH /assignment-plans/:externalId/final-quantity`(21338-21386) — `isCompleted`를 읽어서 체크한 뒤 별도로 `update`하는데, update의 `where`에 `isCompleted: false` 재확인이 없다. 동시 요청(빠른 완료 vs 상세 드로어 완료, 섹션 36 참고) 시 완료된(읽기 전용이어야 할) plan이 다시 덮어써질 수 있다. §9의 "완료된 assignment는 읽기 전용" 원칙과 충돌한다.
  3. `resolveWorkRecordProcessBucketKeyForAssignmentSchedule`(7147-7155 부근, `buildAssignmentPlanProgressRows`에서 사용) — `styleProcessId`가 없는 WorkRecord를 `processCode` 문자열로 bucket fallback한다. "정확 계산 원칙"이 금지한 processCode 재탐색이 진행률 계산 경로에 남아있다. 서로 다른 스타일의 동일 processCode가 진행률을 섞을 수 있다.
  4. `frontend/src/pages/App/assign/AssignBoard.jsx`의 `isAssignmentSchedulerCompleted`(2030-2034)와 이를 쓰는 reflow 전체 — `isPayrollLocked`/`payrollLockMonth`를 전혀 참조하지 않는다. §29/§35가 못박은 "급여 잠금 카드는 anchor로 고정"이 프론트 reflow에는 구현돼 있지 않아, 잠금된 카드가 화면에서 재배치되고 그 좌표가 저장 요청에 실릴 수 있다.
  5. `toAssignmentPlanWriteData`(`backend/src/index.ts:12837` 부근) — `updatedAt: item.updatedAt ?? new Date()`. 클라이언트가 이전 GET에서 받은 `updatedAt`을 그대로 되돌려보내면(보드 저장 payload 구조상 흔함) 매 저장마다 과거 타임스탬프가 유지되어 실질적으로 "마지막 수정 시각"이 갱신되지 않는다.
  6. ~~`PUT /assignment-board-state`의 `shouldSyncPlans` 블록 — board JSON은 트랜잭션 안, `AssignmentPlan` relation sync는 트랜잭션 밖.~~ **해소됨 (2026-07-06 재확인)**: 코드에 `shouldSyncPlans`라는 블록 자체가 더 이상 없고, `AssignmentCard`/`AssignmentPlan`/`AssignmentBoardState` 갱신이 전부 하나의 `prisma.$transaction` 안에서 실행된다. 이 항목을 처음 적었을 때 이미 최신 코드가 아니었던 것으로 보인다 — DB 설계 원칙 섹션의 해당 항목도 같이 정정함.
- 심각도 중간 (크래시 / 화면 오류):
  7. `AssignBoard.jsx` 드롭 핸들러(6070-6076 부근) — `dayIndex = Number(dayIndexRaw)`를 `=== null`로만 가드하여 `NaN`을 통과시킨다. `startIndex`/`endIndex`에 `NaN`이 저장될 수 있다.
  8. `AssignBoard.jsx`의 `getAssignmentStartKey`(2008-2011) — `startIndex`가 없는 카드 하나가 `NaN`을 반환해 6곳의 `.sort()` comparator를 오염시켜 라인 전체 카드 순서가 깨질 수 있다.
  9. `AssignBoard.jsx`의 `getTodayDayIndex`(1864-1868) — 오늘 날짜가 현재 보이는 범위 밖이면 `0`을 반환한다. 미래 달만 보고 있을 때 reflow 기준점이 인덱스 0(과거)으로 잘못 설정될 수 있다.
  10. `frontend/src/pages/App/assign/components/AssignBar.jsx`의 `getDurationDays`(9-17)와 `ScheduleTimeline.jsx`의 `assignLanes`(108-126) — 위 NaN 인덱스가 전파되면 각각 "NaNd" 배지 표시, 레인 스택 로직 무한/오작동으로 이어질 수 있다. `ScheduleTimeline`은 현재 운영 UI에서 미사용이지만 코드는 남아있다.
  11. `backend/src/payroll/payroll.service.ts`(477-492 부근) — 급여 화면의 공정별 항목 breakdown을 `processCode || processName || "unknown"`으로 그룹핑한다. 급여 합계 자체는 그 전에 `ctSeconds × quantity`로 정확히 계산되므로 급여 금액 오류는 아니지만, 같은 코드를 쓰는 서로 다른 공정이 화면상 한 줄로 합쳐져 보일 수 있다.
- 확인 결과 문제 없음으로 배제한 항목: JSON 배열 접근은 `ensureArray()`/`Array.isArray` 가드가 일관 적용됨, 진행률/보드 저장 핫패스는 `Map` 기반 조인이라 O(n·m) 루프 없음, 남아있는 dual-read fallback(`assignmentCtSnapshot ?? ctSnapshot`, `stBuckets ?? stValues` 등)은 이 문서가 "정리 대기 중"이라고 이미 명시한 것과 정확히 일치하고 snapshot ST 필드는 신규 write 경로에서 확인상 이미 제거됨(§18/§23과 일치), 프론트 reflow에서 이름 기반(코드/이름 매칭) join은 발견되지 않음.
- 위 목록의 1번(`syncWorkRecordRefs` orgId 필터 누락)은 2026-07-02에 별도로 수정됨 — `styleProcess.findMany`에 `orgId`를 추가해 타 테넌트 `styleProcessId` 유입을 차단했다. 나머지 항목(2~11번)은 여전히 미수정 상태다.

### 38. 2026-07-02 WorkOrder.items / Style.processes JSON 쓰기·읽기 fallback 제거

- 위 "DB 설계 원칙" 섹션의 이중 저장 표에 정리된 대로, `WorkOrder.items`와 `Style.processes` JSON을 신규 저장 경로에서 완전히 끊고 응답/계산 경로의 fallback도 제거했다. `WorkLog.records`는 애초에 레코드 데이터를 복제한 적이 없어(헤더 메타데이터 `{lineId,lineName}`만 저장) 응답 조립 함수의 2단계 JSON fallback만 제거했다.
- 구현 중 계획을 일부 조정했다: `Style.processes → StyleProcess` 백필은 raw SQL로 새로 만들지 않았다. `buildStyleProcessStorageDrafts`/`resolveStyleProcessStorageCode`가 processCode 결정에 다단계 fallback(명시 code → storageCode → composition 기반 생성 → name 기반 생성 → `PROC_N`)과 로컬라이즈드 이름 합성을 쓰고 있어, 이를 SQL로 재구현하면 todo.md에 기록된 과거 백필 사고(실제 로직과 미묘하게 다른 백필이 데이터를 틀어지게 한 뒤 검증 없이 DROP)를 반복할 위험이 컸다. 대신 이미 프로덕션에서 검증된 자가치유 함수(`ensureStyleProcessStorageForStyles` → `syncStyleProcessStorageForStyle`, `GET /styles?includeProcesses=1` 호출 시 자동 실행)를 그대로 백필 메커니즘으로 유지했다. `WorkOrderItem`은 JSON 항목 구조가 평탄해 raw SQL 백필이 안전하다고 판단해 원안대로 진행했다.
- 발견해서 같이 고친 latent 버그: `PUT /orders/:orderId`가 부분 업데이트 시 누락된 필드를 `existing`(직전 조회한 주문)으로 채우는데, `items`만 `existing.items`(JSON 컬럼)를 fallback으로 읽고 있었다. `existing` 조회에 `workOrderItems` relation이 `include`돼 있지 않았던 것과 겹쳐, JSON 쓰기를 끊는 순간부터는 `items` 없는 저장 요청마다 기존 주문 품목이 통째로 사라질 뻔했다. `existing` 조회에 `workOrderItems` relation을 추가하고, fallback도 relation 기반으로 바꿔서 고쳤다(`backend/src/index.ts`의 `normalizeOrderPayload`, `PUT /orders/:orderId`).
- 신규 검증 스크립트:
  - `npm run verify:workorder-item-backfill` — 실제 데이터 검증. `WorkOrder.items`에 항목이 있는데 `WorkOrderItem` 행이 없는 주문 수를 센다. 0이어야 컬럼 DROP을 진행할 수 있다.
  - `npm run verify:style-process-backfill` — 진단 전용(백필 아님). `Style.processes`에 항목이 있는데 `StyleProcess` 행이 0개인 스타일 수를 센다. 0이 아니어도 실패는 아니며, 그 styleId들에 대해 `GET /styles?includeProcesses=1`을 한 번 호출(또는 스타일 편집 화면에서 재저장)하면 자가치유 백필이 실행돼 카운트가 줄어든다.
  - 두 스크립트 모두 이 개발 환경에는 운영 `DATABASE_URL` 접근 권한이 없어 실행하지 못했다 — 운영 배포 전 반드시 Railway DB를 대상으로 실행해서 확인해야 한다(`todo.md` 참고).
- `migration_fix.sql`에 `Step 0d-5`로 `WorkOrderItem` 백필 SQL을 추가했다(idempotent, 이미 relation이 있는 주문은 건드리지 않음).
- 컬럼(`WorkOrder.items`, `Style.processes`) 자체는 이번 패스에서 DROP하지 않았다. 두 verify 스크립트가 운영 DB에서 0을 보고한 뒤 별도 후속 커밋으로 DROP한다.
- 참고: `production-result`(생산 결과, `menu.productionResult`)는 이번 항목과 다른, 별도로 먼저 삭제된 플레이스홀더 메뉴다.

### 39. 2026-07-03 주문 잠금 / AssignmentCard 동기화 재설계 (운영 데이터 삭제 사고 대응)

- 사고: 주문 잠금 해제가 그 주문의 `AssignmentPlan`/`AssignmentCard`를 무조건 전부 삭제하도록 되어 있었고(작업기록 있으면 해제 자체를 막는 가드가 있었지만, 작업기록을 먼저 지우면 그 가드가 무력화됨), 실제로 이 순서로 조작이 일어나 운영 `AssignmentPlan` 25건과 `WorkRecord` 전체가 삭제됐다. 백업 없어 복구 불가. 상세 경위와 FK/Join 검토는 `todo.md`의 "2026-07-03 주문 잠금-배정카드 동기화 재설계" 항목 참고.
- 최종 설계 (현재 코드 상태, 이 문서 우선):
  - **잠금/해제는 순수 편집 권한 플래그다.** `POST /orders/:orderId/modification-lock`은 `modificationLockedAt/By`를 켜고 끄는 것 외에 `AssignmentCard`/`AssignmentPlan`을 전혀 건드리지 않는다. 잠금 시점에 카드를 만들거나 갱신하지 않는다.
  - **카드 생성/갱신/제거는 주문 저장(`PUT /orders/:orderId`, `POST /orders`) 시점에 즉시 반영된다.** 잠금까지 미루지 않는다 — 수량이 바뀌면 그 저장에서 바로 카드 수량도 갱신된다.
  - **작업기록이 연결된 스타일의 카드는 주문에서 제거할 수 없다.** `PUT /orders/:orderId`는 `WorkOrderItem`을 실제로 쓰기 전에, 빠지는 스타일의 카드에 연결된 `AssignmentPlan`이 작업기록을 갖고 있는지 먼저 확인한다(`findOrderStyleRemovalBlockers`, cardId 정확 일치 — 다른 스타일까지 걸리는 prefix 매칭 아님). 걸리면 아무것도 쓰지 않고 `409 { ok:false, error, issues:[{styleId,styleCode,styleName,code:"STYLE_HAS_WORK_RECORDS",message}] }`로 저장 전체를 막는다. 안전하면 `WorkOrderItem` 교체 + 카드 정리 + `AssignmentPlan` 정리를 하나의 `$transaction`으로 원자적으로 처리한다.
  - **`DELETE /orders/:orderId`도 같은 가드를 쓴다**(주문 삭제 = 그 주문의 모든 스타일이 한꺼번에 빠지는 것과 동치이므로). 이전에는 "해제가 먼저 카드/배정을 지워준다"는 우연한 전제 때문에 삭제 자체에는 이 가드가 없었다 — 그 우연한 전제가 사라졌으므로 명시적으로 추가했다.
  - 프론트(`frontend/src/pages/App/order/OrderList.jsx`)는 이 409+`issues` 응답을 작업기록 엑셀 임포트 실패와 같은 패턴(짧은 토스트 + 스타일/사유 표를 보여주는 `Dialog`)으로 표시한다.
  - `OrderList.jsx`의 `handleSave`가 주문 저장 후 별도로 `/assignment-board-view`를 다시 불러와 `reconcileBoardStateForQuantityChanges`로 카드를 재계산해 `PUT /assignment-board-state`를 또 호출하던 경로는 제거했다 — 실패해도 조용히 삼켜지는 이중 저장 경로였고, 이제 카드 동기화는 백엔드 저장 트랜잭션 하나가 전담한다. `frontend/src/utils/quantityChangeBoard.mjs`(`reconcileBoardStateForQuantityChanges`)와 그 전용 테스트(`scripts/quantity-change-regression.test.mjs`)는 2026-07-08 삭제 완료(`test:quantity-change` 스크립트도 제거).
- 알려진 구조적 한계 (이번 범위에서 고치지 않음): `AssignmentCard.cardId`와 `AssignmentPlan.cardId`/`originOrderId`는 DB FK가 아니라 `${orderId}::${styleId}` 문자열 관례로만 연결되어 있다. 이번 수정은 이 관례를 애플리케이션 코드로 정확히 지키도록 만든 것이지, FK 자체를 추가한 것은 아니다. `AssignmentPlan.cardId`/`originOrderId`에는 인덱스도 없다 — 데이터가 늘어나면 이번에 추가한 저장 시점 가드 조회가 순차 스캔이 될 수 있으므로 `@@index([orgId, cardId])` 추가를 후속 과제로 남긴다.
- 운영 DB 복구 메모: 이 재설계 배포 후 기존 주문을 한 번씩 저장(또는 잠금 토글)하면 살아있는 `WorkOrderItem`을 기준으로 `AssignmentCard`가 다시 채워진다. `AssignmentPlan`(실제 라인 배정)은 자동 복구되지 않으므로 배정판에서 카드를 라인에 다시 드래그해야 한다.
- **정정 (2026-07-05)**: 위 "저장(또는 잠금 토글)하면 다시 채워진다"는 부정확했다. 실제 코드 확인 결과 `POST /orders/:orderId/modification-lock`은 잠금/해제 어느 쪽이든 `rebuildAssignmentCardsForOrgIds`를 전혀 호출하지 않는다 — 카드가 다시 채워지는 유일한 경로는 주문 **저장**(`PUT /orders/:orderId`)뿐이었다. 이 항목 자체는 아래 40번 재설계로 다시 대체된다.

### 40. 2026-07-05 카드 생성 시점을 주문 잠금으로 재변경 + 스타일 제거를 수량 0 오버플로우로 처리 (백엔드+보드 UI 구현 완료, 브라우저 미검증)

- 이 섹션은 바로 위 39번의 "카드 생성/갱신은 저장 시점에 즉시 반영한다, 잠금까지 미루는 설계는 반려한다"는 규칙을 **대체**한다. 다음 세션은 이 카드 생성 타이밍에 대해서는 39번이 아니라 이 40번을 따른다. (39번의 다른 원칙 — 잠금 해제는 순수 플래그라는 것, `DELETE /orders/:orderId` 가드, 프론트 이중저장 제거 등은 그대로 유효하다.)
- 배경: 39번 설계·배포 이후 실사용 관점에서, "잠금 = 생산 확정" 의미로 카드 생성을 다시 잠금 시점에 묶고 싶다는 요청이 있었다. 동시에 "작업기록이 이미 있는 스타일은 주문에서 못 뺀다"는 39번의 하드 블록이, 실제로는 이미 작업이 진행된 뒤에 고객 요청으로 물량이 줄어드는 정상적인 현장 상황을 시스템이 못 받아주는 문제로 확인되어 같이 재설계했다.
- 확정된 설계 (2026-07-05 사용자 결정 — **아직 코드에 반영되지 않음**, 구현 시 이 섹션의 "미해결 질문"부터 해소하고 상태를 갱신할 것):
  - **카드 생성/갱신은 주문 잠금(`POST /orders/:orderId/modification-lock`, `locked:true`) 시점에만 일어난다.** `PUT /orders/:orderId`(저장)는 `WorkOrderItem`만 갱신하고 `AssignmentCard`/`AssignmentPlan`에는 손대지 않는다. `PUT /orders/:orderId`는 이미 잠긴 주문의 저장을 409로 거부하므로, 실제 편집 흐름은 항상 "해제 → 수정(저장, 카드 영향 없음) → 재잠금(그 시점에 카드/배정 갱신)"이다.
  - **잠금 해제(`locked:false`)는 여전히 순수 플래그다.** 해제 시점에 카드/배정에 어떤 변경도 가하지 않는다 — 이 부분은 39번과 동일하게 유지, 어제 사고를 재발시키지 않기 위한 핵심 안전장치다. 해제 중에도 보드에는 마지막 잠금 시점의 카드가 그대로 남는다.
  - **작업기록이 이미 연결된 배정(AssignmentPlan)도 잠금 시점에 수량이 갱신될 수 있다.** 기존 `refreshUnlinkedAssignmentPlanSnapshotsForOrg`가 "작업기록이 연결된(linked) 플랜은 절대 건드리지 않는다"고 보호하던 것을 완화한다 — linked 플랜도 최신 주문 수량으로 `assignmentQuantity`(및 구조 변경이므로 `assignmentStTotalSeconds`)를 갱신 대상에 포함하되, `isCompleted===true`이거나 급여 잠금(`isPayrollLocked`)된 플랜은 여전히 건드리지 않는다. 급여 잠금 배제는 §28 급여 잠금 원칙의 자연스러운 확장이며 별도 협의 없이 이 문서에서 고정한다.
  - **주문에서 스타일이 통째로 빠지고 그 스타일에 이미 작업기록이 있어도, 더 이상 저장/잠금을 막지 않는다.** 39번의 `findOrderStyleRemovalBlockers` 하드 블록(`409 STYLE_HAS_WORK_RECORDS`)은 폐기한다. 대신: 그 스타일의 `AssignmentCard`/`AssignmentPlan`은 삭제하지 않고 그대로 두되 `assignmentQuantity`(및 카드 수량)를 `0`으로 갱신한다. 이미 생산된 수량은 전부 "초과 생산"으로 계산된다 — `overflowQuantity = producedQuantity - assignmentQuantity`는 `buildAssignmentPlanProgressRows`에 이미 구현되어 있고 음수/0-분모 클램프도 이미 되어 있어(§35 관련 로직 확인, `producedRatio`/`operationalProgressRatio`가 0/0 상황에서 `null`로 안전하게 빠짐) 별도 신규 계산식이 필요 없다. 이 관점에서 "스타일 완전 제거"는 "수량을 0으로 줄이는 일반적인 수량 변경"의 극단값일 뿐이며, 위 문단의 "linked 플랜 수량 갱신 허용"과 같은 파이프라인을 그대로 탄다.
  - **의미**: 계획 수량이 0인데 생산 기록이 있는 배정 = "주문에서는 빠졌지만 실제로는 만든 것"이며, 이는 데이터 오류가 아니라 정상 상태로 취급한다.
  - **급여 영향 없음 (코드로 이미 확인됨)**: `backend/src/payroll/payroll.service.ts`는 `assignmentQuantity`를 전혀 참조하지 않고 `WorkRecord.quantity`/`ctSeconds` 기준으로만 급여를 계산한다(grep 확인). 배정 계획 수량이 0으로 바뀌어도 이미 기록된 작업기록의 급여는 그대로 지급된다 — "급여는 생산한 수량만큼 지급한다"는 전제가 이미 코드로 보장되어 있다.
  - **AT 학습 영향 없음**: AT 파이프라인은 WorkLog/WorkRecord/출퇴근 데이터를 입력으로 쓰고 `AssignmentPlan.assignmentQuantity`를 참조하지 않는다.
  - **청구/정산(billing)은 이 저장소에 아직 구현되어 있지 않다** (grep 확인, 관련 코드 0건). 수량 0으로 남은 배정을 실제 매출/청구에 반영하는 것은 시스템이 자동으로 하지 않는다 — 고객과 협의 후 사람이 주문을 다시 수정해서(그 스타일을 실제 합의된 최종 수량으로 재추가) 주문 상태를 정산 현실과 맞추는 수동 프로세스로 남긴다. 향후 청구 기능을 만들 때는 "계획 수량 0이지만 작업기록이 있는 배정"을 반드시 별도로 조회해서 노출해야 한다 — 누락하면 매출이 조용히 유실된다.
  - **`DELETE /orders/:orderId`는 스타일 제거와 다르게 취급한다 (2026-07-05 정정)**: `AssignmentPlan.workOrderId`는 `onDelete: SetNull`이라 주문이 삭제돼도 배정 행 자체는 안 지워지고 `workOrderId`만 `NULL`이 되는 것까지는 안전하다. 하지만 스타일 하나만 빠지는 경우와 달리, 주문을 통째로 삭제하면 "나중에 고객과 합의된 뒤 그 주문을 다시 열어서 반영"할 원본 주문 자체가 사라진다(재정산 경로가 없어짐). 그래서 **주문 삭제는 스타일 제거와 다르게, 작업기록이 연결돼 있으면 삭제 자체를 계속 하드 블록으로 막는다** — 기존 `DELETE /orders/:orderId` 가드는 그대로 유지한다. 사람이 재정산 흐름을 타고 싶으면 먼저 각 스타일을 개별적으로 주문에서 빼서(0-수량 처리) 작업기록 연결을 끊은 뒤에 주문 자체를 삭제해야 한다.
- 2026-07-05 확정 (구현 착수 전 미해결 질문이었던 것들 — 사용자 답변으로 확정됨):
  - **0-수량 보존 기준**: 그 배정에 연결된 `WorkRecord`가 **실제로 하나라도 존재할 때만** 카드/배정을 0-수량으로 보존한다. 라인에 드래그만 해놓고 `WorkRecord`가 하나도 없는 빈 배정은 스타일이 빠지면 그냥 평소처럼(현재 동작 그대로) 삭제한다. `buildAssignmentCardsFromOrders`는 현재 `order.workOrderItems`에 없는 스타일은 애초에 순회 대상에서 제외된다(`backend/src/index.ts:10544` 이하) — 잠금 처리 파이프라인에 "이 주문에 대해 이전에 존재했던 카드 중, 지금 item에는 없지만 `WorkRecord`가 연결된 것"을 찾아 0-수량 항목을 강제로 주입하는 로직을 새로 만들어야 한다(현재 코드에 없음).
  - **UI 노출 방식**: 배정 보드에 평소 카드 목록과 분리된 **별도 경고 섹션**(예: "확인 필요")을 신설한다. 이 섹션에 표시할 항목이 하나도 없으면 섹션 자체를 렌더링하지 않는다(빈 섹션 노출 금지).
  - **경고 섹션에서 항목이 빠지는(필터되는) 기준**: 그 배정에 연결된 **모든** `WorkRecord`의 소속 월이 전부 급여 잠금(그 달 `PayrollSnapshot` 존재)되면 그 시점에 목록에서 제외한다. **주의**: 이건 "완료 카드가 급여 지급되면 작업 종료 목록에서 빠진다"는 기존 로직을 재사용하는 게 아니라 **신규 구현**이다 — 실제로 그런 필터는 아직 존재하지 않는다(`lineMonthCapacity.js`의 완료 목록 빌더는 `isPayrollLocked`/`payrollLockMonth`를 전혀 참조하지 않음, §28A에도 "post-payroll hiding은 의도적으로 미뤄짐"이라고 이미 명시돼 있었음). 또한 기존 `isPayrollLocked`는 "완료 월 1개"를 전제로 계산되는데(§28), 0-수량 배정은 `plannedQuantity=0`이라 진행률 계산이 분모 0으로 `null`이 되어 전통적인 "진행률 100%→자동완료" 경로를 못 탈 가능성이 높다 — 그래서 이 신규 필터는 완료 월 1개가 아니라 **연결된 모든 WorkRecord 각각의 월이 전부 급여 잠금됐는지**를 별도로 계산해야 한다.
  - **비차단 안내**: 하드 블록을 없애는 대신, 저장/잠금은 그대로 통과시키되 "이 스타일은 이미 작업기록이 있어 완전히 삭제되지 않고 0개 배정으로 남았습니다" 같은 비차단 토스트를 보여준다.
- **해소됨**: `AssignmentPlan.workOrderId`는 스키마 확인 결과 `onDelete: SetNull`이었다(Cascade 아님) — 다만 위 "DELETE는 스타일 제거와 다르게 취급" 결정으로 이 경로 자체를 애초에 타지 않기로 했으므로(작업기록 있으면 여전히 삭제 자체를 막음) 실질적 영향은 없다.

### 2026-07-05 구현 현황

- **백엔드 구현 완료** (`backend/src/index.ts`, `npm run build` 통과):
  - `syncAssignmentPlansForOrderLock({ orgId, order, db })` 신규 함수 — `findOrderStyleRemovalBlockers` 바로 아래 위치. 주문의 현재 `WorkOrderItem` 수량(`resolveOrderStyleQuantityMap`)과 그 주문에 속한 기존 `AssignmentPlan`(`buildAssignmentPlanOrderMatchWhereOr`로 cardId/workOrderId 매칭)을 비교해 스타일별로 처리한다.
  - 같은 `cardId`를 공유하는 `AssignmentPlan`이 2개 이상(라인 분할/split)인 경우는 **의도적으로 건드리지 않는다** — 총량 변경분을 여러 split에 어떻게 재분배할지 결정된 바가 없어서다(알려진 한계, 아래 남은 일 참고).
  - 수량 0으로 남기는 케이스: `AssignmentPlan.assignmentQuantity/assignmentStTotalSeconds`를 0으로 갱신하고, 대응하는 `AssignmentCard.payload`에 `cardQuantity:0, type:"DELTA"`를 심어 이후 `rebuildAssignmentCardsForOrgIds`가 돌아도 카드가 삭제되지 않고 살아남게 한다(`mergeAssignmentCardsWithSaved`의 기존 DELTA 카드 보존 규칙을 그대로 재사용 — 신규 메커니즘 추가 안 함).
  - 수량이 바뀌었지만 스타일이 그대로 남아있는 경우: `ensureStyleStandardsForQuantities` + `loadStyleProcessRowsByStyleId` + `calculateAssignmentStTotalSecondsFromStyleRows`(보드 저장 경로가 쓰는 것과 동일한 버킷 조회 함수)로 새 수량 기준 ST를 재계산한다. 버킷을 못 찾으면(`null`) `assignmentQuantity`만 갱신하고 `assignmentStTotalSeconds`는 이전 값을 그대로 둔다 — §35 "ST 미설정시 경고만" 방침과 동일하게 저장을 막지 않는 쪽을 택함.
  - `isCompleted === true`이거나 급여 잠금(`annotateAssignmentPlanRowsWithPayrollLocks`로 계산한 `isPayrollLocked`)인 플랜은 위 처리에서 전부 제외.
  - `PUT /orders/:orderId`: `findOrderStyleRemovalBlockers` 호출, 409 하드 블록, 트랜잭션 안 카드/배정 정리, 끝의 `rebuildAssignmentCardsForOrgIds` 호출을 전부 제거 — 이제 `WorkOrderItem`만 갱신하는 순수 저장이다.
  - `POST /orders/:orderId/modification-lock`: `locked:true`로 바뀌는 전이에서만 `syncAssignmentPlansForOrderLock`을 `$transaction`(30s timeout)으로 감싸 실행한 뒤 `rebuildAssignmentCardsForOrgIds`를 호출한다. 응답 JSON에 `zeroedStyles`(0-수량으로 남은 스타일 목록, 프론트 토스트용) 필드를 추가했다. `locked:false`(해제)는 손대지 않았다 — 여전히 순수 플래그.
  - **2026-07-06 정정**: `syncAssignmentPlansForOrderLock`이 처음엔 `orgId: organization.id`(잠금 버튼을 누른 요청자의 조직) 단일 값으로만 호출됐다. 그런데 배정(`AssignmentPlan`)은 제조사(seller) 쪽 전용 개념이고, 주문 잠금은 발주사(buyer)든 제조사든 아무나 누를 수 있다(주문 자체가 양쪽이 공유하는 개념 — 사용자 확인). 그래서 발주사가 잠그면 `orgId: buyer.id`로 조회해 실제 `AssignmentPlan`이 있는 제조사 쪽은 건드리지 못하고 조용히 0건으로 스킵되는 버그였다. `rebuildAssignmentCardsForOrgIds`(바로 아래줄)는 원래부터 buyer+seller 양쪽을 다 도는데 `syncAssignmentPlansForOrderLock`만 한쪽으로 좁혀져 있던 비대칭이었다. `affectedOrgIds`(buyer+seller) 각각에 대해 `syncAssignmentPlansForOrderLock`을 돌리고 `zeroedStyles`를 styleId 기준으로 합치도록 고쳤다 — 배정이 없는 쪽 org는 `plans.length === 0`으로 즉시 no-op이라 안전하다.
  - `rebuildAssignmentCardsForOrg`의 주문 조회에 `modificationLockedAt: { not: null }` 필터를 추가했다 — 이게 없으면 스타일 저장/색상 동기화 등 다른 트리거가 돌 때마다 잠기지 않은 주문의 카드까지 다시 생겨서 "카드는 잠금 시점에만" 원칙이 깨진다(구현 중 직접 발견해서 같이 고침, 원래 계획에는 명시 안 돼 있었음).
  - 이제 아무 데서도 안 쓰는 `findOrderStyleRemovalBlockers`/`summarizeOrderStyleRemovalIssues` 삭제. `DELETE /orders/:orderId`는 별도의 자체 인라인 가드(`ORDER_HAS_WORK_RECORDS`)를 계속 쓰고 있어 영향 없음.
- **프론트엔드 일부 구현 완료** (`npm run build` 통과):
  - `frontend/src/pages/App/order/OrderList.jsx`의 `performOrderLockToggle`: 잠금 성공 응답의 `zeroedStyles`가 비어있지 않으면 비차단 경고 토스트(`orderPageText.zeroedStylesPrefix`/`zeroedStylesGeneric`, ko/en/vi 전부 작성)를 띄운다.
  - 기존 저장 실패 시 이슈 다이얼로그(`saveIssueRows`/`extractOrderSaveIssueRows`)는 그대로 유지 — `DELETE`가 여전히 같은 모양의 `issues` 배열을 반환하므로 삭제 실패 표시에는 계속 쓰인다. `PUT` 저장은 이제 이 경로를 타지 않는다(더 이상 이 에러를 반환하지 않음).
- **2026-07-05 후속: 보드 UI 경고 섹션 구현 완료**:
  - 병합 경로를 끝까지 추적함: `AssignBoard.jsx`가 `/assignment-plan-progress`를 별도로 불러와 `assignmentProgressById`에 저장하고, `resolveAssignmentProgressState({assignment, progressRow})`(`AssignBoard.jsx:2150`)가 화이트리스트 방식으로 필드를 골라 `applySchedulerProgressToAssignments`에서 `{...item, ...progressState}`로 병합한다. 이 병합된 assignment 객체가 `lineMonthCapacity.js`의 `buildLineQueueForecast` 입력이 된다.
  - `buildAssignmentPlanProgressRows`(`backend/src/index.ts:19468`)의 반환 객체에 `isZeroQuantityOverflow`(`(baselineQuantityRaw==null||<=0) && producedQuantity>0`)와 `isFullyPayrollSettled`(그 플랜에 연결된 **모든** WorkRecord의 월이 전부 급여 잠금됐는지, 새 `workRecordMonthsByPlanId`/`workRecordPayrollLockedMonthSet`로 계산 — 기존 `isPayrollLocked`는 완료 월 1개 전제라 재사용 불가) 두 필드를 추가.
  - `resolveAssignmentProgressState`(`AssignBoard.jsx:2150`)의 화이트리스트에 두 필드 추가.
  - `lineMonthCapacity.js`의 `buildLineQueueForecast`: `isZeroQuantityOverflow && !isFullyPayrollSettled`인 assignment를 큐/리뷰/완료 분류보다 먼저 가로채 별도 `zeroQuantityOverflowAssignments` 버킷(`queueStatus:'zero_quantity_overflow'`)에 담는다. 조건을 만족 안 하면(=급여 정산 완료) 자연히 이 버킷에서 빠진다 — 사용자가 요청한 "정산 다 되면 필터" 동작.
  - `LineMonthCapacityBoard.jsx`: "작업 종료 목록" 섹션 바로 아래에 `row.zeroQuantityOverflowAssignments.length > 0`일 때만 렌더되는 "확인 필요" 섹션 추가(항목 없으면 섹션째로 안 보임 — 다른 섹션과 달리 "없음" 문구도 안 넣음). `AssignmentDetailCard`에 `zero_quantity_overflow` 상태 분기 추가: 드래그 불가(`isLocked`) 처리, 경고색 칩/배경, "주문에서 빠짐 - 이미 N개 생산됨" 푸터.
  - `uiMessages.js`에 `assign.zeroQuantityOverflowHeader`/`zeroQuantityOverflowStatusCompact`/`zeroQuantityOverflowCompact` ko/en/vi 전부 추가.
  - `npm --prefix backend run build`, `npm --prefix frontend run build` 둘 다 통과.
- **아직 남은 것**:
  - split(같은 cardId를 공유하는 배정이 여럿인 경우) 수량 재분배 정책 — 결정된 바 없어 `syncAssignmentPlansForOrderLock`이 그대로 스킵함(구현 현황 참고).
  - 실제 브라우저로 "잠금 시 카드/수량이 갱신되는지", "스타일 제거 후 재잠금 시 0수량+토스트가 뜨는지", "보드에 확인 필요 섹션이 뜨고 급여 정산되면 사라지는지"는 개발 서버 미기동 상태에서 코드 작성 + `tsc`/`vite build` 통과만 확인했다. 다음에 반드시 실제로 눌러서 확인할 것.

### 41. 2026-07-05 "계획 부하" 과거 달 100% 하드코딩 버그 수정 (완료)

- §37 진단(코드 리뷰만, 미수정) 이후 사용자가 배포된 화면에서 실제로 재현 — `AssignmentPlan`이 0건인 상태에서도 LINE #1 6월 "계획 부하"가 계속 100%로 표시됨.
- 원인: `frontend/src/pages/App/assign/utils/lineMonthCapacity.js`의 `plannedLoadPercent` 계산이 과거("historical") 달에 한해 `roundPercent(lineMonthlyCapacitySeconds, lineMonthlyCapacitySeconds)`(분자=분모 항등식)로 **항상 100%**를 반환했다. 실제 `AssignmentPlan`/작업기록 데이터를 전혀 참조하지 않는 계산이라, 배정이 하나도 없어도 100%가 나왔다. 화면 캡션(`assign.capacitySummaryHint`)에도 "과거 기록월은 100% 기준으로 표시"라고 이 동작이 그대로 문서화되어 있었다 — 의도된 동작이었지만, 어제 사고로 배정 데이터가 전부 사라진 뒤에는 "잔여 데이터가 남아있다"는 오해를 유발하는 잘못된 설계였다.
- 수정: 과거 달의 `plannedLoadPercent`는 이제 같은 달의 `actualOutputPercent`(실제 작업기록 기반 생산률)를 그대로 따른다 — 이미 지난 달은 "계획"이라는 개념 자체가 의미 없고, 실제로 무엇을 만들었는지만 의미가 있다는 논리. 백엔드 요약(`backendRow`)이 없는 폴백 분기도 동일하게 수정(기존엔 이 분기가 달 종류 구분 없이 무조건 100%였음 — 오히려 더 나쁜 상태였음).
  - `monthSummaryByKey.set(...)` 메인 분기: `resolvedActualOutputPercent`를 로컬 상수로 뽑아서 `actualOutputPercent`/`plannedLoadPercent` 양쪽에 재사용.
  - 백엔드 요약 없는 폴백 분기(`months.map`): 동일 패턴 적용.
  - `uiMessages.js`의 `assign.capacitySummaryHint`(ko/en/vi) 캡션 문구를 새 동작에 맞게 갱신.
- `npm --prefix frontend run build` 통과. 실제 브라우저 확인은 아직 안 함 — 다음에 확인 필요.

### 42. 2026-07-05 AssignmentCard가 사고 이전부터 계속 0건이던 진짜 원인 발견 및 수정 (완료)

- §40 배포 후에도 사용자가 주문을 잠가도 카드가 안 생긴다고 재현 — 진단 로그(`console.error`, Railway 배포 로그로 직접 확인)로 추적한 결과 `styles=41 lockedOrders=2` 등 입력 데이터는 전부 정상인데 `buildAssignmentCardsFromOrders`의 결과물 `baseCards=0`으로 확정.
- **진짜 원인**: `buildAssignmentCardsFromOrders`와 `collectStyleQuantityRequirementsFromOrders`가 스타일 조회 맵을 `Style.code`(문자열) 기준으로 만들어놓고, 조회 키로는 `item.styleId`(숫자 FK)를 그대로 `resolveOptionalString()`에 넣어 사용했다. `resolveOptionalString(value, fallback)`은 `value`가 실제 문자열일 때만 값을 반환하고, 숫자가 들어오면 무조건 `fallback`을 반환하도록 구현되어 있다(`backend/src/utils/common.ts:48`). 그 결과 `item.styleId`(항상 숫자)는 매번 빈 문자열/`null`로 변환됐고, `if (!styleId) return;` 가드에 걸려 **모든 주문 항목이 예외 없이 스킵**됐다 — 잠금 여부와 무관하게 카드가 원천적으로 하나도 안 만들어지는 구조였다.
- 이건 §39의 "사고 전부터 AssignmentCard가 이미 0건이었다"는 관찰의 실제 원인이었다. 당시엔 "delete 후 upsert 루프가 원자적이지 않아서"라고 추정하고 `$transaction`으로 감쌌는데(§39, 여전히 유효한 별개의 안전장치), 그건 증상을 완화할 뿐 근본 원인이 아니었다.
- 수정: 두 함수 모두 스타일 조회 맵을 `Style.id`(숫자) 기준 `Map<number, Style>`로 바꾸고, `item.styleId`를 `toPositiveIntOrNull()`로 직접 비교하도록 변경. `Style.id`는 단일 행을 유일하게 식별하므로, 기존에 있던 "코드가 같은 여러 후보 중 주문 고객사/스타일명으로 가장 비슷한 것 고르기"(`resolveStyleCandidateForAssignmentCard`) 로직 자체가 더 이상 필요 없어 삭제했다 — FK 조회는 항상 정확히 하나의 결과만 나오기 때문이다.
- 같은 버그가 있던 `refreshUnlinkedAssignmentPlanSnapshotsForOrg`(스타일 변경 시 미연결 배정 CT/ST 스냅샷 갱신)의 `styleByStyleId`도 같은 방식으로 고쳤다. 이 함수는 `AssignmentPlan`이 0건이라 지금 당장 영향은 없었지만, 카드가 다시 생기고 라인 배정이 시작되면 바로 문제가 될 뻔했다.
- 운영 DB 실데이터로 재현·검증: E14-4 주문의 워크오더아이템을 수정된 로직으로 그룹핑하면 스타일 3개(S-ZIR04V/S-ZIQPQO/S-ZIQDTZ) 카드가 정상적으로 나옴을 확인.
- `npm --prefix backend run build` 통과.
- **남은 것 (같은 버그 패턴, 이번엔 손 안 댐)**: `loadAssignmentDisplayReferenceMaps`(`styleByStyleId`, `Style.code`로 키 생성)와 `findOrderItemByAssignmentIdentity`(`resolveOptionalString(item?.styleId, null)`으로 숫자 비교) — 둘 다 `resolveAssignmentDisplayFallback`이 쓰는 표시용 폴백 헬퍼라 카드 생성 경로에는 영향 없다. 다만 언젠가 이 폴백이 실제로 호출되는 상황(예: 손상된 assignment 표시 복구)에서는 지금도 항상 조용히 실패할 것이다. 다음에 이 영역을 건드릴 때 같이 고칠 것.
- 브라우저 실제 확인 아직 안 함 — 사용자가 재배포 후 잠금 테스트로 확인 예정.
- **2026-07-05 후속 발견 (같은 버그 패턴, 카드 생성은 됐지만 필드가 비어있던 문제)**: 카드는 실제로 생성됐지만 "고객사"가 전부 `-`로 비어있었다. 원인은 §42와 완전히 같은 클래스: `buildAssignmentCardsFromOrders`의 `customer` 필드가 `order?.customerName ?? order?.customer`를 읽고 있었는데, 이 쿼리의 `select`는 애초에 그런 flat 필드를 조회하지 않는다(`buyerOrg`/`customerOrg` relation만 조회함) — FK+join 자체는 이미 정상인데 그 join 결과를 읽는 코드가 안 붙어있던 것. `order?.customerOrg?.name ?? order?.buyerOrg?.name`로 수정. 운영 데이터로 "THE SAN"(더산) 정상 노출 확인.
- 같은 조사 중 `workOrderId: toPositiveIntOrNull(order?.id)`도 발견 — 이 쿼리의 `select`에 `id`가 아예 없어서 `order?.id`가 항상 `undefined`였다. `select`에 `id: true` 추가로 수정.
- **일반화된 교훈**: 이 카드 생성 경로에서 지금까지 찾은 버그 5건(styleId 3곳 + customer + workOrderId)이 전부 "FK+join(relation)은 정상인데, 그 결과를 읽는 코드가 리팩터링 이전의 존재하지 않는 flat 필드를 그대로 참조"하는 동일 패턴이었다. 이 함수(`buildAssignmentCardsFromOrders`)와 그 주변 헬퍼가 오랫동안 실행 자체가 안 됐거나(카드가 항상 0건이라 아무도 필드 값을 눈으로 확인 못함) 조용히 틀린 값만 내고 있었기 때문에 이렇게 오래 안 걸리고 남아있었던 것으로 보인다. 이 함수를 또 건드릴 일이 있으면 `order?.X`/`item?.X` 형태로 접근하는 모든 필드가 실제로 그 쿼리의 `select`에 있는지부터 먼저 대조할 것.
- **2026-07-05 UI 후속 (카드는 생성됐지만 화면에서 이해하기 어려웠던 문제) — 수정 완료**:
  - **수량이 안 보임**: 데이터는 정상이었다(`resolveCardQuantity`가 `cardQuantity`를 올바르게 읽음). 원인은 `CompactBoardCard.jsx`의 `flexWrap: { xs: 'wrap', lg: 'nowrap' }` — 이 브레이크포인트는 뷰포트 너비 기준이라, 뷰포트가 넓어도 "미배정 작업" 사이드바처럼 컨테이너 자체가 좁으면 `nowrap`이 그대로 적용돼 수량 필드가 `overflow:hidden` 밖으로 밀려나 안 보였다. `flexWrap: 'wrap'`(고정)로 변경 — 공간이 충분하면 원래처럼 한 줄로 보이고, 좁으면 자연스럽게 줄바꿈된다.
  - **고객사 이름이 영어로만 나옴**: `buildAssignmentCardsFromOrders`의 `customer` 필드가 `.name`(영어)만 보내고 있었다. `customerNameKo`/`customerNameVi`를 카드 payload에 추가하고, 프론트에 `resolveCardCustomerDisplay(card, languageCode)` 헬퍼를 만들어 미배정 카드 목록(`UnassignedCardItem`)에 적용했다.
  - **남은 범위(미해결)**: 이미 라인에 배치된 배정(`AssignmentPlan`)의 `customer`는 DB에 단일 문자열 컬럼(`customer String?`)만 있고 `customerNameKo`/`Vi` 대응 컬럼이 없다 — 카드를 라인으로 드래그해서 배정이 생성되는 시점에 굳어진 언어 그대로 계속 보인다. 완전히 고치려면 (a) `AssignmentPlan`에 로케일 컬럼을 추가하거나 (b) `workOrderId` FK로 매번 join해서 읽는 방식 중 하나를 결정해야 한다 — 이번엔 손 안 댔고 사용자 확인 후 별도 작업으로 진행 예정.

### 43. 2026-07-05 AssignmentPlan.assignmentCardId 실제 FK 추가 (cardId 문자열 관례 대체, 1단계 완료)

- 배경: 사용자가 "구조적 문제" 목록에 있던 `AssignmentCard.cardId`/`AssignmentPlan.cardId`의 "문자열이 우연히 같은 값이라는 관례" 연결을 실제 FK로 바꾸자고 제안. 예전엔 `AssignmentCard`가 주문 잠금/스타일 저장 때마다 통째로 재계산되는 캐시 성격이라 FK를 걸면 정상적인 재계산 때마다 깨질 위험이 있어서 미뤄뒀었는데, §40에서 이미 "작업기록 연결된 카드는 절대 삭제 안 함" 보호가 들어가 있어서 지금은 안전하게 추가할 수 있는 상태로 확인.
- 구현 (`backend/prisma/schema.prisma`, `backend/migration_fix.sql` Step 0k, `backend/src/index.ts`):
  - `AssignmentPlan.assignmentCardId Int?` 추가, `AssignmentCard.id`로의 실제 FK(`onDelete: SetNull`, workOrderId FK인 Step 0i와 동일 패턴).
  - `cardId`(문자열)는 마이그레이션 기간 동안 읽기 호환용으로 그대로 유지 — 아직 안 지움.
  - `migration_fix.sql`에 additive 컬럼 + 백필(`AssignmentCard.orgId`+`cardId` 매칭) + 인덱스 + idempotent 제약조건 추가(Step 0i와 동일 구조).
  - `toAssignmentPlanWriteData(item, cardIdToAssignmentCardId?)`가 이제 두 번째 인자로 `cardId 문자열 -> AssignmentCard.id` 조회 맵을 받아 `assignmentCardId`를 채운다.
  - `PUT /assignment-board-state`(cardId를 쓰는 유일한 생성/수정 지점, `assignmentPlan.create/updateMany` 둘 다 여기서만 일어남 — 전체 12개 `assignmentPlan.create/update` 호출부를 다 뒤져서 확인함)가 저장 1회당 이 맵을 한 번만 배치 조회해서 create/update 양쪽에 동일하게 전달한다.
  - `npm run build` 통과.
- **의도적으로 안 한 것**:
  - 운영 DB에 직접 DDL 실행은 안 함(세션 중 시도했으나 자동 분류기가 정상적으로 차단 — 정해진 `migration_fix.sql`+predeploy 파이프라인 밖에서 운영 스키마를 직접 바꾸려던 것이라 막힌 게 맞음). 다음 백엔드 배포 때 predeploy가 자동 적용한다.
  - **2026-07-06 정정**: 위 가정이 틀렸다. 사용자가 `railway.json`의 `preDeployCommand`를 의도적으로 꺼둔 상태라 배포해도 `migration_fix.sql`이 자동 적용되지 않았고, 그 결과 이 컬럼이 운영 DB에 계속 없는 채로 남아 `PUT /assignment-board-state`가 503(`missing column: assignmentCardId`)으로 전부 실패하는 장애가 실제로 발생했다. 사용자 명시적 확인 하에 이번엔 운영 DB에 Step 0k SQL을 직접 실행해서 복구했다(컬럼/인덱스/FK 추가, 백필은 현재 `AssignmentPlan`이 0건이라 영향 없음). 시작 시 필수 컬럼 체크 목록(`hasField` 목록, 파일 상단)에도 `assignmentCardId`가 빠져있어 이 드리프트를 못 걸렀던 것도 같이 추가함. **pre-deploy가 꺼져 있는 한 앞으로 `migration_fix.sql`에 추가되는 모든 신규 단계는 자동 적용되지 않는다** — 새 마이그레이션을 추가할 때마다 운영 DB에 수동으로 같은 SQL을 직접 실행해야 한다는 뜻이다. pre-deploy를 왜 껐는지(원래 뭐가 안 됐는지)는 아직 확인 안 됨 — todo.md 참고.
  - `onDelete`는 `Restrict`가 아니라 `SetNull`을 선택함 — 이번이 첫 롤아웃이라 혹시 놓친 예외 케이스가 있어도 카드 재계산 전체가 하드 실패하기보다는 조용히 링크만 끊어지는 쪽을 우선함. 안정성이 확인되면 나중에 `Restrict`로 강화하는 걸 검토할 수 있음.
  - 기존 조회 코드(`loadAssignmentDisplayReferenceMaps`, `findOrderItemByAssignmentIdentity` 등 §42에서 이미 발견한 문자열 기반 스타일 조회 헬퍼들)를 새 FK로 갈아타게 하는 건 이번 범위에 안 넣음 — 이번 phase는 "쓰기 경로가 새 FK를 항상 채우게 하는 것"까지만이고, "읽기 경로가 새 FK를 쓰도록 전환"은 다음 phase.
  - `cardId` 문자열 컬럼 제거는 안 함 — 읽기 경로 전환 검증 끝난 뒤 별도 phase에서.
- **다음 단계 (미착수)**: 운영 배포 후 `assignmentCardId` 백필이 실제로 몇 건 채워졌는지 확인(`npm run` 검증 스크립트 신설 여지 있음, 기존 `verify:workorder-item-backfill` 패턴 재사용 가능) → 읽기 경로를 하나씩 FK 기반으로 전환 → `cardId` dual-read 제거 → 컬럼 DROP.

### 44. 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 전면 재설계 — Phase A (스키마+백필만, 완료)

- 배경: 사용자가 Railway DB 화면에서 `AssignmentCard.payload` JSON을 직접 보고, FK+join으로 만들어달라고 반복 요청했음에도 실제로는 스타일명/스타일코드/고객사명/이미지URL 등이 전부 텍스트로 중복 저장되고 있는 걸 발견. `AssignmentPlan`도 같은 문제(게다가 `styleId` FK 컬럼이 있는데 어떤 저장 경로도 채운 적이 없어 100% NULL)라고 지적. 세 번의 코드 조사 + Plan 에이전트 설계를 거쳐 4단계 계획을 확정(Phase A~D), 이번 세션은 **Phase A만** 구현.
- **명명 규칙**: 새 FK는 `customerId`가 아니라 `buyerOrgId`(`Organization` 참조) — `WorkOrder.buyerOrgId`와 동일한 이름. `WorkOrder.buyerOrgId`/`customerId`는 저장 시점에 항상 같은 값으로 맞춰짐(`normalizeOrderPayload`, `backend/src/index.ts:5334-5341` 부근)이 확인되어 `buyerOrgId`를 기준으로 삼음.
- **Phase A 구현 내용** (`backend/prisma/schema.prisma`, `backend/migration_fix.sql` Step 0l, `backend/src/index.ts`):
  - `AssignmentCard`에 `styleId Int?`(→Style), `workOrderId Int?`(→WorkOrder), `buyerOrgId Int?`(→Organization, named relation `AssignmentCardBuyerOrg`) 추가. `payload` JSON에 이미 있던 값(styleId/workOrderId는 그대로, buyerOrgId는 workOrderId를 통해 join)을 실제 컬럼으로 승격.
  - `AssignmentPlan`에 `buyerOrgId Int?`(→Organization, named relation `AssignmentPlanBuyerOrg`) 추가. `styleId` 컬럼 자체는 이미 있었음(Step 0j, 2026-07-01) — 이번엔 컬럼 추가가 아니라 백필만.
  - `Organization`에 `buyerAssignmentCards`/`buyerAssignmentPlans` named 역관계 추가(기존 unnamed `assignmentCards`/`assignmentPlans`와 공존, `WorkOrder.buyerOrg`가 쓰는 것과 동일한 named-relation 패턴). `Style`/`WorkOrder`에도 `assignmentCards AssignmentCard[]` 역관계 추가.
  - `migration_fix.sql` 맨 위(기존 Step 0k보다 위)에 **Step 0l** 추가: `AssignmentCard.styleId`/`workOrderId`는 `payload->>'styleId'`/`'workOrderId'`에서 직접 백필(이미 검증된 정수라 모호함 없음), `buyerOrgId`는 방금 채운 `workOrderId`로 `WorkOrder`를 join해서 `COALESCE(buyerOrgId, customerId)`로 백필. **`AssignmentPlan.styleId`/`buyerOrgId`는 반드시 `assignmentCardId`를 통해서만 백필**(`AssignmentPlan.assignmentCardId → AssignmentCard.styleId/buyerOrgId`, 독립 재추정 금지) — `assignmentCardId`가 없는 옛 행은 null로 남김(Step 0k와 동일 원칙).
  - 시작 시 필수 컬럼 체크(`assertGeneratedPrismaClientShape`, `hasField` 목록)에 이번에 추가한 4개 컬럼 전부를 **같은 커밋**에 추가 — 어제 아침 사고(§43)가 정확히 이 항목을 빼먹어서 났으므로 반드시 같이 넣음.
  - 별개지만 같이 처리: `resolveAssignmentPlanStyleMetaById`(`backend/src/index.ts:6160` 부근)가 `payload?.styleUid`를 읽던 오타를 `payload?.styleId`로 수정 — `AssignmentCard.payload`는 애초에 `styleUid`라는 키를 가진 적이 없어서 이 폴백 분기가 지금까지 항상 조용히 아무것도 매칭 못 하고 있었음.
  - `npm run prisma:validate`/`prisma:prepare-client`/`npm run build` 전부 통과.
- **Phase A 이후 진행 상황**: Phase B(쓰기 연결)/C(조회 join 전환)/D(죽은 컬럼 삭제)는 아래 §45에서 모두 완료.
- **운영 배포 시 필수**: pre-deploy가 꺼져 있으므로(§43 참고) 배포해도 이 Step 0l이 자동 적용되지 않는다 — 반드시 운영 DB에 직접 접속해 수동으로 SQL을 실행하고, `information_schema.columns`로 컬럼 생성을 직접 확인해야 한다. 자동 적용을 가정하지 말 것.

### 45. 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 전면 재설계 — Phase B/C/D (완료)

- §44 Phase A(스키마 추가 + 백필)에 이어 나머지 세 단계를 같은 세션에서 완료.
- **Phase B (신규/수정 저장 경로가 새 FK를 채우도록 연결)**:
  - `buildAssignmentCardsFromOrders`: 카드 payload에 `buyerOrgId` 추가.
  - `syncAssignmentCardsForOrg`의 upsert(create/update 양쪽): `styleId`/`workOrderId`/`buyerOrgId` 추가.
  - `syncAssignmentPlanWorkOrderRefs`: 이미 조회하고 있던 `matchedWorkOrder.buyerOrgId`를 반환 객체에 포함.
  - `PUT /assignment-board-state`의 `matchedAssignmentCards` 조회를 확장해 `cardId -> {id, styleId, buyerOrgId}` 맵으로 만들고, `toAssignmentPlanWriteData`가 이 맵에서 `styleId`/`buyerOrgId`를 채움(독립 재추정 금지, Phase A와 동일 원칙).
- **Phase C (조회 경로를 join 기반으로 전환, 깨진 자가치유 로직 제거)**:
  - `toAssignmentCardFromStoreRow`/`loadAssignmentCardsForOrg`: `select`에 `style`/`workOrder`/`buyerOrg` relation을 포함시키고, `styleName`/`styleCode`/`previewUrl`/`orderNo`/`customer`/`customerNameKo`/`customerNameVi` 등을 "join 값 우선, 없으면 기존 문자열 폴백" 방식으로 전환. 응답 JSON 필드명은 그대로 유지(프론트 수정 불필요).
  - `toAssignmentPlanResponse`, `ASSIGNMENT_PLAN_SELECT_CORE`/`_LEGACY`, `GET /assignment-plans`, `buildAssignmentPlanProgressRows`, `buildAssignmentPlanCloseResponse`, `toWorkLogContextAssignmentResponse`에 동일한 join-우선 처리(`orderNo`/`customer`/`label`/`previewUrl`) 적용.
  - `resolveAssignmentPlanStyleMetaById`의 `styleUid` 오타는 Phase A에서 이미 수정됨(§44 참고).
  - **깨진 자가치유 로직 완전 제거**: `repairAssignmentPlanDisplayRows`, `assignmentPlanNeedsDisplayRepair`, `ASSIGNMENT_PLAN_DISPLAY_FIELDS`와 `GET /assignment-plans`/`GET /assignment-board-state`의 호출부 2곳을 삭제. Phase A 백필이 기존 행을 한 번에 다 채우므로 "서서히 고쳐지는" read-time 폴백 시나리오 자체가 없어졌고, 원래도 스타일 매칭 버그가 있던 로직이라 계속 남겨둘 이유가 없었음. **주의**: 이름이 비슷한 write-time 로직(`shouldRepairAssignmentBoardDisplayPayloadOnWrite`/`safelyRepairAssignmentBoardDisplayState`/`repairAssignmentBoardDisplayState`)은 저장 payload 정제용으로 별개 메커니즘이라 그대로 유지함 — 이번 삭제 대상이 아님. 이들이 공유하는 `hasCorruptedAssignmentDisplayText`/`loadAssignmentDisplayReferenceMaps`/`resolveAssignmentDisplayFallback`/`shouldRepairAssignmentDisplayField`/`findOrderItemByAssignmentIdentity`도 그대로 유지.
- **Phase D (죽은 컬럼 삭제)**:
  - 삭제 대상: `AssignmentPlan.colorId`(+FK), `colorName`, `color`, `stripeColor`, `imageUrl`, `thumbnailUrl`. (`AssignmentCard.colorId/colorName/gender`는 애초에 실제 DB 컬럼이 존재한 적이 없어 — payload JSON 안의 죽은 키였을 뿐 — 스키마/migration 변경 대상이 아니었고, Phase A에서 이미 `buildAssignmentCardsFromOrders`의 `colorId: null, colorName: null, gender: null` 세 줄만 제거함.)
  - `schema.prisma`: 위 6개 필드와 `AssignmentPlan.attrColor` relation, `AttrColor.assignmentPlans` 역관계, `@@index([colorId])` 제거.
  - `migration_fix.sql` 맨 위에 **Step 0m** 추가(Step 0l보다 위): `DROP CONSTRAINT IF EXISTS "AssignmentPlan_colorId_fkey"` + 6개 컬럼 `DROP COLUMN IF EXISTS`. 이 6개는 (a) `colorId`/`colorName` — 프론트가 실제 색상값을 보낸 적이 없어 항상 null(색상/성별은 배정 단위에서 추적하지 않는다는 도메인 규칙, §37 참고), (b) `color`/`stripeColor` — 이름과 달리 원단 색상이 아니라 CT/ST/PT/AT 기준별 화면 색상 코딩용 write-only 값(프론트는 조회 시 매번 `basis`로 재계산), (c) `imageUrl`/`thumbnailUrl` — `Style`에 별도 썸네일 필드가 없어 join해도 `previewUrl`과 같은 값의 세 번째 사본이 될 뿐이라 삭제로 결정(§44 계획 참고). 백필 대상이 아니므로(원래부터 죽은 값) Phase A류 별도 verify 스크립트 없이 코드 감사로 충분하다고 판단.
  - 코드에서 이 6개 필드를 쓰거나 읽던 모든 지점 정리: `toAssignmentPlanWriteData`(쓰기 제거), `ASSIGNMENT_PLAN_SELECT_CORE`/`_LEGACY`/`COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT`(select에서 제거), `toAssignmentPlanResponse`/`GET /assignment-plans`/`buildAssignmentPlanProgressRows`/`buildAssignmentPlanCloseResponse`/`toWorkLogContextAssignmentResponse`(응답 필드는 하위호환을 위해 정적 값 `null`/`""`으로 고정), `syncAssignmentPlanColorRefs` 함수 전체와 `resolveAssignmentPlanColorName` 함수 전체 삭제(둘 다 이 6개 필드 전용이었고 실사용 시 항상 no-op였음이 확인됨), `syncGlobalCategorySection`(AttrColor 이름 변경 시 `AssignmentPlan.colorName`을 역전파하던 블록) 삭제.
  - `assertGeneratedPrismaClientShape`의 `hasField` 체크를 "있으면 문제"로 반전 추가(6개 전부, `Style.uid still present`와 동일 패턴).
  - `npm run prisma:prepare-client` + `npm run build`(backend) 통과 확인. 당시 `test:quantity-change`의 서브테스트 1개(`'PT' !== 'ST'`)가 실패했으나, 해당 죽은 코드/테스트는 2026-07-08 삭제되어 현재 `npm run test:regression`에는 포함되지 않는다.
- **응답 하위호환**: `colorId`/`color`/`stripeColor`는 `null`/`""`, `colorName`/`imageUrl`/`thumbnailUrl`은 `""`로 고정 응답. 프론트가 이 필드들을 실제로 다시 읽는 곳이 없음을 이미 확인했으므로(§37 조사) 정적 값으로 고정해도 동작에 영향 없음.
- **운영 DB 적용 완료 (2026-07-06)**: `DATABASE_PUBLIC_URL`로 직접 접속해 적용 전 6개 컬럼 존재 + 전부 non-null 0건(및 `AssignmentPlan` 전체 0행, §39 사고 이후 미복구 상태와 일치)을 먼저 확인한 뒤 Step 0m SQL을 실행했고, 재조회로 6개 컬럼이 모두 사라졌음을 확인했다. Phase A~D 전체 완료.

### 46. 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 전면 재설계 — Phase E (완료, orderNo/customer/label/previewUrl + payload 순수 중복 텍스트 정리)

- 배경: §45(Phase A~D) 완료 직후 사용자가 Railway DB 화면에서 `AssignmentPlan` 테이블을 다시 확인하고 `orderNo`/`customer`/`label`/`previewUrl`/`cardId`가 여전히 컬럼으로 남아있는 것과 `AssignmentCard.payload`에 `styleCode`/`styleName`/`previewUrl`/`customerNameKo`/`customerNameVi`/`cardAtTotalSeconds` 등이 여전히 저장되는 것을 지적("결론적으로 시킨거 하나도 반영이 안되어 있어"). 확인 결과 정당한 지적이었다 — Phase A~D는 "새 FK 추가 + 읽기는 join 우선"까지만 했고, 원래 있던 텍스트 컬럼/payload 키를 실제로 끊어내는 마지막 단계(Phase A~D 계획 문서의 "Phase D"가 처리한 색상 계열과 달리, `orderNo/customer/label/previewUrl`은 스킵됨)를 안 밟았었다.
- **Supabase 착시 아님, 실제 결과 재확인**: `mainline.proxy.rlwy.net:31661`(Railway) 재접속으로 Phase D의 6개 색상 컬럼은 실제로 사라졌음을 재확인. 사용자가 지적한 `orderNo/customer/label/previewUrl`은 Phase D 범위 밖이라 실제로 남아있던 것이었다(착시가 아니라 진짜 미완료).
- **cardId는 이번 범위에서 제외**: 다른 3+1개 필드와 달리 `cardId`는 순수 중복 텍스트가 아니라 카드 upsert의 유일 키(`@@unique([orgId, cardId])`)이자 122곳 이상의 매칭 로직이 참조하는 값이다. `assignmentCardId`(정수 FK)로 이론상 완전히 대체 가능하지만 그 전환은 훨씬 큰 별도 작업이라 이번엔 손대지 않음(사용자에게 설명 후 동의됨).
- **createdBy는 이번 재설계와 무관**: 스키마 전체 26개 테이블에 공통인 감사(audit) 필드 패턴(`AsyncLocalStorage`로 요청 주체 이메일 자동 주입)이며, FK로 안 건 이유는 계정 삭제 후에도 "누가 만들었는지" 기록을 남기기 위한 의도적 전역 설계로 보임 — AssignmentPlan/Card 이슈와 별개, 바꾸려면 전체 테이블에 영향 주는 별도 작업.
- **AssignmentPlan.orderNo/customer/label/previewUrl 컬럼 완전 삭제**:
  - `schema.prisma`에서 4개 필드 제거.
  - `migration_fix.sql` 맨 위(Step 0m보다 위)에 **Step 0n** 추가: 4개 컬럼 `DROP COLUMN IF EXISTS`. Phase D의 색상 컬럼과 달리 이 4개는 **이번 세션 전까지는 실제로 매 저장마다 값이 채워지고 있었다** — "원래부터 죽은 값"이 아니므로 migration 주석에 이 차이를 명시하고, 실행 전 운영 `AssignmentPlan` 행 수 재확인을 권고 문구로 남김(작성 시점 기준 0행 확인됨, §39/40/42 사고 이후 미복구 상태와 일치).
  - **쓰기 중단**: `toAssignmentPlanWriteData`, `COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT`/`buildCompletedAssignmentWriteComparable`(완료 assignment 구조변경 감지 대상에서도 제외 — 더 이상 실제 write 필드가 아니므로), `normalizeAssignmentPlanPayload`(customer/label/previewUrl 및 이미 죽어있던 colorId/colorName/imageUrl/thumbnailUrl/color/stripeColor까지 같이 정리 — `orderNo`는 `syncAssignmentPlanWorkOrderRefs`의 주문 매칭 입력값으로 여전히 필요해 유지), `syncAssignmentPlanWorkOrderRefs`(반환 객체에서 orderNo/customer 출력 제거, workOrderId/buyerOrgId만 반환)에서 전부 제거.
  - **읽기를 join-only로 전환**: `toAssignmentPlanResponse`/`GET /assignment-plans`/`buildAssignmentPlanProgressRows`/`buildAssignmentPlanCloseResponse`/`toWorkLogContextAssignmentResponse`의 `?? plan.orderNo` 같은 컬럼 폴백을 전부 제거하고 `workOrder.orderNumber`/`buyerOrg.name`/`style.name`/`style.imageUrls[0]` join 값만 사용(없으면 `""`).
  - **select 상수 정리**: `ASSIGNMENT_PLAN_SELECT_CORE`/`_LEGACY`에서 4개 스칼라 필드 제거. **`_LEGACY`에도 `workOrder`/`style`/`buyerOrg` relation을 새로 추가**(기존엔 CORE에만 있었음) — `workOrderId`/`styleId`/`buyerOrgId`는 시작 시 `hasField` 게이트로 항상 존재가 보장되므로, "레거시(스키마 드리프트 허용)" select에서도 안전하게 relation을 쓸 수 있다고 판단.
  - **`ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE`라는 공유 상수를 신설**(`ASSIGNMENT_PLAN_SELECT_CORE` 바로 위): `select`가 아니라 `include`가 필요한 개별 `findUnique`/`findFirst` 호출부(전체 스칼라 컬럼 + 표시용 relation이 동시에 필요한 곳)에서 재사용.
  - **이번에 처음 발견한, Phase C 문서에는 없던 실제 버그**: `completeAssignmentPlanProduction`과 `PATCH /assignment-plans/:externalId/final-quantity`의 완료 처리 트랜잭션 안 `tx.assignmentPlan.findUnique({ where: { id: plan.id } })` 2곳이 `select`/`include` 없이 스칼라 전체만 가져오고 있어서, `buildAssignmentPlanCloseResponse`의 "join 우선" 로직이 이 두 응답 경로에서는 **항상 폴백(저장된 텍스트 컬럼)만 타고 join은 한 번도 실행된 적이 없었다**. 이번에 `include: ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE`를 추가해서 실제로 join이 동작하도록 고쳤다 — Phase C가 "구현했다"고 문서화했던 것과 실제 동작이 달랐던 사례.
  - **work-logs 엑셀 임포트의 `orderNo` WHERE 필터를 relation 필터로 전환**: `where: { orderNo: { in: planOrderNos } }` → `where: { workOrder: { orderNumber: { in: planOrderNos } } }`. `orderNo`는 단순 표시값이 아니라 이 경로에서 실제 **쿼리 매칭 키**로 쓰이고 있었다(발견 당시 반드시 처리해야 했던 항목). 같은 함수(`resolveWorkLogImportAssignmentCandidate`) 내부의 인메모리 매칭 비교(`plan?.orderNo`, `plan?.label`)도 `plan?.workOrder?.orderNumber`/`plan?.style?.name`로 변경, `resolveAssignmentPlanStyleQueryValues`의 스타일 매칭 후보 목록도 동일하게 수정.
  - **급여 잠금 검증(`validateAssignmentPlanPayrollLock`)/CT snapshot 검증(`validateWorkLogAssignmentPlanCtSnapshot`)/`formatAssignmentPlanLabel`의 select**도 `orderNo/label` 스칼라 대신 `ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE`로 교체. `formatAssignmentPlanLabel` 자체도 join 값을 읽도록 수정.
  - **AT 학습 파이프라인(`loadAtTrainingSourceWorkLogs`)의 `WorkRecord.assignmentPlan` nested select**: `{ customer: true, orderNo: true }` → `{ workOrder: { select: { orderNumber: true } } }`로 교체(`customer`는 애초에 이 함수 안에서 소비된 적이 없는 죽은 select 필드였음도 같이 확인/정리). 소비 지점(`record.assignmentPlan?.orderNo`)도 `record.assignmentPlan?.workOrder?.orderNumber`로 수정.
  - **작업기록 응답용 `loadWorkRecordResponseDisplayContext`**: `db.assignmentPlan.findMany`의 select를 `{orderNo,customer,label}` → `{workOrder:{orderNumber},buyerOrg:{name},style:{name}}`로 교체하고, `assignmentPlanMetaById`에 담기 직전 join 값을 `orderNo`/`customer`/`label` 키로 재조립(`hydrateWorkRecordResponseDisplayFields`가 이 필드명을 그대로 읽으므로 소비 지점은 무수정) — 이 경로는 실사용되는 작업기록 표시 데이터라 Phase D의 "완전히 죽은 값" 케이스들과 달리 신중하게 처리함.
  - `findAssignmentPlansWithSelectFallback`의 `selectAttempts` 타입을 `ReadonlyArray<Record<string, true>>` → `ReadonlyArray<Record<string, any>>`로 완화(relation을 포함한 select 객체를 받을 수 있도록, TS 빌드 에러 원인이었음).
- **AssignmentCard.payload 순수 중복 텍스트 정리**: `stripLegacyAssignmentCardPayload`(write-time sanitizer, `normalizeAssignmentCardsForStore`가 저장 직전 호출)에서 `styleCode`/`styleName`/`previewUrl`/`orderNo`/`dueDate`/`customer`/`customerNameKo`/`customerNameVi`를 저장 payload에서 제거하도록 확장. `toAssignmentCardFromStoreRow`(Phase C에서 이미 join-우선으로 구현됨)가 이 필드들을 `style`/`workOrder`/`buyerOrg` relation에서만 읽게 되므로 응답 필드 자체는 그대로 유지된다(값의 출처만 payload JSON에서 join으로 완전히 바뀜). **범위에서 제외한 것**: `styleId`/`workOrderId`/`buyerOrgId`(실제 FK 값이라 원래도 중복이 아니었고, `toAssignmentCardFromStoreRow`가 이 3개는 override 없이 payload spread로 그대로 반환하므로 지우면 응답에서 사라짐 — 유지), `cardQuantity`/`cardPtTotalSeconds`/`cardAtTotalSeconds`/`cardStTotalSeconds`/`processCount`/`status`(Style.processes × 수량으로 계산되는 **집계값**이지 순수 텍스트 복사가 아니라서 이번 phase 범위 밖으로 명시적으로 남김 — recompute-on-read로 갈지 계속 저장할지는 별도 정책 결정 필요).
- 검증: `npm run prisma:prepare-client` + `npm --prefix backend run build` 통과. 당시 `test:quantity-change`의 동일한 1개 서브테스트(`'PT' !== 'ST'`)가 실패했으나, 해당 죽은 코드/테스트는 2026-07-08 삭제되어 현재 회귀 스위트에는 남아 있지 않다.
- **운영 DB 적용 완료 (2026-07-06)**: `DATABASE_PUBLIC_URL`로 직접 접속해 적용 전 4개 컬럼 존재 + 전부 non-null 0건(및 `AssignmentPlan` 전체 0행, §39 사고 이후 미복구 상태와 일치)을 먼저 확인한 뒤 Step 0n SQL을 실행했고, 재조회로 4개 컬럼이 모두 사라졌음과 `AssignmentPlan` 최종 컬럼 목록이 `schema.prisma`와 정확히 일치함을 확인했다. Phase A~E 전체 완료.

### 47. 2026-07-07 OrgMembership → Employee 계정 테이블 통합 (Codex 구현, 완료 — 상세 리뷰로 검증됨)

- 배경: `OrgMembership`(로그인 계정/권한)과 `Employee`(제조사 현장 인사정보)가 별도 테이블로 나뉘어 있던 것을, Codex에게 "Employee를 모든 Organization 소속 계정의 canonical table로 승격하고 OrgMembership을 제거"하는 방향으로 구현시켰다. 사전에 이 방향에 대한 설계 리뷰(위험 지점, 이름 충돌, partial index 필요 여부, 단계별 순서)를 별도로 거친 뒤 진행됨.
- **최종 스키마**: `Employee`에 `email`(nullable), `orgRole`(`OrgUserRole` enum: ADMIN/OPERATOR/ACCOUNTANT/WORKER — 시스템 접근 권한), `status`(`EmployeeStatus` enum: PENDING/ACTIVE/REJECTED/SUSPENDED/TERMINATED, DB 물리 enum 이름은 `@@map("OrgMembershipStatus")`로 유지), `requestedAt`/`requestedName`/`approvedAt`/`approvedBy`가 추가됨. 기존 `Employee.roleId`(→`AttrRole`, 조직별 커스터마이징 가능한 현장 직무 — 감독/봉제/다림/검수/포장 등)는 **리네임하지 않고 그대로 유지** — `orgRole`(시스템 권한)과 `roleId`(현장 직무)는 이름이 비슷해 보이지만 서로 다른 축이며, 이름 하나로 합치지 않은 것이 맞는 선택이었다.
- **unique 제약**: `@@unique([orgId, email])`, `@@unique([orgId, employeeNo])` 둘 다 **일반(non-partial) Prisma 유니크**로 선언됨 — Postgres는 원래 UNIQUE 제약에서 NULL끼리 서로 다르게 취급하므로 "값이 있을 때만 유일"이 별도 partial index 없이 자동으로 충족된다(`Factory.factoryCode`처럼 raw SQL partial index로 우회할 필요가 없었음).
- **마이그레이션(`migration_fix.sql` Step 0o)**: 기존 `OrgMembership` 행을 `orgMembershipId`로 매칭되는 `Employee`에 백필하고, 매칭되는 `Employee`가 없는 행(주로 발주처 계정, 그리고 갓 온보딩된 조직의 첫 ADMIN 계정)은 새 `Employee` 행으로 INSERT한 뒤, `orgMembershipId` FK/컬럼을 제거하고 마지막에 `DROP TABLE IF EXISTS "OrgMembership"`. 순서가 안전하게(백필 → FK 제거 → 테이블 삭제) 짜여 있고 전부 `IF EXISTS`로 멱등 처리됨. `emp+%@baro.local` 형태의 가짜 이메일도 이 백필 중 NULL로 정리됨(가짜 이메일 금지 원칙 준수).
- **audit FK**: `Employee.createdByEmployeeId`/`updatedByEmployeeId`(nullable, self-referencing) 추가. `requestActor.ts`의 AsyncLocalStorage store에 `employeeId` 필드를 추가해서, `middleware/access.ts`가 요청당 한 번 수행하던 기존 Employee 조회 결과를 그대로 그 store에 mutate로 채워넣고(`setCurrentRequestActorEmployeeId`), `db.ts`의 Prisma extension이 그 값을 읽어 `createdByEmployeeId`/`updatedByEmployeeId`를 자동 채운다 — **추가 DB 조회 없이** 기존 인증 조회를 재사용하는 구조로, 26개+ 테이블 저장 경로를 하나도 직접 건드리지 않았다. 문자열 `createdBy`/`updatedBy` 스냅샷은 그대로 유지(SystemUser/배치 작업처럼 Employee가 없는 행위자를 위해 필수).
- **시작 시 스키마 드리프트 게이트**: `hasField("Employee","orgRole")`/`("Employee","status")` 필수 체크 추가, `modelByName.has("OrgMembership")` "있으면 문제" 역방향 체크 추가, `STARTUP_FORBIDDEN_RUNTIME_TABLES = ["OrgMembership"]`로 물리 테이블 자체의 부재까지 별도로 재확인(3중 방어).
- **API 하위호환**: `org-memberships/orgMembership.routes.ts` 파일/폴더명과 `/org-memberships` 라우트 경로는 그대로 유지하되 내부 구현은 100% `prisma.employee`로 교체됨(파일 안에 `prisma.orgMembership.*` 호출 0건 확인). 응답 필드도 `role: employee?.orgRole ?? "WORKER"`처럼 프론트가 원래 기대하던 이름(`role`)을 그대로 유지하는 얇은 매핑을 API 경계에서 해줘서 프론트 수정이 거의 필요 없었다(`frontend/src/pages/App/employee/EmployeeBoard.jsx`는 무수정으로 계속 동작).
- **사후 검증 (Codex, todo.md 기록)**: 세션 전용 `DATABASE_PUBLIC_URL`로 직접 접속해 `information_schema`로 `OrgMembership` 테이블 부재, `Employee.orgMembershipId` 컬럼 부재, `Employee`의 신규 계정 컬럼(`email`/`orgRole`/`status`/`requestedName`/`approvedAt`) 존재를 확인하고 마이그레이션 후 `Employee` 행 수(20건)까지 todo.md에 기록함 — 이 세션에서 확립한 운영 DB 검증 관행을 그대로 따름.
- **별도 세션에서 사후 전수 검토 수행 (레거시/숨은 폴백 여부 확인)**: `prisma.orgMembership.*` 호출 전체 재검색(0건), `middleware/access.ts`의 `context.orgMembership`/`toOrgMembershipCompat`이 실제로는 이미 조회한 Employee를 재포장만 하는 순수 함수임을 확인(추가 쿼리·구 테이블 접근 없음), `payroll.service.ts`의 `employee.membership.*` 접근이 전부 `employee.*`로 평탄화됐음을 diff로 확인 — **기능적으로 숨겨진 폴백이나 레거시 테이블 참조는 발견되지 않았다.**
- **발견된 유일한 실제 결함 (같은 세션에서 즉시 수정, 커밋 `72f608e`)**: `backend/src/work-records/workRecord.shared.ts`(이번 통합 작업과 무관하게 몇 주 전부터 있던 별도 모듈)의 `WORK_RECORD_WITH_REFS_INCLUDE` 상수가 §46에서 이미 삭제된 `AssignmentPlan.orderNo/customer/label`을 여전히 select하고 있어서, `GET /work-logs?includeRecords=1`(작업기록 목록 화면)이 매번 500 에러를 내고 있었다. **이건 Codex의 실수가 아니라 §46 작업 중 `backend/src/index.ts`만 grep하고 별도 디렉토리(`src/work-records/`)를 놓친 내 실수였다.** `workOrder.orderNumber`/`buyerOrg.name`/`style.name` join으로 교체하고, 유일한 소비처(`hydrateWorkRecordResponseDisplayFields`)도 join 경로를 읽도록 같이 수정.
- **사소한 네이밍 잔재 (기능 문제 아님, 정리 안 함)**: `context.orgMembership`/`toOrgMembershipCompat` 함수명, `index.ts` 일부의 `membershipStatus`/`membershipRole` 지역 변수명(실제로는 `worker.status`/`worker.orgRole`를 읽음), `org-memberships` 폴더/라우트 경로 — 전부 이름만 옛 관습이고 실제 데이터 흐름은 Employee 기준. todo.md에 "나중에 API 이름 정리 가능(추가 DB 마이그레이션 불필요)"이라고 이미 기록돼 있음.

### 48. 2026-07-09 배정 CT 스냅샷이 클라이언트 메모리 상태를 그대로 신뢰하던 문제 (신규 배정 생성 시점 검증 추가, 완료)

- **2026-07-10 정정/후속 완료**: 아래 7/9 결론 중 "`validateNewAssignmentPlanCtSnapshotProcesses`는 로그만 남기고 저장은 통과"라는 완화책은 최종 안전장치로 부족했다. 현재 코드는 `PUT /assignment-board-state`에서 편집 가능한 배정의 CT 스냅샷을 서버가 `AssignmentCard.styleId` FK의 라이브 스타일 공정 기준으로 재생성하고, 클라이언트가 null/불완전 스냅샷을 보내도 기존 유효 스냅샷은 보존한다. 그 후에도 유효한 `assignmentCtSnapshot`/`assignmentCtTotalSeconds`를 만들 수 없으면 저장을 409로 막는다. 작업기록 연결 배정과 급여 잠금 배정은 기존 보호 규칙대로 스냅샷 재작성 대상에서 제외한다. 프론트도 `/assignment-cards?includeProcesses=1` 전체 로딩 실패 상태에서는 저장 가능 상태로 전환하지 않고, CT 재계산 실패 시 기존 유효 스냅샷을 null로 덮어쓰지 않는다. 단, 프론트 `styles` 배열이 비었다는 사실만으로 저장을 막지는 않는다 — 카드 자체가 실제 FK로 연결돼 있으면 서버가 그 FK를 따라 CT/ST를 계산한다.
- 증상: 작업기록 파일 등록 시 "주문 L15-2 / 스타일 AJ1528에는 공정 TS05 배정 카드가 없습니다" 에러. 그런데 스타일 화면(`스타일 → 공정 정보`)엔 TS05가 실제로 존재함.
- 1차 오진단(정정됨): 처음엔 "주문을 잠그는 순간 CT 스냅샷을 얼린다"고 설명했으나, 주문 잠금 시점 실행 함수 `syncAssignmentPlansForOrderLock`(`backend/src/index.ts:11746`)을 직접 읽어보니 이 함수는 기존 `AssignmentPlan`의 `assignmentQuantity`/`assignmentStTotalSeconds`만 조정할 뿐 `assignmentCtSnapshot`은 전혀 읽지도 쓰지도 않는다. 주문 저장/잠금은 CT 스냅샷과 무관하다.
- **확정된 원인**: `AssignmentPlan.assignmentCtSnapshot`은 배정 카드를 라인에 올려 배정 보드에서 저장(`PUT /assignment-board-state`)할 때 찍힌다. 이때 스냅샷의 `processes[]` 목록은 **백엔드가 최신 `StyleProcess`를 다시 조회해서 만드는 게 아니라, 프론트(`AssignBoard.jsx`)가 그 순간 메모리에 들고 있던 스타일 데이터를 그대로 넣어 보낸 값**이다(`toAssignmentPlanWriteData`, `backend/src/index.ts:12740` → `resolveNormalizedAssignmentCtSnapshot(item)`이 요청 바디의 `item.assignmentCtSnapshot`을 그대로 읽음). 만약 그 순간 브라우저 탭이 오래돼서(다른 탭에서 스타일에 공정을 추가한 뒤 이 탭을 새로고침 안 한 경우 등) 스타일 데이터가 오래된 상태였다면, 그 불완전한 목록이 그대로 영구 저장된다. 스타일 편집 이벤트(`workspaceDataEvents.js`)는 `window.dispatchEvent`/`addEventListener` 기반이라 **같은 브라우저 창 안에서만** 전파되고 다른 탭/창은 못 듣는다는 것도 확인됨(Codex 교차검증) — 여러 탭을 띄워두고 작업하는 실제 사용 패턴과 맞물리면 이 문제가 재현되기 쉽다.
- **예외로 남아있던 정당한 경로**: `refreshUnlinkedAssignmentPlanSnapshotsForOrg`(`backend/src/index.ts:11533`)/`buildRefreshedUnlinkedAssignmentSnapshot`(`:11396`)는 "아직 작업기록에 연결 안 된(unlinked)" 배정에 한해 라이브 스타일 기준으로 스냅샷을 다시 만드는 별도 경로다. 이번 수정은 이 경로를 건드리지 않았고, 이 경로가 정확히 어떤 조건에서 도는지는 별도 확인이 필요하다(추후 과제).
- **1차 수정(과했음, 되돌림)**: 처음엔 `PUT /assignment-board-state`에서 새로 생성되는 `AssignmentPlan`(`createPlanRows`)에 한해 스타일의 살아있는 `StyleProcess` 목록과 스냅샷의 `processes[]`를 비교해서, 빠진 공정이 있으면 저장 전체를 `409`로 거부하게 만들었다. 배포 직후 실제 운영에서 "이 배정을 만든 뒤 스타일 공정이 바뀌었습니다. 새로고침하고 다시 시도해 주세요" 에러가 스타일을 전혀 수정하지 않았는데도 뜨는 걸 사용자가 즉시 재현해서 보고함 — 저장 자체가 완전히 막히는 회귀였다.
- **진짜 원인 (재조사로 확인)**: 프론트 `buildAssignmentCtSnapshotForSave`(`frontend/src/pages/App/assign/AssignBoard.jsx:1392`)는 공정 하나라도 ST/CT 초를 계산 못 하면(`ctSeconds == null`, 라인 1517) 그 공정을 `null`로 남기고, `processes.length !== processSeeds.length`(라인 1555)에 걸려 **스냅샷 전체를 `null`로 반환**한다. 즉 특정 공정에 아직 ST/CT 시간이 설정 안 돼 있으면(예: 그 공정에 대한 `StyleProcessStandard` 버킷이 아직 없음) 프론트는 스냅샷을 아예 못 만들고 기존(구) 스냅샷을 그대로 쓰게 되는데, 이건 이 앱이 이미 다른 곳에서 정상으로 취급하는 상태다(§35: "ST 미설정 assignment는 forecast에서 제외하고 경고만 준다" — 하드 블록 아님). 1차 수정의 신규-생성 검증은 이 "정상적으로 ST가 아직 없는" 케이스와 "진짜로 브라우저가 오래돼서 빠진" 케이스를 구분하지 못하고 둘 다 똑같이 저장 자체를 막아버려서, ST 미설정 공정이 하나라도 있는 스타일은 새 배정을 아예 못 만드는 상태가 됐다.
- **최종 수정**: `validateNewAssignmentPlanCtSnapshotProcesses`(`backend/src/index.ts`, `toAssignmentPlanWriteData` 바로 아래)는 그대로 두되 **`409` 거부를 없애고 `console.warn` 진단 로그만 남기도록** 변경했다. 저장을 막지 않는다. 두 가지 원인(진짜 stale 브라우저 vs 정상적인 ST 미설정)을 구분하는 로직은 아직 없다 — 지금은 순수 로그로만 존재한다.
  - 프론트(`AssignBoard.jsx`)의 `resolveBoardSaveErrorMessage`에 추가했던 이 에러 전용 안내 분기는 백엔드가 더 이상 이 에러를 던지지 않으므로 그대로 삭제했다(죽은 코드 방치 금지 원칙).
  - 검증: `npm --prefix backend run build`, `npm run test:regression`, `npm --prefix frontend run build` 통과.
- **이번에 고치지 않은 것 (알려진 한계)**:
  - 이미 잘못 저장된 기존 배정(L15-2/AJ1528 등)은 여전히 자동 복구되지 않는다.
  - "진짜 stale 브라우저로 인한 누락"과 "해당 공정에 ST/CT가 아직 없어서 정상적으로 빠진 것"을 구분하는 로직이 없다 — 구분하려면 스타일의 해당 공정에 `StyleProcessStandard` 버킷이 실제로 있는지까지 확인해야 하는데, 이번엔 손 안 댔다(향후 과제로 남김).
  - `refreshUnlinkedAssignmentPlanSnapshotsForOrg`가 정확히 언제/무엇을 트리거로 도는지, 이번 케이스가 그 경로로 이미 커버됐어야 했는지는 미확인 상태로 남아있다.
  - 크로스탭 이벤트 전파(다른 탭의 스타일 편집을 열려있는 배정 보드 탭에 알리는 것) 자체는 고치지 않았다.
  - **교훈**: 이 앱의 ST/CT 관련 검증은 "값이 있으면 정확해야 한다"와 "값이 없을 수 있다(경고만)"를 구분해서 다뤄야 하는데, 1차 수정에서 이 구분을 놓치고 "완전성 검증 = 하드 블록"으로 성급하게 설계했다. 비슷한 검증을 추가할 땐 §35 같은 기존 "미설정 허용, 경고만" 패턴이 이미 있는지부터 확인할 것.

### 49. 2026-07-13 스타일 공정/PT/ST 편집 정책 (Codex 구현)

- 공정 정보 탭에서 사용자가 직접 입력하는 기준 시간은 PT뿐이다. ST는 매입 단가/타임 매트릭스 탭에서만 명시적으로 수정하고, AT는 작업기록/출퇴근 학습 결과로만 채운다.
- 새 공정을 처음 만들 때만 PT(1,000)를 기준으로 전체 ST(q) bucket을 초기 생성한다. 기존 공정의 PT를 수정하더라도 ST(q)는 자동으로 따라 바꾸지 않는다.
- 스타일 저장 payload에 `stBuckets`가 포함돼 있다는 사실만으로 ST 수정 의도로 해석하지 않는다. ST를 쓰는 요청은 `stBucketWriteMode: "MANUAL_EDIT"`와 실제 수정 bucket 목록(`stBucketUpdateQuantities`)처럼 명시적인 쓰기 의도를 가져야 한다.
- 기존 공정의 ST는 명시된 bucket만 부분 upsert/delete한다. 스타일 저장 과정에서 기존 `StyleProcessStandard` 전체를 delete/recreate하지 않는다.
- 공정 구조가 바뀌는 경우(AB를 합치거나 A를 나누는 등)는 기존 공정을 덮어쓰거나 삭제하는 것이 아니라 새 공정 row를 추가하는 방향을 우선한다. 작업기록이 연결된 `StyleProcess`를 삭제해 `WorkRecord.styleProcessId`를 orphan으로 만들면 안 된다.
- `Style.processes` JSON은 ST의 소스오브트루스가 아니다. 관계형 `StyleProcessStandard`와 차이가 난다는 이유만으로 JSON 값을 이용해 ST를 자가치유하거나 덮어쓰지 않는다.
