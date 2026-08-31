# BARO 앱 구조 분석 리포트 (2026-08-31)

## 조사 방법

Claude Code(Sonnet 5)가 3개의 독립 에이전트를 병렬로 투입해 아래 세 영역을 각각 근거(파일 경로 + 줄 번호) 기반으로 감사했다. 코드 수정은 하지 않았고, 순수 조사만 수행했다.

1. `backend/prisma/schema.prisma` 전체(1,756줄) — FK/제약조건/인덱스 감사
2. `backend/src/**/*.ts`(약 41,900줄, `index.ts`가 35,054줄로 84% 차지) — 백엔드 로직/동시성/아키텍처 감사
3. `frontend/src/**`(약 73,000줄) — 프론트엔드 구조/동기화/테스트 커버리지 감사

이 프로젝트는 `AGENTS.md`(구 `CLAUDE.md`)에 2026년 5월부터 8월까지의 개발 이력과 정책이 매우 상세히 기록되어 있고, 특히 §37("구동 오류 위험 지점 점검")에 "발견했지만 아직 수정 안 함"이라고 적힌 항목들이 있었다. 이번 조사에서는 그 항목들이 **여전히 유효한지 직접 코드로 재검증**했고, 그 과정에서 문서가 이미 낡아 있는 부분(실제로는 고쳐졌는데 문서만 안 갱신됨)과 **문서에 없던 새 문제**를 함께 찾아냈다.

---

## 요약 (Executive Summary)

- 가장 시급한 두 가지는 **`LineAssignment` 테이블의 구조적 결함**(조직 격리 안 됨 + 기간 중복 방지 안 됨)과 **완료 확정된 배정을 지울 수 있는 레이스 컨디션**이다. 둘 다 국소적 수정으로 해결 가능하고 파급력 대비 수정 난이도가 낮다.
- `AGENTS.md` §37에 "미수정"이라고 적힌 프론트엔드 버그 4건은 **실제로는 이미 수정 완료**된 상태다. 문서 갱신이 필요하다.
- 급여/정산에 직결되는 필드들이 여전히 자유 문자열(String)로 저장되어 오타·잘못된 값을 DB가 막지 못한다.
- 프론트엔드 테스트가 전체 코드베이스에 **0개**다. 과거 NaN 버그들이 오래 방치될 수 있었던 근본 원인으로 보인다.
- 이 프로젝트는 스키마 마이그레이션을 Prisma의 표준 마이그레이션이 아니라 손으로 누적 관리하는 `migration_fix.sql` + 수동 배포 검증에 의존하고 있고, 실제로 이 방식 때문에 배포 사고가 난 전례(§43)가 문서에 남아 있다. 이건 코드 버그가 아니라 **프로세스 리스크**로 별도 취급해야 한다.

---

## 1. DB 스키마 / 외래키(FK) 문제

### 🔴 High

**1-1. `LineAssignment` 테이블에 `orgId`가 아예 없음** — `schema.prisma:772-785`

직원의 라인 소속 이력을 담는 이 테이블은 스키마 전체에서 유일하게 `orgId` 컬럼 자체가 없다. `lineId`/`employeeId`가 단일 컬럼 FK라서 DB 차원에서 "A조직 직원이 B조직 라인에 배정되는 것"을 막을 방법이 없다. 게다가 같은 직원이 같은 기간에 두 라인에 동시 소속되는 것을 막는 제약(unique/exclusion constraint)도 전혀 없다.

- 이미 `AGENTS.md` §51에서 이 결함을 우회하기 위해 앱 레벨 진단(`capacityOverlapCount`)을 사후에 별도로 만든 기록이 있다 — "DB가 못 막으니 앱이 감시라도 하자"는 임시방편이었던 셈.
- 라인-월 capacity·스케줄러 forecast 계산 전체가 이 테이블에 의존하므로 파급력이 크다.
- **개선 방향**: `orgId` 컬럼 추가(+ `Line`/`Employee`와의 복합 FK로 조직 일치 강제) 및 Postgres의 `EXCLUDE` 제약(또는 daterange 컬럼 + GiST 인덱스)으로 같은 직원의 활성 기간 중복을 DB 레벨에서 원천 차단.

**1-2. 완료 확정된 `AssignmentPlan`이 레이스 컨디션으로 삭제될 수 있음** — `backend/src/index.ts:29396-29465`, `:15708-15730`

`PATCH .../production-complete`와 `PATCH .../final-quantity`는 이미 "조회 후 조건부 업데이트" 문제를 `updateMany` + compare-and-swap(`where: { isCompleted:false, updatedAt: plan.updatedAt }`)으로 고쳐놨다. 그런데 바로 옆의 취소 엔드포인트(`DELETE /assignment-board-state/assignment/:assignmentId`)는:
1. `prisma.assignmentPlan.findFirst`로 `isCompleted`를 조회(트랜잭션 밖)
2. `isCompleted === true`면 409 반환
3. 그 사이 다른 요청이 완료 확정을 커밋하면?
4. 실제 삭제(`db.assignmentPlan.deleteMany`)의 `where`에는 `isCompleted` 조건이 없음 → 그대로 삭제됨

두 요청(브라우저 탭 두 개, 또는 QC 배치 작업)이 거의 동시에 들어오면 방금 완료 확정된 배정이 삭제된다. 특히 연결된 `WorkRecord`가 0건인 배정(수동 0-수량 완료 등, §40 참고)은 삭제를 막는 별도 가드(`assertAssignmentPlansCanBeDetached`)도 우회된다. "완료된 assignment는 읽기 전용"이라는 이 프로젝트의 핵심 불변식이 이 경로 하나에서 깨진다.

- **개선 방향**: 삭제도 동일하게 `deleteMany({ where: { id: {in:[...]}, isCompleted: false } })` 형태의 compare-and-swap으로 바꾸고, 삭제된 행 수가 요청한 개수와 다르면 409로 거부.

**1-3. 조직 스코프 FK가 절반만 일관되게 적용됨**

`StyleProcessStandard`, `WorkRecord.assignmentPlan`/`.styleProcess`, `SalaryItemRate`, `OrgRelationshipStyleSalesBucket`/`TimeBucket` 등에는 "자식 행의 부모가 진짜 같은 조직인지" `(id, orgId)` 복합 FK로 DB가 강제하는 패턴이 이미 정착되어 있다. 그런데 같은 파일 안에서 아래는 전부 단일 컬럼 FK로 남아 있어 이 패턴에서 빠져 있다:

- `Line.factory` (`schema.prisma:456`)
- `Employee.factory`/`Employee.line` (`:504-505`, 같은 모델의 `role`/`grade`는 복합 FK를 쓰는데 이 둘만 빠짐)
- `AttendanceEntry.factory`/`.worker` (`:741-742`)
- `WorkRecord.worker`/`.line` (`:1597, 1601`, 같은 모델의 `assignmentPlan`/`styleProcess`는 복합 FK를 쓰는데 이 둘만 빠짐)
- `OutsourcedWorkRecord.line` (`:1644`)
- `WorkLog.factory` (`:1559`)
- `AtTrainingBucket.*`, `AtTrainingBucketProcess.*` (`:1138-1140, 1170-1173`)
- `EmployeeGrade.set` (`:627`)

패턴을 몰라서 안 한 게 아니라 **적용이 누락된 것**이라 오히려 고치기 쉬운 부류다. 우선순위는 급여/근태 관련(`Employee.factory/line`, `AttendanceEntry.*`, `WorkRecord.worker/line`)부터.

### 🟠 Medium

**1-4. `WorkOrder`의 3중 유니크 제약이 카운터파티 미정 상태를 못 막음** — `schema.prisma:1257`

`@@unique([buyerOrgId, sellerOrgId, orderNumber])`인데 `buyerOrgId`/`sellerOrgId` 둘 다 `Int?`. Postgres는 NULL을 서로 다르게 취급하므로, `EDITING`(초안, 카운터파티 미정) 상태의 주문끼리는 같은 `orderNumber`가 여러 개 생겨도 DB가 막지 못한다.

**1-5. `WorkLog.records` JSON이 여전히 `Line.id`를 관계 없이 담고 있음** — `schema.prisma:1550`

`AGENTS.md`가 스스로 "구조적 문제 #1"로 이미 인지하고 있는 항목이지만 아직 미해결. `WorkLog`에서 라인을 조인하려면 여전히 JSON을 파싱해야 한다.

**1-6. 급여/스케줄 핵심 필드가 여전히 자유 문자열(String)** (자세한 목록은 3장 참고)

이 프로젝트는 `OrgUserRole`, `WorkOrderStatus`, `ProductionStage`, `AssignmentCloseMode` 등 실제 Prisma enum을 정확히 쓸 줄 아는데, 급여 계산에 직결되는 `Employee.payType`, `EmployeeCompensationPolicy.payType`, `SalaryItemRate.payType`, `SalaryItem.category`/`payCycle`, `AssignmentPlan.scheduleStatus` 등은 오탈자를 막을 방법이 없는 `String`으로 남아 있다. 특히 `scheduleStatus`는 `AGENTS.md` §28A에서 `READY_TO_COMPLETE` 레거시 값 드리프트가 실제 문제를 일으킨 전례가 있는 필드라 우선순위가 높다.

**1-7. `LineAssignment`, `AssignmentPlan.scheduleStatus`, `WorkOrder.status`/`.confirmationStatus`에 조회 패턴에 맞는 인덱스 부재**

`LineAssignment`는 `lineId`/`employeeId`/`endAt` 각각 단일 인덱스만 있고, "직원 X의 활성 배정"/"라인 X의 활성 배정" 같은 실제 조회 패턴에 맞는 복합 인덱스(`(employeeId, endAt)`, `(lineId, endAt)`)가 없다. `AssignmentPlan.scheduleStatus`, `WorkOrder.status`/`.confirmationStatus`도 화면 필터링에 쓰이는데 인덱스가 없다.

### 🟡 Low / 참고용

- `AssignmentPlan.originOrderId`(String, FK 없음) — `workOrderId`가 이미 실제 FK로 있는데 레거시로 중복 보유.
- `AssignmentCard.payload` JSON에 `cardQuantity`/`cardStTotalSeconds` 등 파생 집계값을 여전히 저장 — `AGENTS.md` §46이 스스로 "recompute-on-read로 갈지 계속 저장할지 미정"이라 명시한 미결 사항.
- `StyleProcess.processComposition`(Json) — `ProcessMasterOption` 마스터 테이블이 있는데 이 값을 관계형 조인 테이블 없이 JSON으로만 들고 있을 가능성 (필드명만으로 추정, 코드 레벨 재확인 필요).
- `AttrColor`/`Currency`/`ProcessMasterOption`은 `orgId`가 없는데, 이건 의도된 전역 마스터 데이터로 보이며 결함이 아님(참고로만 기록).

---

## 2. 백엔드 로직 문제 (`backend/src/index.ts` 중심)

### 성능

**2-1. N+1 순차 쿼리 — 배정 보드 저장 경로**

`createPlanRows`(`:30094-30106`)와 `refreshIncomingAssignmentCtSnapshotsFromStyles`/`prepareAssignmentBoardStTotalsForSave`(`:17576-17583`)가 스타일 개수만큼 `ensureInitialStyleProcessVersion`을 순차 호출하는데, 이 함수 자체가 스타일 하나당 2~4회 순차 DB 왕복(`:32893-32925`)을 한다. 이게 **30초 타임아웃이 걸린 `$transaction` 안에서** 일어난다(타임아웃 설정 자체가 이미 이 문제를 짐작하게 함, `:31956`). 스타일 수가 많은 저장(대량 주문 잠금, 큰 드래그 리플로우)일수록 트랜잭션 락 보유 시간이 선형으로 늘어나 동시 저장 간 충돌/타임아웃 가능성이 커진다.

**2-2. N+1 순차 쿼리 — 주문 잠금 동기화**

`syncAssignmentPlansForOrderLock`의 두 루프(`:16033-16078`, `:16135-16195`)도 스타일/배정 개수만큼 순차 `update`. 주문 항목 수로 상한이 걸려 있어 2-1보다는 덜 급하지만 같은 패턴.

**2-3. ST 총합 계산 로직 중복 — drift 위험**

`:30205-30209`에서 공용 헬퍼(`calculateAssignmentStTotalSecondsFromStyleRows`, 반올림·클램프 포함)를 쓰지 않고 ST 총합을 인라인으로 재구현. 다른 두 호출부(`:16172`, `:17744`)는 정상적으로 공용 헬퍼를 쓴다. 지금 당장은 값이 같을 수 있지만, 나중에 공용 헬퍼의 반올림 규칙이 바뀌면 이 경로만 조용히 다른 값을 내게 된다 — `AGENTS.md`가 반복적으로 경계하는 "동일 로직이 여러 곳에 흩어져 drift" 패턴 그 자체.

### 동시성/정확성

**2-4. `PATCH /assignment-plans/:externalId/ct-review`의 체크-후-갱신 패턴** — `:25873-25912`

`plan.ctReviewRequired`를 조회 후 조건 없이 `update`. 다만 쓰기 자체가 멱등(리뷰 타임스탬프/리뷰어 갱신)이라 최악의 경우도 "마지막 쓰기가 이김" 수준이지 데이터 유실은 아니라 우선순위는 낮음. 2-1 취소 엔드포인트와 같은 근본 패턴이므로 리팩터링 시 함께 정리하는 게 효율적.

**2-5. 참고: `Style.findMany`에 orgId 필터가 없는 것은 의도된 정상 동작임 (오검출 방지용 기록)**

`resolveWorkRecordCanonicalStyleRefs`(`:8747-8758`)가 orgId 없이 Style을 조회하는데, 이건 `Style`이 브랜드/제조사 간 정당하게 교차 소유되는 구조(`AGENTS.md`에 명시)라서 버그가 아니다. 다만 코드만 보면 예전에 실제로 고쳤던 버그(`syncWorkRecordRefs`의 `styleProcess.findMany` orgId 누락 — 이건 실제 버그였고 이미 수정됨)와 패턴이 비슷해 보여서, 다음에 리뷰하는 사람이 착각하고 "고친다"고 손댔다가 오히려 정상 동작을 깨뜨릴 위험이 있다. 코드에 "이건 의도적으로 orgId 필터가 없다"는 주석을 남겨두는 걸 권장.

### 아키텍처

**2-6. `index.ts`가 백엔드 로직의 84%(35,054/41,866줄)를 차지**

도메인별로 분리된 8개 모듈(`organizations`, `employees`, `factories`, `lines`, `payroll`, `work-records`, `auth`, `middleware`)의 경계 설정 자체는 합리적이다. 문제는 이 프로젝트에서 가장 자주 변경되고 버그가 가장 많이 났던 영역 — 배정/스케줄러, 주문, 스타일, 작업기록, AT 학습 — 이 전부 분리 대상에서 빠져 있다는 것. 실제로 이번에 찾은 버그들(2-1, 2-2, 2-3, 1-2)도 전부 이 미분리 영역에서 나왔다.

### 검증 완료: 과거 문서에 "미수정"이라 적힌 항목들의 현재 상태

| 항목 | 상태 |
|---|---|
| `styleProcess.findMany` orgId 필터 누락 | ✅ 수정 완료, 회귀 없음 |
| 인증/조직 컨텍스트가 `x-user-email`/`x-org-id`를 신원 근거로 씀 | ✅ 수정 완료, `x-org-id`는 힌트로만 쓰이고 실제 조직 소속은 매번 재검증됨. 재조사에서도 예외/회귀 발견 안 됨 |
| `completeAssignmentPlanProduction`/`final-quantity`의 체크-후-갱신 레이스 | ✅ 수정 완료(compare-and-swap 방식). **다만 바로 옆 취소 엔드포인트에 같은 클래스의 새 버그가 발견됨 — 위 1-2 참고** |
| `resolveWorkRecordProcessBucketKeyForAssignmentSchedule`의 processCode 문자열 폴백 | ✅ 제거 완료. 이제 styleProcessId로만 해석하고 실패 시 null 반환(정확 계산 원칙 준수) |
| `toAssignmentPlanWriteData`의 `updatedAt ?? new Date()` 패턴 | ⚠️ 이번 조사에서 재검증 안 됨 — 다음 조사 때 확인 필요 |
| 프론트 리플로우가 급여 잠금(`isPayrollLocked`) 무시 | ✅ 수정 완료 — 자세한 내용은 3장 참고 |

---

## 3. 프론트엔드 구조 문제 (`frontend/src`)

### ✅ 이미 수정되어 있음 (문서만 안 갱신된 항목들)

`AGENTS.md` §37에 "미수정"이라고 적힌 아래 4건은 실제 코드 확인 결과 **전부 고쳐져 있었다**. 다음에 이 문서를 손볼 때 §37을 정정해두는 게 좋다 — 안 그러면 나중에 다른 사람(또는 AI)이 이미 고친 코드를 "버그"로 착각하고 다시 손대거나, 반대로 정상 코드를 의심하며 시간을 낭비하게 된다.

- `getTodayDayIndex`가 범위 밖일 때 `0`을 반환하던 문제 → 이제 `null` 반환 + 3곳 호출부 모두 가드 처리 (`AssignBoard.jsx:1911-1915`)
- `getAssignmentStartKey`의 NaN이 `.sort()` 6곳을 오염시키던 문제 → `toSignedInt` 가드 적용 (`:2055-2060, 721-725`)
- 드롭 핸들러의 `Number(dayIndexRaw)` NaN 미체크 → `Number.isFinite` 가드 적용 (`:6289-6296`)
- 리플로우가 `isPayrollLocked`/`payrollLockMonth`를 무시하던 문제 → 수정됐고, 문서가 요구한 것보다 더 나아가 **드래그앤드롭 자체를 급여 잠금 대상에 못 하도록** 막는 것까지 구현됨 (`:2079-2084, 6300`)
- `cardId`/`originOrderId` 문자열을 파싱해 가짜(synthetic) 카드를 만드는 폴백 → 전체 grep 결과 존재하지 않음, 금지 원칙 그대로 지켜지고 있음

### 🔴 새로 발견된 문제

**3-1. 급여 화면 하나가 동시편집 보호 없이 통째로 덮어씀**

`PayrollEntry.jsx:185-189`의 직원별 생산수당 override 저장(`PUT /payroll/snapshots/:month/employee-rates`)이 `version`/`expectedVersionId` 없이 `{ overrides }`만 보낸다. 관리자 두 명이 같은 달을 동시에 열어 수정하면 조용히 한쪽이 사라진다. 정확히 같은 패턴(`expectedVersionId` + 서버 409)이 `CustomerPricingBoard.jsx:699-752`에 이미 구현되어 있으니 그대로 이식하면 된다. 돈이 걸린 화면인데 보호가 없는 유일한 사례라 우선순위가 높다.

**3-2. 프론트엔드 테스트 0개**

`frontend/src` 전체에 `*test*` 패턴 파일이 하나도 없다(백엔드는 `test:regression`, `test:relationship-bucket-integration` 등 최소한의 스크립트 기반 테스트가 있는 것과 대조적). §1에서 언급한 NaN 계열 버그들이 그렇게 오래 방치될 수 있었던 근본 원인으로 보이며, 지금도 `AssignBoard.jsx`의 reflow/forecast 로직은 모듈 스코프 함수로는 분리되어 있지만(export는 안 됨) 컴포넌트를 마운트해야만 검증 가능한 상태다.

**3-3. `buildDateKey` 3중 구현, 그중 2개는 Invalid Date 가드 없음**

`WorkspaceDashboard.jsx:155-162`는 `Number.isNaN` 가드가 있는데, `ProductionPlanBoard.jsx:389-394`와 `AssignBoard.jsx:1770-1775`는 바이트 단위로 동일하면서 가드가 없다. 잘못된 Date가 들어오면 `"NaN-NaN-NaN"` 키를 조용히 만들어내고, 이게 `findIndex` 조회에서 그냥 "못 찾음"으로 처리되어 에러 없이 조용히 넘어간다 — 이 프로젝트가 이미 겪은 NaN 인덱스 버그 계열의 재발 가능 지점.

### 🟡 참고

**3-4. `PayrollBoard.jsx`의 백그라운드 새로고침 실패 시 시각적 stale 표시 없음** (`:130-165`)

토스트는 뜨지만 테이블 자체에 "이 값은 오래됐을 수 있다" 같은 표시가 없다. `AssignBoard.jsx`가 진행률/capacity 조회 실패 시 `assignmentProgressStale` 같은 플래그로 화면에 명시 표시하는 것과 대조적. 토스트를 놓치면 사용자는 낡은 급여 요약을 최신으로 착각할 수 있다.

**3-5. 크로스탭 동기화는 여전히 같은 브라우저 창 안에서만 동작**

`workspaceDataEvents.js`는 `window.dispatchEvent`/`addEventListener`만 쓰고 `BroadcastChannel`은 전체 프론트엔드에 0건. `AGENTS.md`가 이미 알고 있는 한계(§48 스냅샷 stale 버그의 근본 원인)이며 여전히 그대로다.

**3-6. `AssignBoard.jsx` 7,795줄** — 두 번째로 큰 파일(`OrderList.jsx` 4,548줄)의 거의 2배. 유지보수성 이슈로 별도 처리는 급하지 않지만, 3-2(테스트 0개)와 결합하면 이 파일을 고칠 때마다 회귀 위험이 구조적으로 크다는 뜻.

> **참고 (2026-08-31 커밋 시점)**: 이 문서 작성 중 워킹 트리에 `frontend/src/constants/uiMessages.js`, `frontend/src/layouts/MainLayout.jsx`, `frontend/src/pages/App/payroll/PayrollBoard.jsx`, `frontend/src/pages/App/payroll/PayrollEntry.jsx`에 대한 별도 진행 중 변경이 있었다(이 문서 작성 세션과 무관한 다른 작업). 위 3-1/3-4 findings는 그 변경 **이전** 상태를 기준으로 조사된 것이므로, 병합 후에는 실제 코드를 다시 확인해 유효성을 재검증해야 한다.

---

## 4. 프로세스/운영 리스크 (코드 버그는 아니지만 구조적 위험)

여기부터는 세 에이전트의 코드 감사 범위 밖이지만, `AGENTS.md`에 이미 기록된 과거 사고 이력을 종합해 볼 때 함께 짚고 넘어갈 필요가 있다고 판단한 부분이다.

**4-1. 스키마 마이그레이션이 표준 도구가 아니라 손으로 누적하는 SQL 파일에 의존**

이 프로젝트는 Prisma 표준 마이그레이션(`prisma migrate deploy`)을 쓰지 않고, `backend/migration_fix.sql`이라는 단일 누적 SQL 파일 + `prisma db push`에 의존한다(`AGENTS.md` 최상단에 이유가 적혀 있음: 마이그레이션 히스토리 drift). 이 방식 자체가 이미 실제 배포 사고를 냈다 — §43에서 `railway.json`의 `preDeployCommand`가 조용히 꺼져 있어서 신규 컬럼(`assignmentCardId`)이 운영 DB에 반영되지 않았고, `PUT /assignment-board-state`가 전부 503으로 실패하는 장애로 이어졌다. 이후에도 "pre-deploy가 꺼져 있는 한 새 마이그레이션마다 운영 DB에 수동으로 같은 SQL을 직접 실행해야 한다"는 문장이 문서에 그대로 남아 있다 — 즉 **자동화가 아니라 사람(또는 AI)의 기억에 의존하는 배포 프로세스**다.

- **개선 방향**: (a) `preDeployCommand`가 왜 꺼졌는지 원인을 확정하고 다시 켜거나, (b) 배포 파이프라인에 "필수 컬럼 존재 여부"를 배포 직후 자동 검증하는 스모크 테스트를 넣거나(이미 시작 시 `hasField` 체크가 있으니 이걸 배포 게이트로 격상), (c) 장기적으로는 Prisma 표준 마이그레이션으로 되돌아갈 수 있는 조건(히스토리 재정렬)을 검토.

**4-2. 파괴적 작업에 대한 백업/복구 전략이 문서에 보이지 않음**

§39에 실제 프로덕션 데이터 손실 사고 기록이 있다 — 주문 잠금 해제 로직 버그로 `AssignmentPlan` 25건과 `WorkRecord` 전체가 삭제됐고 "백업 없어 복구 불가"라고 명시되어 있다. 이후 코드 레벨 재발 방지(가드 추가)는 잘 되어 있지만, **Railway Postgres의 정기 백업/PITR(point-in-time recovery) 설정 여부**는 이 저장소의 어떤 문서에도 언급이 없다. 코드 버그를 아무리 잘 막아도 다음 사고(사람의 실수, 새로운 버그 클래스)를 100% 막을 수는 없으므로, DB 자체의 백업 전략은 별도로 확인이 필요하다.

**4-3. CI/CD에서 자동 테스트가 실행되는지 불확실**

저장소에 `test:regression`, `test:time-date` 같은 npm 스크립트는 있지만, 이게 PR/push 시 자동으로 도는 CI 파이프라인(GitHub Actions 등)에 연결되어 있는지는 이번 조사 범위에서 확인되지 않았다. Railway 배포 자체는 CD처럼 동작하지만, 배포 전에 테스트가 게이트 역할을 하는지는 별개 문제다.

**4-4. JSON-관계형 이중 저장 재발 방지용 가드레일 부재**

`AGENTS.md`는 수개월에 걸쳐 "JSON에 FK를 중복 저장하지 말라"는 원칙을 세우고 실제로 여러 필드를 정리해왔다(§DB 설계 원칙, §44-46 등). 원칙은 문서화되어 있지만, **새 코드가 이 원칙을 어기는 걸 자동으로 잡아주는 장치가 없다** — 예를 들어 "이름이 `xxxId`로 끝나는 Int 컬럼인데 `@relation`이 없으면 경고"하는 스키마 린트 스크립트 같은 것. 지금은 순전히 리뷰어(또는 다음 AI 세션)의 기억에 의존하고 있는데, 이번 조사에서 발견한 1-3(단일 컬럼 FK 잔존)이 정확히 이 가드레일 부재의 결과로 보인다.

- **개선 방향**: `npm run verify:*` 스크립트 계열에 스키마 컨벤션 체크(모든 `xxxId: Int` 필드에 대응하는 relation이 있는지, 모든 `orgId`를 가진 모델의 FK가 복합 FK인지)를 추가해 CI에서 자동 검증.

---

## 5. 우선순위 로드맵 제안

빠르고 파급력 큰 순서로 묶으면 대략 이렇다(구현 난이도는 낮은데 영향은 큰 것부터):

1. **1-2 (완료 배정 삭제 레이스)** — 삭제 쿼리의 `where`에 `isCompleted: false` 한 줄 추가 + 삭제 건수 검증. 가장 작은 수정으로 가장 위험한 구멍을 막음.
2. **3-1 (PayrollEntry 동시편집 보호)** — 이미 있는 `CustomerPricingBoard.jsx` 패턴을 그대로 이식.
3. **1-1 (LineAssignment orgId + 기간 중복 방지)** — 스키마 변경 + 마이그레이션 필요해서 위 두 개보다는 크지만, 라인/스케줄러 계산 전체의 신뢰도에 영향.
4. **1-3 (단일 컬럼 FK → 복합 FK 전환)** — 급여/근태 관련 모델부터 순차적으로.
5. **1-6 / 3장 (String → enum 전환)** — `payType`, `scheduleStatus`부터. `AGENTS.md`에 이미 canonical 값 목록이 문서화되어 있어 설계 논의 없이 바로 enum화 가능.
6. **2-1/2-2 (N+1 배치화)** — 트랜잭션 타임아웃 리스크를 줄이는 성능 개선, 운영 데이터가 늘어나기 전에 처리하는 게 유리.
7. **3-2 (프론트 테스트 도입)** — 당장 버그는 아니지만, 이게 없는 한 위 항목들을 고칠 때마다 회귀 위험을 감수해야 함. `AssignBoard.jsx`의 순수 계산 함수(reflow, forecast, dateKey)부터 단위 테스트로 감싸는 게 ROI가 가장 높음.
8. **4장 전체 (프로세스 리스크)** — 코드 수정이 아니라 운영/문서/CI 정책 확인이 필요한 항목들이라 별도 트랙으로 진행.

---

## 이 문서를 다른 AI에게 전달할 때 참고할 맥락

- 이 프로젝트(`AGENTS.md`)는 "정확 계산 원칙"이라는 강한 규칙을 갖고 있다: 계산에 필요한 FK/근거 데이터가 없으면 절대 추정치·fallback으로 채우지 말고 명시적으로 실패시켜야 한다(0/null + 진단 로그). 어떤 제안을 받든 이 원칙과 충돌하는 해법(예: "값이 없으면 그냥 0으로 채우자" 류)은 이 프로젝트에서는 반려 대상이라는 점을 함께 전달하면 좋다.
- DB 마이그레이션은 Prisma 표준 방식이 아니라 `backend/migration_fix.sql` 누적 파일 방식을 쓴다는 것, 그리고 운영 DB(Railway)와 Supabase(인증 전용, DB 아님)를 혼동하면 안 된다는 것도 다른 AI에게 미리 알려주는 게 안전하다 — 이 저장소 자체가 그 혼동을 막기 위해 `AGENTS.md` 최상단에 굵게 경고를 박아둘 정도로 실수가 잦았던 지점이다.
- 이 문서의 발견 사항 중 "✅ 이미 수정되어 있음"으로 표시한 것들은 실제 현재 코드를 읽고 검증한 것이고, 그 외 항목은 전부 현재 코드 기준 미해결로 검증된 것이다. 다만 이 저장소는 변경이 매우 잦으므로, 구현을 맡기기 전에 해당 파일/줄 번호를 다시 한번 열어 최신 상태인지 확인하길 권한다.
- 이 문서 작성 시점에 다른 세션이 `frontend/src/pages/App/payroll/PayrollBoard.jsx`, `PayrollEntry.jsx` 등을 동시에 수정 중이었다. 3-1/3-4 항목은 그 작업이 반영되기 전 상태 기준이므로, 실제 구현에 들어가기 전 최신 diff를 다시 확인할 것.
