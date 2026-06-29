# TODO - 레거시 정리와 실제 생산 계산 검증 계획

기준일: 2026-06-29

목표는 "대충 맞는 계산"이 아니라 하나의 정확한 데이터 흐름을 고정하는 것이다.
임시 우회 계산, 문자열 fallback으로 숫자를 맞추는 방식, 과거 null 데이터를 조용히 끼워 넣는 방식은 금지한다.

---

## 공통 원칙

1. null 컬럼이 보인다고 바로 삭제하지 않는다.
2. 먼저 소스오브트루스를 확정한다.
3. 신규 저장 경로가 소스오브트루스를 정확히 저장하는지 확인한다.
4. 2026-04-01 이후 운영 데이터만 백필/정리 대상으로 본다.
5. 화면 계산은 정규 참조만 사용한다.
6. 실패한 데이터는 콘솔 로그에서 `왜 실패했는지`가 보여야 한다.
7. 참조 제거 -> 검증 -> DB 컬럼 삭제 순서로만 진행한다.

---

## 1. 작업기록 정규 참조 null 정리

상태: 진행 중

### 소스오브트루스

- 작업기록과 배정의 연결: `WorkRecord.assignmentPlanId`
- 스타일 FK: `WorkRecord.styleUid`
- 사람이 보는 스타일 코드: `WorkRecord.styleId`
- 스타일별 공정/ST FK: `WorkRecord.styleProcessId -> StyleProcess.id`
- 공정 마스터 보조 FK: `WorkRecord.processId` (`AttrProcess.id`, ST 매칭 키 아님)
- 사람이 보는 공정 코드: `WorkRecord.processCode`
- 실제 생산 시간: `StyleProcessStandard.bucketStSeconds * WorkRecord.quantity`

### 주의

- `styleId`는 FK가 아니라 표시/진단용 코드다.
- 실제 생산 계산에서 `styleId`로 `Style.uid`를 다시 찾는 계산은 하지 않는다.
- `WorkRecord.processId`는 `StyleProcess.id`가 아니므로 ST 매칭 키로 직접 쓰지 않는다.
- ST 매칭은 `styleProcessId + bucketQuantity`로 한다.
- `ctSeconds`는 작업기록 저장 당시 급여/계약 CT 스냅샷이므로 유지한다. 실제 생산률/ST 계산에는 사용하지 않는다.

### 해야 할 일

1. 신규 작업기록 저장 시 모든 row에 `assignmentPlanId`, `styleUid`, `styleProcessId`, `processCode`가 남도록 강제한다.
2. 4월 이후 기존 `WorkRecord` 중 `assignmentPlanId/styleUid/styleProcessId/processCode` 누락 row를 집계한다.
3. 4월 이후 기존 `WorkRecord`의 결정 가능한 null을 DB migration으로 채운다.
   - `assignmentPlanId -> AssignmentPlan.orderNo/lineId`
   - `assignmentPlanId -> AssignmentPlan.cardId/originOrderId -> WorkOrderItem.styleUid`
   - `styleUid + processCode -> StyleProcess.id`
4. 결정 불가능한 row는 임의 추정하지 않고 남겨서 명시적으로 확인한다.
5. 실제 생산 계산 로그는 정리 결과 검증용으로만 사용한다.
   - 계산식
   - 스타일 매칭 규칙
   - 공정 매칭 규칙
   - 분자: 작업기록 ST 합계
   - 분모: 라인 월 capacity
   - 포함된 작업행 수
   - 실패한 작업행 수
   - 실패 사유별 개수
   - 실패 sample row
   - `styleUidSource`, `processCodeSource`
   - `styleProcessIdSource`
6. 실패 사유는 다음처럼 분리한다.
   - `STYLE_UID_MISSING`
   - `STYLE_PROCESS_ID_MISSING`
   - `STYLE_PROCESS_NOT_FOUND`
   - `STYLE_PROCESS_STYLE_MISMATCH`
   - `ST_BUCKET_NOT_FOUND`
   - `COVERAGE_DATE_MISSING_OR_INVALID`
   - `MONTH_ALLOCATION_EMPTY`

### 테스트 방법

브라우저 콘솔에서 배정 화면을 열고 `/assignment`에서 2026-04 또는 2026-05를 조회한다.

확인할 콘솔 그룹:

- `[line-month-capacity] request`
- `[line-month-capacity] actual output request diagnostics`
- `[line-month-capacity] actual output debug`
- `[line-month-capacity] formula {lineId}/{monthKey}`
- `[line-month-capacity] failed work-record raw samples`
- `[line-month-capacity] matched work-record raw samples`

성공 기준:

- `workRowsWithoutAssignmentPlanId = 0`
- `workRowsWithoutStyleUid = 0`
- `workRowsWithoutStyleProcessId = 0`
- 실패 sample이 있다면 어떤 DB 필드가 문제인지 설명 가능해야 한다.

2026-06-29 1차 반영:

- `/line-month-capacity?debug=actual-output` 응답에 계산 규칙과 키 샘플을 추가한다.
- 브라우저 콘솔 summary에서 `processId`와 `processCode`를 분리해서 보여준다.
- `processId`는 `AttrProcess.id`, ST 매칭은 `processCode`라는 점을 콘솔 rules에 표시한다.

2026-06-29 2차 반영:

- request/response/style input 보조 로그는 제거한다.
- 확인해야 하는 콘솔 그룹은 접지 않고 펼친 상태로 출력한다.
- 남기는 그룹은 `actual output diagnostics`, `actual output debug`, `formula`, 실패/성공 work-record sample이다.

2026-06-29 3차 반영:

- `POST /work-logs`, `PUT /work-logs/:id`, 작업기록 import 저장 직전에 `styleUid/processId/processCode`가 비어 있으면 저장을 거부한다.
- `backend/migration_fix.sql`에 2026-04-01 이후 WorkRecord 정규참조 v2 백필을 추가한다.
- 이 백필은 결정 가능한 값만 채우며, orphan/ambiguous row를 임의로 연결하지 않는다.

2026-06-29 4차 반영:

- `/line-month-capacity` 실제 생산 계산에서 조회 시점의 `attachCanonicalFieldsToWorkRecords` 보정을 제거한다.
- 당시 실제 생산 ST 매칭은 DB에 저장된 `WorkRecord.styleUid/processCode` 조합만 사용하도록 줄였으나, 5차에서 `WorkRecord.styleProcessId` 기준으로 대체한다.
- `styleId/styleCode/name`으로 `Style.uid`를 다시 찾는 조회 계산을 제거한다.
- `AttrProcess.code`나 공정명으로 `processCode`를 대신 맞추는 계산을 제거한다.
- 콘솔 진단은 fallback 결과가 아니라 DB에 저장된 canonical 필드의 누락 여부를 보여준다.

2026-06-29 5차 반영:

- `WorkRecord.styleProcessId` 컬럼/FK를 추가한다.
- 2026-04-01 이후 row 중 `styleUid + processCode`로 `StyleProcess.id`가 단 하나로 결정되는 경우만 `styleProcessId`를 백필한다.
- 신규 작업기록 저장/수정/import에서 `styleProcessId`가 없으면 저장을 거부한다.
- `/line-month-capacity` 실제 생산 계산은 `WorkRecord.styleProcessId -> StyleProcessStandard.bucketStSeconds`만 사용한다.
- 작업기록 상세 조회는 조회 시점의 `syncWorkRecordRefs` 보정을 하지 않고 DB에 저장된 값을 그대로 응답한다.

### WorkRecord 컬럼 분류

유지:

- `assignmentPlanId`: 배정 카드 DB FK. 작업기록과 배정/스케줄러 연결의 핵심.
- `workerId`: 작업자 FK.
- `styleUid`: 스타일 FK.
- `styleProcessId`: 스타일별 공정/ST FK.
- `ctSeconds`: 저장 당시 급여/계약 CT 스냅샷. CT 변경 이력을 보존해야 하므로 유지.
- `quantity`, `effectiveCoverageStartDate`, `effectiveCoverageEndDate`: 작업 사실과 기간 스냅샷.

삭제 후보:

- `workerName`, `customerName`, `orderNo`, `styleId`, `styleName`, `colorCode`: 정규 FK가 아니라 표시/레거시 스냅샷. 화면/API 참조 제거 후 삭제 검토.
- `processId`: `AttrProcess.id` 보조 참조. `styleProcessId` 전환 이후 업무상 필요성이 사라지면 삭제 검토.
- `colorId`: 색상/사이즈 단위 작업기록 정책을 확정하기 전까지 보류.

### DB 컬럼 삭제 순서

1. 운영 조회 코드가 해당 컬럼을 더 이상 읽지 않게 한다.
2. 신규 저장 코드가 canonical 컬럼만 저장하도록 차단한다.
3. 2026-04-01 이후 운영 데이터에 남은 null/legacy 사용량을 집계한다.
4. 결정 가능한 값만 migration으로 백필한다.
5. 콘솔/SQL로 남은 legacy 참조가 0인지 확인한다.
6. 그 다음 `migration_fix.sql`에서 DROP 한다.

삭제 검토 대상:

- 실제 생산 계산에서 `WorkRecord.styleId`는 FK로 사용하지 않는다. 표시/진단 참조가 모두 제거되면 DROP 후보로 본다.
- 실제 생산 계산에서 `WorkRecord.processId`는 ST 매칭에 사용하지 않는다. 공정 마스터 참조/진단 필요성이 사라지면 DROP 후보로 본다.
- 색상/성별 관련 컬럼은 3번 항목에서 참조 제거 후 DROP 후보로 본다.

---

## 2. 4월 이전 자료 숨김

상태: 대기

### 기준

- 작업배정과 작업기록은 2026-04-01부터 운영 데이터로 본다.
- 2026-03 이전 월은 생산 분석/배정 분석에서 표시하지 않는다.

### 해야 할 일

1. 생산 분석 월 선택의 최소 월을 2026-04로 제한한다.
2. 배정 화면 실제 생산/히스토리 계산도 2026-04 이전은 제외한다.
3. 콘솔 진단에서도 요청 월이 2026-03 이하이면 제외 이유가 보이게 한다.

---

## 3. 색상/성별 레거시 정리

상태: 대기

### 현재 판단

색상은 업무 의도상 주문 단위에만 있으면 된다.
하지만 현재 코드에는 아직 색상/성별 참조가 남아 있으므로 DB 컬럼을 바로 삭제하면 안 된다.

### 주요 참조

- `backend/src/quantity-settlement/quantitySettlement.service.ts`
- `frontend/src/pages/App/QcReview.jsx`
- `frontend/src/pages/App/assign/*`
- `frontend/src/pages/App/work/WorkDetail.jsx`

### 해야 할 일

1. 정산/QC/배정/작업기록 화면에서 색상 참조가 실제로 필요한지 확인한다.
2. 필요 없으면 코드 참조부터 제거한다.
3. 제거 후 테스트한다.
4. 마지막에 DB 컬럼을 삭제한다.

삭제 보류 컬럼:

- `WorkRecord.colorId`
- `WorkRecord.colorCode`
- `AssignmentPlan.colorId`
- `AssignmentPlan.colorName`
- `AssignmentPlan.gender`

---

## 4. 라인명 정리

상태: 대기

### 현재 판단

`employee.lineName`은 현재 소속 표시용 캐시 성격이다.
과거 작업기록이나 월간 분석의 기준으로 쓰면 안 된다.

### 소스오브트루스

- 작업기록 row: `WorkRecord.lineId`
- 작업기록 헤더 메타: `WorkLog.records.lineId/lineName`
- 기간별 소속 이력: `LineAssignment`

### 해야 할 일

1. 생산 분석/작업기록 월간 집계에서 `employee.lineName` fallback을 제거한다.
2. 필요한 경우 `LineAssignment` 기간 이력을 조회해서 표시한다.
3. `employee.lineName`은 현재 소속 표시용으로만 남긴다.

---

## 5. 공장 공임 이력

상태: 대기

### 현재 구조

- 공장 현재값: `Factory.targetMonthlyWage`, `Factory.wagePerSecond`
- 작업기록 스냅샷: `WorkLog.factoryWagePerSecond`
- 급여 계산: `WorkLog.factoryWagePerSecond` 사용

### 문제

현재 구조에는 "2026-06 공임", "2026-07 공임" 같은 월 기준 이력이 없다.
월 중간 변경, 소급 변경, 마감 후 재계산 기준을 설명하기 어렵다.

### 방향

`FactoryWageHistory` 같은 월 기준 이력 테이블을 만든다.

예상 필드:

- `factoryId`
- `effectiveMonth`
- `targetMonthlyWage`
- `wagePerSecond`
- `createdAt`
- `createdBy`

작업기록에는 계산 당시 스냅샷을 계속 남긴다.

---

## 6. 출퇴근 단측 입력

상태: 반영됨, 검증 필요

현재 규칙:

- `clockIn`만 있으면 `18:00` 퇴근으로 계산
- `clockOut`만 있으면 `08:00` 출근으로 계산
- 둘 다 없으면 근무시간 없음

확인 파일:

- `backend/src/index.ts`
- `frontend/src/pages/App/attendance/AttendanceBoard.jsx`

---

## 7. 삭제 후보

상태: 대기

### 이미 제거 방향이 맞는 항목

- `Style.unitPriceUsd`

### 삭제 전 참조 제거가 필요한 항목

- 색상/성별 계열 컬럼
- `employee.lineName`의 역사 집계 의존
- 조직 단위 공임 필드가 실제로 더 이상 쓰이지 않는지 확인 필요

---

## 진행 순서

1. 작업기록 정규 참조와 실제 생산 계산 진단 정리
2. 4월 이전 자료 숨김
3. 색상/성별 참조 제거 여부 결정 및 정리
4. 라인명 역사 집계 의존 제거
5. 공장 공임 월 이력 설계/구현
6. 남은 null 컬럼 삭제 검토

현재는 1번부터 진행한다.
