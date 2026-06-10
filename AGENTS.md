# BARO 프로젝트 컨텍스트

> 이 파일은 Claude Code, Codex 등 모든 AI 도구의 단일 진입점이다.  
> 내용을 수정할 때는 이 파일 하나만 수정한다.

봉제 공장 생산 관리 SaaS. 핵심 기능: **AT 추정** + **스케줄러**.

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
- `AssignmentPlan.stTotalSeconds`: 배정 카드 전체의 계획 ST 총초. 스케줄러 길이 계산 전용이다. 과거 `totalSeconds`/`stSeconds` 카드 총합 명칭을 대체한다.
- `AssignmentPlan.ctTotalSeconds`: 배정 카드 전체의 계약 CT 총초. 급여/계약 기준 전용이며 스케줄러 길이 계산에 사용 금지.
- `WorkRecord.ctSeconds`: 작업기록 상세 행의 급여 계산용 CT. 진행률/스케줄 실제 기간 계산에서 ST처럼 쓰면 안 된다.
- `WorkLog.totalCtSeconds`: 작업기록 헤더의 CT 합계. 작업기록 목록/요약과 급여 참고용이며 스케줄러 길이 계산에 사용 금지.
- `AtTrainingBucket.laborInputSeconds`: AT 학습용 실제/대체 투입 노동 시간 합이다. 스케줄러 계획 시간이나 계약 시간과 섞으면 안 된다.
- 같은 의미는 같은 단어를 쓴다. 공정 단위는 `stSeconds`/`ctSeconds`, 배정카드 총합은 `stTotalSeconds`/`ctTotalSeconds`, AT 투입 노동 시간은 `laborInputSeconds`.
- 신규 코드에서 `contractedSeconds`나 도메인 필드명 `totalSeconds`를 추가하지 않는다. `totalSeconds`는 화면 포맷팅 같은 일반 지역 변수에만 허용한다.

### AT 모델
```
AT(q) = a*q + b
  a = 장당 한계시간(초/장)
  b = 셋업 고정시간(초, 수량 무관)
```
수량이 많아질수록 장당 시간이 `a`에 수렴. AT 목적: 충분한 데이터 축적 후 CT/ST 조정 참고용.

---

## 데이터 구조 핵심

### WorkLog / WorkRecord
- **WorkLog**: 기간 헤더. `coverageStartDate`(시작), `coverageEndDate`(종료)가 소스오브트루스.
  - `displayDate` (DB 컬럼명 `workDate`, Prisma `@map("workDate")`): 목록 표시/정렬 전용 대표 날짜. 항상 `coverageEndDate`와 동일. **계산 로직 사용 금지.**
  - `lineId`가 스키마 FK 없이 `records` JSON 안에 비정규화 저장됨 (DB 조인 불가 — 구조적 한계).
- **WorkRecord**: WorkLog 하위 상세 행. 한 행 = `(작업자, 스타일, 공정, 색상, 수량, ctSeconds)`.
  - `ctSeconds`는 해당 작업 상세의 급여/계약 기준 시간이다. 스케줄러 계획 길이의 기준은 아니다.
  - `lineId Int?` 컬럼은 실제로 존재하지만 FK는 없다. `Line` 테이블과 조인 가능한 정규화 관계가 아니라 비정규화 보조 필드다.
  - 같은 작업자가 같은 기간(또는 같은 날) 여러 공정 입력 가능.
  - 스케줄러 연결의 핵심 키는 `WorkRecord.assignmentPlanId`.
  - 신규 WorkLog 저장/수정에서는 모든 WorkRecord가 `assignmentPlanId`를 가져야 한다. 연결 없는 작업행은 백엔드에서도 거부한다.
- **급여 계산용**: 공정별로 몇 개 만들었는지 집계. 주문 100장이어도 실제로는 95장 또는 105장 만들 수 있음.

### WorkLog 날짜 규칙 (강제)
- 계산/판정 로직(스케줄러, 진행도, 완료일 추정)에서는 항상 기간 `[coverageStartDate, coverageEndDate]`를 기준으로 해석한다.
- `displayDate`는 UI 목록 표시/정렬 용도로만 사용한다. 계산 로직의 기준 날짜로 절대 사용하지 않는다.
- `coverageEndDate || displayDate` 형태의 fallback 브릿지 로직은 신규 코드에 추가하지 않는다.
- 기간 입력(`coverageStartDate !== coverageEndDate`)은 절대 하루치로 뭉개지면 안 된다.
- WorkRecord가 AssignmentPlan과 연결되지 않으면(`assignmentPlanId` 없음) 기간이 정확해도 스케줄러/진행도 반영이 불가능하다.
- 작업기록이 이미 연결된 AssignmentPlan은 배정 해제/삭제로 orphan WorkRecord를 만들 수 없다. 연결된 작업기록이 있으면 해당 assignment 제거를 거부한다.

### AssignmentPlan (스케줄 카드)
- 단위: 기본 `주문 × 스타일` (색상/사이즈 단위 미구현)
- `stTotalSeconds`: 스케줄러 계획 길이 계산에 쓰는 배정카드 전체 ST 총초. 과거 `totalSeconds`/`stSeconds` 카드 총합 명칭을 대체.
- `ctTotalSeconds`: 급여/계약 계산에 쓰는 배정카드 전체 CT 총초. 과거 `contractedSeconds` 명칭을 대체하며 스케줄러 길이 계산에 사용 금지.
- `assignmentCtSnapshot`: assignment 저장 시점의 CT 스냅샷 JSON. `processes[].snapshotCtSeconds`와 `processes[].pieceCtSeconds`는 급여/계약 CT 기준이며, snapshot 안에 ST 복사본을 저장하지 않는다.
- `isCompleted / finalQuantity / completedAt`: 생산 완료 확정 결과 (`PATCH /assignment-plans/:externalId/production-complete`)
- `closedQty / closedAt / closedBy / closeMode / closeBasis`: 제작 완료 확정 상태 스냅샷 (구 `/close` 경로와 신규 `/production-complete` 공통 반영)

### ⚠️ DB 적용 메모
- 모든 스키마/데이터 변경은 `backend/migration_fix.sql`로 관리. `backend/railway.json`의 `deploy.preDeployCommand`가 `npm run railway:predeploy`를 실행하도록 설정되어 있어야 하며, 배포 로그에서 migration 실행 여부를 확인한다.
- rename 필수 컬럼(`StyleProcess.timesPerPiece`, `StyleProcessStandard.bucketQuantity/bucketStSeconds`, `AssignmentPlan.assignment*`)이 운영 DB에 없으면 백엔드 시작 시 `migration_fix.sql`을 먼저 적용하고 나서 traffic을 받는다. 비상 시 `STARTUP_APPLY_MIGRATION_FIX_ON_SCHEMA_DRIFT=false`로 자동 적용을 끌 수 있다.
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
3. BatchProgress.jsx(handleConfirmClose): PATCH /assignment-plans/:externalId/production-complete 호출
4. 백엔드 completeAssignmentPlanProduction: production completed 상태 확정 + 일정/진행도 스냅샷 동기화
5. 완료 시: isCompleted=true, completedAt/productionCompletedAt/closedQty 갱신
```

### Task 1 관련 상태
- 기존 `/assignment-plans/:externalId/complete` 기반 QC hard block 시나리오는 현재 코드 경로에서 사용되지 않음.
- 현재 완료 경로(`/assignment-plans/:externalId/production-complete` → `completeAssignmentPlanProduction`)에는 `producedQuantity < finalQuantity` 하드 블록이 없음.
- `QcReview.jsx`는 검수 이력(`qc-pass-events`) 전용이며, 생산 완료 확정은 `BatchProgress.jsx`에서 수행.

---

## 스케줄러 로직 분석 결과

### 이미 구현돼 있는 것
- **미배정 카드 표시**: `buildCardsFromOrders`가 주문의 모든 카드를 생성. 미배정 카드는 보드 풀(pool)에 남아 있어 눈으로 확인 가능.
- **생산 완료 반영**: `completeAssignmentPlanProduction`이 `syncAssignmentSchedulesFromWorkRecordPlans` 및 `persistAssignmentPlanProgressSnapshot`을 호출해 완료 상태와 일정 정보를 갱신.
- **라인 균형**: 시각적으로 보드에서 확인 가능 (별도 지표 불필요).
- **`progressPercent` 필드**: `/assignment-plan-progress` 응답에 포함되며, 현재는 `sum(WorkRecord.quantity) / (planQuantity × processCount)` 공식으로 계산.
- **작업기록 총량 집계**: 진행도 계산 함수(`buildAssignmentPlanProgressRows`)에서 plan별 총 작업량 집계가 가능.
- **라인-월 capacity 보드**: `AssignBoard.jsx` 기본 뷰는 line-month capacity summary이며, 계획 ST는 현재 보드 assignment를 기준으로 월별 분배하고 실제 산출은 `/line-month-capacity`가 WorkLog 기간과 WorkRecord를 기준으로 집계한다.
- **rolling forecast 기준**: line-month 보드의 forecast load/carry는 저장된 예전 assignment range가 아니라 **현재 보드의 미완료 assignment queue**와 `remainingStTotalSeconds`를 기준으로 다시 계산한다. 따라서 현재 보드에서 라인 queue가 0건이면 forecast load도 0이어야 한다.
- **forecast anchor 규칙**: line-level forecast 시작점은 `nextWorkingDay(lastActualCoverageEndDateKey)`다. 아직 actual WorkLog가 하나도 없으면 fallback은 `today` 또는 그 다음 working day다. 기본 working day는 월~토, 일요일과 휴일관리 날짜만 제외한다.
- **anchor month 의미**: actual이 있는 과거 month는 history다. anchor month와 미래 month는 현재 남은 backlog를 앞으로 capacity에 fill-forward 한 rolling forecast다. 6월 capacity를 먼저 채우고 초과분은 7월, 다시 초과하면 8월로 carry한다.
- **anchor month 퍼센트 규칙**: anchor month의 `forecast load percent` 분모는 그 달 전체 capacity가 아니라 **anchor 이후 남은 forecastAvailableCapacitySeconds**다. 예: `2026-06-10~2026-06-30` 구간을 꽉 채우면 6월 cell은 `100%`로 보이고, 보조 문구로 `2026-06-10~2026-06-30` 범위를 함께 보여준다.
- **UI 최소 정보 원칙**: 라인 요약 행은 `라인명`, `인원`, `배정 작업 수(완료 제외)`, `완료 예상 시점`만 우선 표시한다. 월 cell의 carry는 시간(hours)이 아니라 **다음으로 넘어가는 날짜**로 표시한다.
- **세로형 drag/drop 작업 목록**: 라인 대기 작업과 미배정 작업은 각각 `카드 1개 = 전체폭 1행`으로 세로 스택한다. 카드에는 이미지, 고객사, 주문번호, 스타일, 수량, 진행도를 우선 표시한다.
- **배정 취소 전용 drop zone**: 운영 화면은 `라인 용량`, `배정 취소`, `미배정 작업`의 3개 섹션으로 구성한다. 배정 카드는 `배정 취소` 영역에 명시적으로 drop한 경우에만 미배정으로 돌아가며, 작업기록이 연결된 assignment는 취소할 수 없다.
- 라인 대기 작업 사이의 순서 변경 drop slot은 평소 `+` 박스를 노출하지 않고 얇은 여백으로 유지하며, drag over 상태에서만 삽입선을 강조한다. 배정 취소 영역은 별도 섹션 제목 없이 drop 안내 박스만 표시한다.
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
| 1 | WorkLog에 lineId FK 없음, WorkRecord.lineId도 FK 없음 | `backend/prisma/schema.prisma` | 라인별 조인/정합성 분석 제약 |
| 2 | 재배치 로직이 프론트에 있음 | `frontend/src/pages/App/assign/AssignBoard.jsx` | 서버 이벤트에 자동 반응 불가 |
| 3 | 소스오브트루스 이중화 | 여러 곳 | WorkLog.records vs WorkRecord, ctSnapshot 등 |
| 4 | 실행 엔티티 부재 | — | 시작/중단/완료 이벤트 모델 없음 |

---

## 현재 상황 (2026-05)

- 4월 데이터 최초 입력 중 (4월 30일에 한달치 일괄 입력)
- 출퇴근 데이터는 이미 입력 완료 → AT 학습 필터 통과 가능
- AT 신뢰도는 낮게 시작하지만 누적될수록 개선되는 것이 목표
- 병렬 생산(라인에서 A+B 동시 작업)은 AT 추정에 문제 없음. 스케줄은 순차 계획이지만 현실은 병렬.

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
- 운영 데이터베이스는 Railway Postgres 서비스다. Supabase Table Editor에서 데이터가 비어 보여도 운영 DB 기준이 아니다.

---

## 프론트엔드 아키텍처

### 라우팅 (`frontend/src/router.jsx`)
보호 라우트: `ProtectedRoute` 사용. 주요 경로:
- `/workspace`, `/assignment`, `/work-history`, `/work-history-monthly`
- `/attendance`, `/payroll`, `/style`, `/order`, `/customer`
- `/line`, `/business`, `/employee`, `/profile`, `/holiday`
- 비활성화(메뉴에서 숨김): `/production-plan`, `/st-review`, `/shipment-review`, `/inventory`, `/production-result`

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
| 주문/스타일 | `GET/POST/PUT/DELETE /orders`, `GET/POST/PUT/DELETE /styles`, `POST /styles/import` |
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
- `WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER`
- 코드 기본 보정: `DIRECT_URL ||= DATABASE_URL`, `PRISMA_CLIENT_ENGINE_TYPE ||= "binary"`

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
| 생산실적 / 대시보드 | 플레이스홀더 |
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

### 회귀 테스트
```
npm run test:quantity-change
npm run test:time-date
npm run test:regression
```

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
4. 플레이스홀더 다수 — 권한, 검토, 생산실적 화면 미완성

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
- 구 생산 현황 경로 `/production-result`는 재설계 전까지 비활성화하고 워크스페이스로 리다이렉트한다.

### 28. 2026-06-05 Auto Completion Phase 2 Payroll Lock

- 급여 잠금은 assignment 카드별 완료 월 기준으로 판정한다.
- 완료 월은 `AssignmentPlan.productionCompletedAt`를 우선 사용하고, 없으면 `closedAt/completedAt`로 fallback한다.
- 그 완료 월에 `PayrollSnapshot`이 이미 있으면 해당 assignment는 payroll-locked 상태로 본다.
- payroll-locked assignment는 WorkLog 생성/수정/삭제로 변경할 수 없다.
- payroll-locked 상태의 auto-completed assignment는 이후 작업기록 합계가 줄어도 자동 롤백하지 않는다.
- payroll-locked assignment는 `/assignment-plans/:externalId/production-complete`로 수동 재확정할 수 없다.
- progress row는 `isPayrollLocked`, `payrollLockMonth`를 노출할 수 있고, UI는 이 값을 경고/버튼 차단에 사용한다.
- 이 잠금 규칙은 이후 시스템 관리자용 비상 복구 기능과 별개다.

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
