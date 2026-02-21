# BARO - 봉제 생산관리 시스템 Agent 참조 문서

## 프로젝트 개요

봉제(縫製) 공장을 위한 B2B 생산관리 웹 애플리케이션.
수주자(봉제 공장, MANUFACTURER)와 발주자(브랜드, BRAND) 두 유형의 조직을 지원한다.

**스택**: React (Vite) + MUI / Node.js + Express 5 + Prisma + PostgreSQL + Supabase Auth

---

## 핵심 도메인 개념

### CT (Contracted Time) — 가장 중요한 개념
- **CT = 계약된 시간** (초/개 단위) — Cycle Time이 아님
- **PT(Planned Time)**: 스타일 등록 시 운영자가 감으로 입력하는 초기 계획 시간. AT 데이터가 없을 때 임시 CT 기준으로 쓰임
- **AT(Actual Time)**: 실제 WorkRecord 기반으로 자동 산출되는 값. 운영자가 직접 입력하지 않음. CT 결정 시 참고용으로만 사용
- **CT(Contracted Time)**: 스타일 공정 단위로 관리되는 공식 기준 시간. **버전이 있으며 명시적 검토·승인을 통해서만 변경됨**
- PT와 AT는 CT 결정을 위한 참고값일 뿐, **CT 확정 이후에는 PT/AT 변경과 완전히 무관**
- 확정된 CT는 급여 계산의 기준이 됨
- AssignmentPlan의 contractedSeconds: CT 합의 시 확정된 값 (이후 Style.processes 변경과 무관)

#### CT 협의 상태 흐름 (ctStatus)

```
PENDING (배정 후 초기 상태)
  │
  ├─ 라인장 "동의" ──────────────────────────────────────── AGREED
  │    ctAgreedBy='LINE_LEADER', ctSource=MANUAL
  │
  └─ 라인장 "CT 조정 요청" (제안 CT 입력 후) ──────────── REJECTED
       ctOverride=true, ctSource='LINE_LEADER_PROPOSAL'
       pendingCtProposal에 공정별 제안 CT 저장
         │
         ├─ 운영팀 "승인" ────────────────────────────────── AGREED
         │    ctAgreedBy='OPERATOR', ctSource='LINE_LEADER_PROPOSAL'
         │    contractedSeconds = 라인장 제안 CT
         │
         └─ 운영팀 "거부" ────────────────────────────────── 배정 삭제
              (assignments 배열에서 제거)
```

> ⚠️ 용어 주의: **라인장은 "거부"하지 않는다.** 라인장은 "동의" 또는 "CT 조정 요청"만 가능.
> "거부"는 운영팀이 라인장의 조정 요청을 기각할 때 사용하는 용어.

#### CT 협의 UI 버튼 규칙 (ProductionPlanBoard)
- **동의 버튼 활성**: 공정 CT 입력값이 없거나 기본값(AT/PT/CT)과 동일한 경우
- **조정 요청 버튼 활성**: 최소 1개 공정에서 기본값과 다른 CT를 입력한 경우
- 두 버튼은 항상 둘 중 하나만 활성화됨 (상호 배타적)
- 버튼 variant도 활성/비활성에 따라 contained/outlined로 전환

#### ctOverride 의미
- `ctOverride: true` = **이 배정 카드에 적용된 CT가 Style의 공식 CT와 다름**
- 라인장이 CT 조정 요청 시 설정되며, 운영팀 승인 후에도 true로 유지됨
- ctStatus와 ctSource 조합으로 현재 상태 구분:
  - `REJECTED + ctOverride=true` → 라인장 조정 요청, 운영팀 검토 대기 중
  - `AGREED + ctSource='LINE_LEADER_PROPOSAL'` → 운영팀이 라인장 제안 CT 승인 완료
  - `AGREED + ctSource='MANUAL'` → 라인장이 기본 CT 그대로 동의

#### CT 버전 관리 흐름
1. **스타일 최초 등록**: AT 없으므로 PT를 임시 CT 기준으로 사용
2. **AT 데이터 축적**: 운영자가 AT를 참고해 CT를 명시적으로 설정 → `Style.processes[].ct` 저장, 버전 증가
3. **배정 시**: 공식 CT를 라인장에게 제안 → 라인장 동의 시 배정 확정 (ctStatus: AGREED)
4. **라인장 CT 조정 요청 시**: ctStatus=REJECTED, ctOverride=true. 운영팀 검토 후 승인(AGREED) 또는 거부(배정삭제)
5. **다음 배정**: 다시 최신 공식 CT 버전 기준으로 시작

#### 공임 계산 우선순위
`contractedSeconds (ctOverride) > 공식 CT > AT > PT`

---

### 작업 배정 (Assignment) vs 작업 기록 (WorkLog)
- **작업 배정은 계획이다.** 실제 작업 결과와 다른 것이 정상
- 실제 작업 기록이 배정 계획의 내용(CT, 수량 등)에 영향을 주지 않음
- 현장에서는 A작업과 B작업을 섞어서 진행할 수 있고, 계획과 실제 순서가 다를 수 있음

### 작업 기록 입력 흐름
- **운영자**가 소속 공장 작업자들의 작업 기록을 대신 입력 (작업자 본인이 직접 입력하지 않음)
- 공장 선택 → 라인 선택 → 해당 라인에 배정된 카드 목록 조회
- 카드 선택 → 스타일, 색상, 공정 목록 자동 로드
- 작업자 선택 → 공정별 수량만 입력
- WorkRecord에 `assignmentPlanId` 자동 연결 → WorkRecord ↔ AssignmentPlan 연결 확보
- 한 라인에 카드가 여러 개 있으면(A/B 혼용) 카드를 각각 선택해 기록
- 현재는 배정된 카드 기반 작업 기록만 지원 (배정 외 작업 기록은 향후 검토)

### 급여 계산 기준
- **급여 = WorkRecord 기반** — 공정이 기록되면 지급 대상 (옷 전체 완성 여부와 무관)
- 카드(AssignmentPlan) 완료 여부는 급여와 무관
- WorkLog.factoryWagePerSecond, WorkRecord.ctSeconds 모두 입력 시점의 스냅샷으로 저장됨

### 라인 capacity 계산
- 일일 capacity = 라인 인원 수 × 시프트 시간(초)
- LineAssignment로 인원 변동 이력 관리 (startAt / endAt)
- 라인 인원이 변경되면 해당 라인의 AssignmentBoard capacity를 재계산 (트리거 방식)
- headcount 스냅샷은 저장하지 않음 — 변경 시 재계산으로 처리
- **구현 방식**: `updateLineHeadcounts(lineId, tx)` 백엔드 헬퍼로 LineAssignment 이력 기반 headcount 재계산
  - LineBoard 프론트엔드: API 응답에서 즉시 상태 업데이트
  - ProductionPlanBoard: `visibilitychange` 이벤트 시 재조회

### 급여 계산
- 기준: WorkRecord의 ctSeconds × 수량 × factoryWagePerSecond
- WorkLog에 factoryWagePerSecond 스냅샷 저장 (Factory 단가 변경에 무관)
- WorkRecord에 ctSeconds 스냅샷 저장 (Style CT 변경에 무관)
- **PayrollSnapshot 모델 구현 완료**: orgId, yearMonth(YYYY-MM), data(JSON 스냅샷), isLocked
  - GET /payroll: WorkRecord × ctSeconds × quantity × factoryWagePerSecond 집계, 직원/월 단위 그룹핑
  - POST /payroll/lock: 해당 월 잠금(isLocked = true) → 확정 후 소급 변경 불가

---

## 사용자 · 구독 관리

### 접근 제어 구조
- **SystemUser**: 시스템 수준 사용자. `systemRole: SYSTEM_ADMIN | USER`
  - `krsailer82@gmail.com` 최초 로그인 시 SYSTEM_ADMIN으로 자동 프로비저닝 (하드코딩)
- **OrgMembership**: 조직 수준 접근 제어. `role: ADMIN | OPERATOR | ACCOUNTANT | WORKER`
  - `status: PENDING | ACTIVE | REJECTED | SUSPENDED | TERMINATED`
  - 로그인 사용자의 이메일로 OrgMembership 조회 → orgId, orgRole 결정
- **OrganizationSubscription**: 구독 상태. `status: NOT_SUBSCRIBED | TRIAL | ACTIVE | GRACE | SUSPENDED`
  - SUSPENDED 조직 멤버는 API 호출 시 403 차단 (로그인 자체는 허용)
  - NOT_SUBSCRIBED도 로그인은 가능 — 구독 상태가 로그인을 막지는 않음

### 실제 사용자 등록 절차
1. 시스템 관리자가 `/system` 화면에서 조직 생성 (구독 상태 설정)
2. 해당 조직에 사용자 Google 이메일을 역할과 함께 assign → OrgMembership(status=ACTIVE) 생성
3. 사용자가 Google 로그인 → `GET /auth/context`에서 이메일로 ACTIVE 멤버십 조회 → orgId, orgRole 반환
4. 조직 등록 폼에서 "초기 관리자 이메일" 입력 시 조직 생성과 동시에 멤버십 할당 가능

### auth/context 판단 로직
- 이메일 = SYSTEM_ADMIN 이메일 → entryType='SYSTEM' 반환 (orgId=null)
- 이메일로 ACTIVE OrgMembership 조회 → entryType='ORG', orgId, orgRole 반환
- 멤버십 없거나 ACTIVE 아니면 → 403

---

## 데이터 모델 요약

```
Organization (MANUFACTURER | BRAND)
  └─ OrganizationSubscription (status, membershipEmail, billingEmail, trialStartedAt, ...)
  └─ OrgMembership (email, role, status, approvedAt)
  └─ Factory
       └─ Line
            └─ LineAssignment (직원-라인 배정, startAt/endAt)
  └─ Employee (OrgMembership 1:1)
  └─ Style (processes: JSON [{code, name, pt, at, ct, ctVersion, ctUpdatedAt, quantity}], bom: JSON)
       ※ AT는 WorkRecord 기반 산출값
       ※ CT는 공식 버전 관리 대상. ctVersion은 정수로 증가, ctUpdatedAt은 마지막 CT 변경 시각
       ※ 공정별 quantity 필드 있음 (processQuantity로 CT 계산 시 반영)
  └─ WorkOrder (items: JSON)
  └─ AssignmentPlan (lineId, ctStatus, contractedSeconds, ctOverride, ctSource, ctAgreedBy, ctAgreedAt, ctNote, startIndex, endIndex, isCompleted, finalQuantity, completedAt)
  └─ AssignmentBoardState (cards: JSON, assignments: JSON) — 단일 자동저장
       ※ assignments: 라인 타임라인에 배정된 카드 배열 (AssignmentPlan의 프론트엔드 표현)
       ※ cards: 미배정 풀 카드 배열 (일반 카드 + DELTA 카드 공존)
  └─ PayrollSnapshot (orgId, yearMonth, data: JSON, isLocked)
  └─ SystemUser (email, systemRole)
  └─ WorkLog (workDate, factoryWagePerSecond snapshot)
       └─ WorkRecord (workerId, ctSeconds snapshot, quantity, assignmentPlanId)
```

### AssignmentBoardState 주의사항
- 조직당 단 1개의 레코드 (upsert)
- 500ms debounce로 자동저장
- 현재 버전 관리 없음 — 이전 상태 복원 불가
- **cards vs assignments 구분**:
  - `cards`: 미배정 풀 (일반 카드 + DELTA 카드). 라인에 아직 배정되지 않은 것.
  - `assignments`: 라인 타임라인에 배정된 카드. ctStatus, contractedSeconds 등 협의 정보 포함.
- DELTA 카드(type='DELTA')는 cards 배열 안에만 존재, assignments에는 없음

### 카드(Card) 개념
- **(수주 × 스타일 × 색상 × 성별) 조합으로 자동 생성되는 배정 단위**
- 같은 스타일·색상이라도 수주가 다르면 별개의 카드로 인식
- 미배정(unassigned pool)과 배정(line timeline) 상태로 구분
- 카드는 수량 기준으로 분할(split) / 병합(merge) 가능
- 카드에 배정된 수량과 수주 수량은 독립적 (수동 관리)

### 수주 수량 변경 시 차이 카드 처리 (구현 완료)
- 수주 수량 변경 시 기존 배정 카드를 직접 수정하지 않음
- 수주 저장(handleSave) 시 기존 항목 수량 vs 신규 수량 비교 → delta 자동 감지
- 차이만큼 **DELTA 카드**를 AssignmentBoardState.cards에 생성, ProductionPlanBoard "미배정 풀" 섹션에 표시
- **DELTA 카드 구조**: `{ id, type:'DELTA', deltaType:'PLUS'|'MINUS', quantity, workOrderId, orderItemId, styleId, label, customer, colorName, gender, createdAt }`
- **처리 방식 (버튼 기반, drag-and-drop 아님)**:
  - **ASSIGN**: DELTA 카드를 일반 배정 카드로 전환 → 라인/시작일 선택 후 새 AssignmentPlan 생성
  - **ABSORB**: 기존 배정 카드에 수량 흡수(합산), endIndex 재계산
  - **DEDUCT**: 기존 배정 카드에서 수량 차감, endIndex 재계산 (수량 0이 되면 배정 삭제)
  - **삭제**: DELTA 카드를 미배정 풀에서 제거
- **endIndex 재계산 공식**: `perPieceSeconds = proposalSeconds / oldQty`, `newEndIndex = startIndex + max(0, ceil(perPieceSeconds * newQty / lineDailyCapacitySeconds) - 1)`
- **매칭 기준**: styleId + colorName + gender + customer로 관련 배정 카드 탐색

---

## 비즈니스 규칙

1. CT(Contracted Time)는 합의 시점에 확정(snapshot)됨 — 이후 PT/AT와 완전히 무관
2. WorkLog/WorkRecord는 직원 퇴사 후에도 보존 (workerId nullable)
3. 작업 배정 계획과 실제 작업 기록은 독립적으로 유지
4. 수주 수량과 배정 카드 수량은 별도 관리 (카드는 수주를 쪼개서 배정)
5. 급여 계산은 WorkRecord의 ctSeconds 기준 — Style.processes 변경 영향 없음
6. 라인 인원 변경 시 해당 라인의 AssignmentBoard capacity 재계산 (트리거 방식)
7. 카드 완료 처리: isCompleted 플래그 + finalQuantity 입력 — CT 동의 후 라인장이 최종 수량 입력. 급여와 무관, 수량 초과 감지용. 완료 처리 시 WorkRecord 누적 수량과 비교하여 초과 여부 표시
8. 초과 공정(WorkRecord 누적 > finalQuantity) 시 급여 포함 여부: **미결 (추후 결정)**
9. **CT는 스타일 공정 단위로 버전 관리됨** — PT/AT는 참고값, CT만 공식 기준
10. **공식 CT 변경 절차**: 운영자/관리자가 AT를 참고해 CT 조정 제안 → 검토 후 적용. 버전 증가 기록됨
11. **구독 상태 SUSPENDED 조직**: API 호출 403 차단. 로그인 자체는 허용되나 데이터 접근 불가

---

## 개발 시 주의사항

- 다국어: 한국어 UI, 영문 코드/enum
- 날짜 인덱스: AssignmentPlan의 startIndex/endIndex는 달력 기준 일(day) 오프셋
- 스타일 코드: 별도 입력이 없으면 스타일명과 동일하게 저장 (buildPayload fallback)
- 타임라인 레인 배치: assignLanes는 실제 논리 범위(buildRange)로 충돌 감지, 시각 최소 너비(MIN_BAR_WIDTH)는 렌더 전용
- 휴일: 브라우저 localStorage에 저장, 일요일 + 공휴일 제외하여 capacity 계산
- 멀티테넌시: 모든 쿼리에 orgId 필터 필수
- Supabase Auth + Express 미들웨어로 인증 처리
- 개발 모드: DEV_BYPASS 플래그로 테스트 프로파일 사용 가능
- **드래그 연속 카드 밀기**: 배정 카드를 현재보다 앞 날짜로 드래그 시, 직후에 연속으로 붙어있는 카드(getNextStartIndex 기준)가 있으면 `tryRebuildLineWithInsert`로 함께 앞으로 이동. 단독 배치 가능한 경우에도 연속 카드가 있으면 밀기 우선 적용.
- **CT 협의 버튼 로직**: `hasCtAdjustment = selectedProcessRows.some(row => row.hasDirectProposal && row.proposedSeconds !== row.baseSeconds)` 로 변경 감지
