# BARO Agent Guide (Current State)

> Last updated: 2026-05-06  
> Source of truth: this repository code (`frontend`, `backend`, `docs`, `scripts`)

## 1) 문서 목적

이 문서는 BARO 앱의 현재 구현 상태를 한 번에 파악하기 위한 운영/개발 기준 문서다.

- 대상: 신규 개발자, 유지보수 담당자, 기능 기획자
- 범위: 프론트엔드, 백엔드 API, 데이터 모델, 권한 체계, 운영/배포, 테스트
- 원칙: 코드 기준 사실만 기록하고, 미구현/프로토타입 상태를 명확히 구분한다

---

## 2) 현재 상태 요약

### 전체 스냅샷

- 아키텍처: `React + Vite` 프론트엔드 + `Express + Prisma` 백엔드 + `Supabase Auth/Postgres`
- 저장소 구조: 단일 레포에서 `frontend`와 `backend`를 분리 운영
- 인증 방식: Supabase OAuth(Session) + 백엔드 `x-user-email`, `x-org-id` 컨텍스트
- 핵심 도메인: 조직/멤버십, 공장/라인, 주문/스타일, 배정, 작업기록, 출퇴근, 급여
- 운영 안정성 장치: `/health`, `/ready`, 부트스트랩 재시도, DB 재시도, 스냅샷 기반 급여 확정

### 기능 상태 분류

| 영역 | 상태 | 요약 |
|---|---|---|
| 로그인/권한/온보딩 | 운영 가능 | `/auth/context`, 시스템관리자/조직사용자/온보딩 분기 구현 |
| 조직/멤버십/구독 | 운영 가능 | 조직 생성/수정, 구독 상태 관리, 온보딩 승인/거절 흐름 구현 |
| 주문/스타일/고객 | 운영 가능 | 목록/상세/생성/수정/삭제 및 스타일-공정 데이터 연결 구현 |
| 라인/작업자 배치 | 운영 가능 | 라인 CRUD, 작업자 배정/해제, 라인장 지정, 배치 저장 구현 |
| 배정 보드 | 운영 가능(고도화) | 드래그앤드롭, CT 스냅샷, 버전 충돌 처리, 상세 패널 구현 |
| 생산계획 보드 | 코드상 구현됨 | 페이지 구현은 큼. 다만 사이드바 메뉴는 비활성화 |
| 작업기록(일/월) | 운영 가능 | 작업로그 CRUD, 월간 집계, 상세 진입 구현 |
| 출퇴근 | 운영 가능 | 일별 입력 + 월간 목록 + 파일 업로드 반영 구현 |
| 급여 | 운영 가능 | 월 계산, 수기 가감, 잠금 스냅샷, 잠금 해제(관리자) 구현 |
| 재고 | 프로토타입 | `InventoryBoard`는 샘플 상태 기반 UI 시안 수준 |
| 표준공임 검토(ST Review) | 플레이스홀더 | 화면 뼈대/설명만 있고 로직 미완 |
| 출고 검토(Shipment Review) | 플레이스홀더 | 화면 뼈대/설명만 있고 로직 미완 |
| 권한 관리 페이지 | 플레이스홀더 | 페이지 뼈대만 존재 |
| 생산실적 | 플레이스홀더 | 타이틀 수준의 최소 화면 |
| 대시보드 | 초기 템플릿 | 위젯 슬롯/요약 자리만 존재 |
| 휴일 관리 | 로컬 저장 | 브라우저 localStorage 기반, 서버 영속화 없음 |

---

## 3) 저장소 구조

```text
baro/
├─ frontend/   # React + Vite UI
├─ backend/    # Express + Prisma API
├─ docs/       # 배포/테스트 기준 문서
├─ scripts/    # 회귀 테스트 및 유틸
├─ agent.md
├─ package.json
└─ README.md
```

루트 스크립트 핵심:

- `npm run dev`: 프론트/백엔드 동시 실행
- `npm run initialize`: 백엔드 기준 초기화
- `npm run reset:baseline`: 테스트 기준 상태 리셋
- `npm run sample:work-logs`, `npm run sample:orders`
- `npm run test:regression`: 수량 변경 + 시간/날짜 회귀 테스트

---

## 4) 기술 스택

### 프론트엔드

- React 19, React Router 7
- Vite 7
- MUI 7
- Drag & Drop: `@dnd-kit/core`, `@hello-pangea/dnd`
- 상태/컨텍스트: `AuthContext`, `AppContext`, `LanguageContext`
- 데이터 호출: 공통 `requestJSON` 래퍼(캐시, 요청 스코프, 로딩 추적)

### 백엔드

- Express 5 (TypeScript)
- Prisma 6 + PostgreSQL
- dotenv
- 주요 설계: 대형 `index.ts` + 일부 도메인 라우터 모듈 분리

### 인증/인프라

- Supabase Auth (Google OAuth)
- Railway 배포 구조(프론트/백 분리 서비스)

---

## 5) 프론트엔드 아키텍처

## 5.1 라우팅/진입

핵심 라우팅 파일: `frontend/src/router.jsx`

- 공개 라우트: `/login`, `/signup`, `/auth/callback`, `/onboarding`, `/subscription-required`
- 보호 라우트: `ProtectedRoute`를 통해 접근 제한
- 앱 주요 경로:
  - `/workspace`
  - `/business`, `/employee`, `/permission`
  - `/system-setting`, `/system-setting/static-options`, `/system-onboarding`
  - `/customer`, `/order`
  - `/style`, `/style/new`, `/style/:styleId`
  - `/assignment`, `/assignment/new`, `/assignment/:assignmentId`
  - `/work-history`, `/work-history/new`, `/work-history/:workLogId`
  - `/work-history-monthly`, `/work-history-monthly/:monthKey/:factoryId/:workerId`
  - `/attendance`, `/attendance/new`, `/attendance/:factoryId/:workDate`
  - `/payroll`, `/payroll/new`, `/payroll/:payrollId`
  - `/attribute/*`, `/line`, `/holiday`, `/profile`
  - `/production-plan`, `/production-result`, `/inventory`, `/st-review`, `/shipment-review`

## 5.2 레이아웃/탭/요청 스코프

`MainLayout` 핵심:

- 좌측 메뉴 + 헤더 + 워크스페이스 탭(keep-alive)
- 탭별 네트워크 로딩 표시
- 미저장 변경 감지 + 탭 닫기/이동 보호
- 요청 취소(`cancelAllTrackedRequests`)를 이용한 화면 전환 안정화

사이드바에서 명시적으로 비활성화된 메뉴:

- `/production-plan`
- `/st-review`
- `/shipment-review`
- `/inventory`
- `/production-result`

## 5.3 인증 컨텍스트

`AuthContext`:

- Supabase 세션 조회/갱신
- `/auth/context` 호출로 백엔드 권한 프로필 확보
- `entryType` 분기: `SYSTEM` / `ORG` / `ONBOARDING`
- Dev bypass 모드 존재 (세션 스토리지 키 사용)
- `setRequestContext`로 API 헤더 컨텍스트 자동 주입

## 5.4 API 클라이언트 공통 계층

`frontend/src/utils/apiClient.js`:

- `x-user-email`, `x-org-id` 헤더 자동 부착
- GET 응답 캐시(TTL 기본 45초) + 중복 요청 합치기
- mutation 후 경로 단위 캐시 무효화
- 요청 타임아웃/취소 처리
- 글로벌 로딩 상태 및 scope 기반 스케줄링

## 5.5 이벤트 기반 화면 동기화

`workspaceDataEvents` + `useWorkspaceRefreshOnEvent`:

- 브라우저 `CustomEvent` 기반 페이지간 갱신 신호 전달
- `styles`, `orders`, `assignment-board` 토픽 단위 갱신

중요 제한:

- 서버 push(WebSocket/SSE) 기반 실시간 동기화는 현재 없음
- 즉, "다른 사용자"의 변경은 polling/재조회 시점에 반영된다

## 5.6 다국어

- 지원 언어: `ko`, `en`, `vi`
- 언어 선택 상태 로컬 저장
- `uiMessages`, `staticOptionRegistry`로 텍스트 중앙 관리

---

## 6) 백엔드 아키텍처

## 6.1 앱 부트스트랩/헬스체크

핵심 엔드포인트:

- `GET /health`: 프로세스 상태 + `ready` 여부
- `GET /ready`: 준비 완료 전 `503` 반환

시작 전략:

- 서버 리슨 후 백그라운드 부트스트랩 수행
- DB 연결 실패 시 재시도
  - `STARTUP_DB_MAX_RETRIES` (기본 5)
  - `STARTUP_DB_RETRY_DELAY_MS` (기본 1500ms)
- 부트스트랩 실패 시 재시도
  - `STARTUP_BOOTSTRAP_RETRY_DELAY_MS` (기본 5000ms)

## 6.2 도메인 라우팅 구성

`backend/src/index.ts` + 모듈 라우터 혼합 구조.

모듈 라우터:

- organizations
- org-memberships
- employees
- factories
- lines
- payroll

인덱스 직접 라우트(핵심):

- 인증/온보딩: `/auth/context`, `/onboarding/company-requests`, `/system/*`
- 배정: `/assignment-plans`, `/assignment-board-view`, `/assignment-board-state`, `/assignment-cards`
- 출퇴근/기록: `/attendance-entries`, `/work-logs`
- 영업/기준정보: `/customers`, `/orders`, `/styles`, `/styles/import`, `/attributes`, `/process-master-options`
- 동기화: `/at-sync/run-now`

## 6.3 접근제어/구독제어

`middleware/access.ts`:

- 요청자 이메일과 조직 컨텍스트 해석
- 시스템관리자/조직멤버십 권한 판별
- 구독 상태(`TRIAL`, `ACTIVE`, `GRACE`) 기반 워크스페이스 접근 제어
- 조직 접근 캐시 + in-flight 공유

## 6.4 감사 필드 자동화

`backend/src/db.ts` + `requestActor.ts`:

- `AsyncLocalStorage`로 요청 주체(actor) 추적
- Prisma extension으로 `createdBy`, `updatedBy` 자동 주입
- 기본 actor fallback: `system@baro.local`

---

## 7) 데이터 모델(Prisma) 개요

핵심 모델:

- 사용자/조직: `SystemUser`, `Organization`, `OrgMembership`, `OnboardingRequest`, `OrganizationSubscription`
- 인사/라인: `Employee`, `Factory`, `Line`, `LineAssignment`, `AttendanceEntry`
- 기준정보: `AttrColor`, `AttrCategory`, `AttrRole`, `AttrProcess`, `ProcessMasterOption`, `ProcessMasterOptionRelation`
- 스타일/시간: `Style`, `StyleProcess`, `StyleProcessStandard`, `AtTrainingBucket`, `AtTrainingBucketProcess`
- 주문/생산: `WorkOrder`, `WorkOrderItem`, `AssignmentCard`, `AssignmentPlan`, `AssignmentBoardState`
- 작업/급여: `WorkLog`, `WorkRecord`, `PayrollSnapshot`

핵심 enum:

- `OrganizationType`, `OrgUserRole`, `OrgMembershipStatus`
- `OrganizationSubscriptionStatus`
- `WorkOrderStatus`, `WorkOrderConfirmationStatus`
- `WorkOrderItemGender`, `SystemRole`, `ProcessMasterOptionType`

---

## 8) 기능별 상세 상태

## 8.1 인증/온보딩/구독

- `AuthContext` + `/auth/context`로 첫 진입 시 권한 프로필 확정
- 멤버십 없는 계정은 `ONBOARDING` 엔트리 타입으로 분기
- 시스템관리자가 온보딩 요청 승인 시:
  - 조직 생성
  - 구독 상태 설정
  - 요청자 `ADMIN` 멤버십 자동 부여

## 8.2 조직/시스템 설정

- 조직 목록/생성/수정 가능
- 구독 상태 편집(`NOT_SUBSCRIBED/TRIAL/ACTIVE/GRACE/SUSPENDED`) 가능
- 정적 사전(코드 테이블) 조회 UI 존재

## 8.3 고객/주문/스타일

- 고객 CRUD 구현
- 주문:
  - 목록/상세 편집
  - 품목/컬러/사이즈/성별 구성
  - 주문 수정 잠금(`modification-lock`) 지원
  - 배정보드 상태와 연동된 수량 변경 처리
- 스타일:
  - 목록/상세/삭제/추가
  - 공정별 PT/AT/ST 지표 사용
  - `AT 갱신` 수동 트리거 지원

## 8.4 라인/배정

- 라인 보드:
  - 라인 추가/수정/삭제
  - 작업자 드래그 배치
  - 라인장 지정
  - 일괄 저장(`/lines/batch-save`)
- 배정 보드:
  - 미배정 카드/라인 타임라인 DnD
  - CT/ST 입력 및 스냅샷 저장
  - 버전 충돌(409) 처리
  - 상세 패널에서 공정 단위 비용/시간 확인

## 8.5 생산계획/생산관리 보드

- `ProductionPlanBoard`는 코드상 고도화된 구현이 존재
- 다만 현재 메인 메뉴에서는 비활성화되어 사용자 노출을 제한
- `ProductionResultBoard`는 최소 화면(플레이스홀더)

## 8.6 작업기록(일/월)

- 일일 기록:
  - 작업로그 CRUD
  - 공장/라인/작업자/공정 기준 집계
- 월간 기록:
  - 월 단위 작업자 집계
  - 출퇴근/휴일 반영한 월간 지표 계산
  - 월간 상세 페이지 진입 지원

## 8.7 출퇴근

- 월간 목록 + 일별 상세 입력
- 파일 업로드(CSV/XLSX) 파싱 및 병합 입력
- `attendance-entries` API로 저장/조회

## 8.8 급여

- 월 계산 화면:
  - CT/FIXED 급여 타입 동시 처리
  - 보너스/공제 입력
  - 공정별 근거(수량, CT초, 단가) 표시
- 잠금 스냅샷:
  - `POST /payroll/lock`로 월 확정
  - 확정 후 수정 방지
  - 관리자만 잠금 해제 가능

## 8.9 속성(Attribute)

- 컬러/카테고리/공정 속성 관리 구현
- `processManagementEnabled` 플래그가 `false`
- 일반 조직 사용자의 공정 마스터 관리 경로는 차단
- 시스템관리자만 확장 관리 경로 접근 가능

## 8.10 휴일

- 휴일 캘린더 UI 구현
- 저장소는 `localStorage` 기반(`baro_holidays_v1`)
- 서버 DB 영속화는 아직 없음

## 8.11 플레이스홀더/시안 페이지

- `Permission`
- `AssignDetail`
- `LineDetail`
- `StReview`
- `ShipmentReview`
- `ProductionResultBoard`
- `WorkspaceDashboard` (요약 슬롯 템플릿)
- `InventoryBoard` (샘플 상태 기반 UI 시안)

---

## 9) 핵심 API 맵

조직/멤버십:

- `GET/POST /organizations`
- `PUT /organizations/:id`
- `GET/PATCH /organizations/:id/subscription`
- `GET/POST /org-memberships`
- `POST /org-memberships/apply`
- `PATCH /org-memberships/:id/approve|reject|...`
- `POST /org-memberships/assign`

인사/공장/라인:

- `GET/PATCH /employees/me`
- `GET/POST /employees`
- `GET/POST/PUT/DELETE /factories...`
- `GET/POST/PATCH/DELETE /lines...`
- `POST /line-assignments/assign|unassign`

영업/생산기준:

- `GET/POST/PUT/DELETE /customers...`
- `GET/POST/PUT/DELETE /orders...`
- `POST /orders/:orderId/modification-lock`
- `GET/POST/PUT/DELETE /styles...`
- `POST /styles/import`
- `GET/PUT /attributes`
- `POST /attributes/colors`
- `GET/PUT /process-master-options`

배정/기록/출퇴근:

- `GET /assignment-plans`
- `PATCH /assignment-plans/:externalId/complete|reopen`
- `GET /assignment-board-view`
- `GET /assignment-board-versions`
- `GET /assignment-cards`
- `GET/PUT/DELETE /assignment-board-state...`
- `GET/POST/PUT/DELETE /work-logs...`
- `GET/PUT /attendance-entries`

급여:

- `GET /payroll`
- `GET /payroll/snapshots`
- `POST /payroll/lock`
- `DELETE /payroll/snapshots/:month`

시스템/온보딩:

- `GET /system/onboarding-requests`
- `PATCH /system/company-requests/:id/approve|reject`

동기화:

- `POST /at-sync/run-now`

---

## 10) 운영/환경 변수

프론트 `.env` 핵심:

- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_CANONICAL_ORIGIN`
- `VITE_ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT`
- `VITE_APP_VERSION`

백엔드 `.env` 핵심:

- `DATABASE_URL`
- `DIRECT_URL`
- `PORT`
- `BUSINESS_TIME_ZONE`
- `WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER`

백엔드 코드 기본 보정:

- `DIRECT_URL ||= DATABASE_URL`
- `DATABASE_URL ||= DIRECT_URL`
- `PRISMA_CLIENT_ENGINE_TYPE ||= "binary"`

---

## 11) 테스트/기준 데이터

기준 문서:

- `docs/test-initial-state.md`
- Baseline ID: `test-baseline-v1.9`
- Captured on: `2026-03-10`

핵심 규칙:

- 테스트 리셋 단일 진입점: `backend/scripts/reset-to-baseline.js`
- 시스템 관리자 계정 보존
- 워커/라인/스타일/구독 기본 상태를 명시 기준으로 재생성

회귀 테스트 명령:

- `npm run test:quantity-change`
- `npm run test:time-date`
- `npm run test:regression`

---

## 12) 배포 구조

권장 배포:

- Railway `backend` 서비스 1개 (`/backend`)
- Railway `frontend` 서비스 1개 (`/frontend`)
- DB/Auth는 Supabase

헬스체크:

- backend: `/health`
- frontend: `/health`

프론트 배포 서버:

- `frontend/server.js`에서 정적 파일 제공 + SPA fallback 처리

---

## 13) 현재 리스크와 기술 부채

1. 백엔드 단일 파일 비대화
- `backend/src/index.ts`가 매우 커서 도메인 경계가 흐려지고 회귀 위험이 높다.

2. 실시간 동기화 부재
- 현재는 브라우저 로컬 이벤트 중심이며, 다중 사용자 동시 편집에 대한 서버 push 동기화가 없다.

3. 기능 공개 상태 불일치
- 일부 화면은 구현되어도 메뉴에서 비활성화 상태다(릴리스 정책 불명확 시 혼란 가능).

4. 플레이스홀더 다수
- 권한, 검토, 생산실적, 일부 상세 화면은 실제 운영 로직이 미완성이다.

5. 로컬 저장 의존 기능
- 휴일 관리가 localStorage 기반이라 계정/기기 간 일관성이 없다.

6. 인코딩 관리 주의
- 일부 파일은 한글 텍스트 관리 방식 점검이 필요하다(에디터/터미널 인코딩 정책 통일 권장).

---

## 14) 우선 개선 제안

1. 백엔드 라우트 분해
- `index.ts`에서 주문/배정/기록/속성/시스템 라우트를 모듈로 분리해 변경 영향 범위를 축소한다.

2. 협업 동기화 계층 추가
- 최소한 배정/주문/작업기록 도메인에 서버 이벤트(SSE/WebSocket) 혹은 짧은 polling 표준을 추가한다.

3. 상태 레벨 표준화
- "운영", "부분", "시안", "비활성" 레이블을 메뉴/문서/릴리즈 노트에서 동일하게 사용한다.

4. 로컬 데이터 서버 이관
- 휴일/임시 기준 데이터는 조직 단위 서버 저장으로 전환해 일관성을 확보한다.

5. 플레이스홀더 정리
- 실제 출시 대상이 아닌 화면은 숨기거나 `feature flag`로 완전히 격리한다.

---

## 15) 유지보수 체크리스트

기능 변경 시 최소 확인:

- 권한: `SYSTEM / ORG / ONBOARDING` 분기 영향
- 구독 상태: `TRIAL/ACTIVE/GRACE/SUSPENDED` 접근 영향
- 캐시: `apiClient` 무효화 맵 반영 여부
- 다국어: `ko/en/vi` UI 메시지 누락 여부
- 데이터: Prisma schema/마이그레이션/리셋 스크립트 동기화
- 회귀: `test:regression` 통과 여부
- 문서: `agent.md`, `docs/test-initial-state.md` 업데이트 여부

---

## 16) 결론

BARO는 핵심 운영 흐름(조직, 주문, 스타일, 라인, 배정, 작업기록, 출퇴근, 급여)은 이미 실사용 가능한 수준으로 구현되어 있다. 다만 일부 메뉴는 공개 보류 상태이거나 시안/플레이스홀더이고, 실시간 협업 동기화 및 백엔드 구조 분해가 다음 단계의 핵심 과제다.
