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
- **ST (`stSeconds`)**: 공정 1개를 1장 만들 때의 표준 제작 시간. 스케줄러 예상 기간, 배정 카드 길이, 계획 소요 시간 계산의 기준이다.
- **CT (`ctSeconds`)**: 공정 1개를 1장 만들 때의 계약/급여 기준 시간. 배정 카드에서 수정할 수 있지만, 스케줄러 길이 계산에 사용하면 안 된다.
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
  - 같은 작업자가 같은 기간(또는 같은 날) 여러 공정 입력 가능.
  - 스케줄러 연결의 핵심 키는 `WorkRecord.assignmentPlanId`.
- **급여 계산용**: 공정별로 몇 개 만들었는지 집계. 주문 100장이어도 실제로는 95장 또는 105장 만들 수 있음.

### WorkLog 날짜 규칙 (강제)
- 계산/판정 로직(스케줄러, 진행도, 완료일 추정)에서는 항상 기간 `[coverageStartDate, coverageEndDate]`를 기준으로 해석한다.
- `displayDate`는 UI 목록 표시/정렬 용도로만 사용한다. 계산 로직의 기준 날짜로 절대 사용하지 않는다.
- `coverageEndDate || displayDate` 형태의 fallback 브릿지 로직은 신규 코드에 추가하지 않는다.
- 기간 입력(`coverageStartDate !== coverageEndDate`)은 절대 하루치로 뭉개지면 안 된다.
- WorkRecord가 AssignmentPlan과 연결되지 않으면(`assignmentPlanId` 없음) 기간이 정확해도 스케줄러/진행도 반영이 불가능하다.

### AssignmentPlan (스케줄 카드)
- 단위: 기본 `주문 × 스타일` (색상/사이즈 단위 미구현)
- `stTotalSeconds`: 스케줄러 계획 길이 계산에 쓰는 배정카드 전체 ST 총초. 과거 `totalSeconds`/`stSeconds` 카드 총합 명칭을 대체.
- `ctTotalSeconds`: 급여/계약 계산에 쓰는 배정카드 전체 CT 총초. 과거 `contractedSeconds` 명칭을 대체하며 스케줄러 길이 계산에 사용 금지.
- `ctSnapshot`: 프론트에서 계산한 CT/ST 스냅샷 JSON 저장. `processes[].stSeconds`는 계획 ST, `processes[].ctSeconds`는 계약 CT.
- `isCompleted / finalQuantity / completedAt`: 생산 완료 확정 결과 (`PATCH /assignment-plans/:externalId/production-complete`)
- `closedQty / closedAt / closedBy / closeMode / closeBasis`: 제작 완료 확정 상태 스냅샷 (구 `/close` 경로와 신규 `/production-complete` 공통 반영)

### ⚠️ DB 적용 메모
- `AssignmentPlan`의 close 관련 컬럼(`closedQty`, `closedAt`, `closedBy`, `closeMode`, `closeBasis`)은 현재 **additive SQL**로 실DB에 반영됨.
- 시간 컬럼 리네임:
  - `AssignmentPlan.totalSeconds` 또는 카드 총합용 `AssignmentPlan.stSeconds` → `AssignmentPlan.stTotalSeconds`
  - `AssignmentPlan.contractedSeconds` → `AssignmentPlan.ctTotalSeconds`
  - `AtTrainingBucket.totalSeconds` → `AtTrainingBucket.laborInputSeconds`
  - `WorkLog.totalContractedSeconds` → `WorkLog.totalCtSeconds`
- 새 환경/운영 DB 반영 시 컬럼 rename SQL과 보드 JSON 키 이관(`totalSeconds`/`stSeconds` → `stTotalSeconds`, `contractedSeconds` → `ctTotalSeconds`)이 같이 적용되어야 함.
- 이유: Prisma migration history drift로 `prisma db push` / `migrate deploy`가 바로 통과하지 않음.
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
| 1 | WorkLog에 lineId FK 없음 | `backend/prisma/schema.prisma` | 라인별 분석 불가 |
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
| 배정 | `GET /assignment-plans`, `PATCH /assignment-plans/:externalId/production-complete`, `PATCH /assignment-plans/:externalId/final-quantity`, `GET /assignment-board-view`, `GET /assignment-cards` |
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
