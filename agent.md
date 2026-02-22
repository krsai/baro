# BARO - 봉제 생산관리 시스템 Agent 참조 문서

## 프로젝트 개요

봉제(縫製) 공장을 위한 B2B 생산관리 웹 애플리케이션.
수주자(봉제 공장, MANUFACTURER)와 발주자(브랜드, BRAND) 두 유형의 조직을 지원한다.

**스택**: React (Vite) + MUI / Node.js + Express 5 + Prisma + PostgreSQL + Supabase Auth

---

## 핵심 도메인 개념

### 시간 관리 체계

#### 핵심 개념 정의

**PT (Planned Time) — 인간 추정 기준점**
- 공장장/매니저가 주문 수량을 보고 경험적으로 입력하는 개당 예상 시간
- 스타일 공정 정보에 직접 입력하며, AT 데이터가 축적되기 전까지 ST(q)의 기준값으로 사용
- AT 데이터 없는 동안: ST(q) = 현재 스타일에 입력된 PT값
- **PT가 변경되면 CT 미확정 카드의 ST가 즉시 바뀜** — CT 확정 카드에는 영향 없음 (스냅샷 보호)
- 실무적으로 매니저는 주문 수량을 감안해 PT를 입력함. 다음 주문 수량이 크게 달라지면 PT를 다시 입력

**AT(q) (Actual Time) 정의**
- AT(q)는 WorkRecord 누적으로 자동 산출되는 “수량 q에 대한 개당 평균 시간 함수”이며, 운영자가 직접 입력하지 않는다.
- **AT(q)는 공정별(Style + Process)로 존재한다.**
- **형태**:
  ```
  AT_p(q) = a_p + b_p / q
  TotalTime_p(q) = a_p * q + b_p
  ```
- **해석**:
  - `a_p`: 대량 생산에서 수렴하는 순수 작업 시간 (초/개)
  - `b_p`: 공정 세팅/전환 또는 소량 생산 비효율에 해당하는 고정 오버헤드 시간 (초)
- **저장 위치**:
  ```json
  Style.processes[].atParams = {
    "a": number,
    "b": number,
    "version": number,
    "updatedAt": "timestamp",
    "trainedPeriod": "YYYY-MM"
  }
  ```
- 데이터가 부족하여 파라미터를 추정할 수 없는 경우 `atParams`는 `null`일 수 있다.

**AT(q) 추정 방식 — 비례배분 + OLS 반복학습**
- **문제 정의**: 공정별 실제 투입 시간(`t_p`)은 직접 관측할 수 없다. 관측 가능한 데이터는 라인별/일별 총 근무시간(`T_d`)과 공정별 생산 수량(`q_d,p`) 뿐이다.
- **관측 데이터 (라인 × 일자 `d` 단위)**:
  - `T_d`: 해당 라인의 해당 일자 총 근무시간 (초)
  - `q_{d,p}`: 해당 라인 해당 일자에 공정 `p`로 기록된 처리 수량 (WorkRecord는 `assignmentPlanId`를 통해 공정별 수량과 연결됨)
- **핵심 원리**: 현재 추정치 `w_p`(초/개)를 기준으로 하루 총 근무시간 `T_d`를 공정별 작업량에 비례 배분하여 가상 투입시간 `t̂_{d,p}`를 산출한다. 이 가상 데이터를 기반으로 공정별 OLS 회귀분석을 수행하고, 이 과정을 수렴할 때까지 반복한다.

**1. 초기값 설정**
- `w_p` = PT(Planned Time) 기반 개당 작업 시간 (초/개)
- 초기 학습 단계에서는 안정성을 위해 `b_p = 0`으로 고정하고 `a_p`를 중심으로 학습을 시작할 수 있다.

**2. 비례배분 (시간 할당)**
- 각 공정의 작업량(`work_{d,p}`)과 일일 총 작업량(`W_d`)을 계산한다.
  ```
  work_{d,p} = q_{d,p} * w_p
  W_d = Σ_p work_{d,p}
  ```
- `W_d = 0`인 날짜(작업 기록이 없는 날)는 학습 데이터에서 제외한다.
- 비례 배분을 통해 공정별 가상 투입시간 `t̂_{d,p}`를 추정한다.
  ```
  t̂_{d,p} = T_d * (work_{d,p} / W_d)
  ```

**3. 공정별 OLS (Ordinary Least Squares) 회귀분석**
- 각 공정 `p`에 대해, 여러 날짜의 데이터 포인트 `(q_{d,p}, t̂_{d,p})`를 사용하여 아래 선형 모델을 피팅한다.
  ```
  t̂ = a_p * q + b_p
  ```
- **제약 조건**: `a_p >= 0`, `b_p >= 0` 이어야 한다.
- **데이터 부족 시**: 데이터가 부족하여 `a_p`와 `b_p`를 모두 안정적으로 추정할 수 없으면 `b_p = 0`으로 유지하고 `a_p`만 업데이트하거나, `atParams`를 기존 값으로 유지/`null` 처리한다.

**4. 반복 학습**
- `w_p`를 새로 추정된 `a_p`로 업데이트한다.
  ```
  w_p ← a_p
  ```
- (비례배분 → OLS → 업데이트) 과정을 5~10회 반복하거나, 파라미터 변화량이 충분히 작아지면(수렴하면) 종료한다.

**5. 데이터 품질 보정 (Trim + Weight + Drift)**
- **Outlier 제거 (Trim)**: `T_d` 또는 `T_d / Σ q_{d,p}` (일일 평균 작업 시간) 기준 상/하위 p% 데이터는 제외하거나 낮은 가중치를 적용한다.
- **편차 기반 가중치 조정**: 기존 `atParams`로 예측한 시간 `T̂_d(old)`와 실제 시간 `T_d`의 차이(`r_d`)가 클수록 가중치를 낮춘다.
  - `r_d = (T_d - T̂_d(old)) / T_d`
  - `|r_d|`가 클수록 가중치(`w_mag`) 감소
- **방향성 기반 가중치 조정 (Drift)**: 편차가 크더라도 한 방향으로 지속적으로 발생하면(최근 N일간 `r_d` 부호가 한쪽으로 치우치면) 의도된 변화로 간주하여 가중치(`w_trend`)를 높인다.
- **최종 가중치**: `w_day = max(w_mag, w_trend)`
- **월간 변경폭 제한**: 새로 계산된 `AT_new`는 `AT_old` 대비 ±δ% (예: 5~15%) 범위 내로 clamp하여 급격한 변화를 방지한다.

**학습 실행 정책**
- **실행 시점**: 매달 5일 00:00 (Asia/Seoul)
- **학습 대상**: 직전 월 전체 데이터
- **출퇴근 기록 미입력 폴백**: 매달 5일까지 전월 출퇴근 기록이 입력되지 않은 날은 `T_d = 8 * 3600` (8시간)으로 간주하여 학습을 진행한다. 이 값은 학습에만 사용되며, 실제 급여 계산에는 적용되지 않는다.

**레거시 평균 AT 제거**
- 기존의 단순 평균 방식(`AT = 전체 총시간 ÷ 전체 총수량`)은 폐기(deprecated) 처리한다.
- 모든 일정 예측, 공임 계산, 성과 분석은 `atParams` 기반의 `AT(q)` 함수로 통일한다.

**ST(q) (Standard Time) — 버전 관리 정책 기준값 (충격 완충재)**
- PT → AT로 기준이 전환될 때 급격한 변화를 막기 위한 완충 구간
- AT(q)가 나왔다고 ST를 바로 AT로 맞추지 않음 — 현장 충격(파업 등) 방지
- 운영팀이 AT(q)를 참고해 점진적으로 ST를 조정. 버전 관리: ST_v1 → ST_v2 …
- AT 데이터 없으면 ST = PT (현재 스타일에 입력된 PT값)
- **코드상**: `Style.processes[].ct` 필드가 이 역할 수행 (기존 필드명 유지)
- ST는 "이 스타일 이 공정의 현재 공식 단가"이며, 라인과 협의하는 출발점

**CT (Contracted Time) — 카드 단위 확정 스냅샷**
- 주문 수량 q 확정 후, 시스템이 현재 ST(q)를 제안값으로 보여주고 라인장이 승인/조정하여 확정
- CT는 함수가 아닌 카드(AssignmentPlan) 단위 고정값. **확정 후 ST/PT/AT 변경과 완전히 무관**
- **급여 = CT × 수량** (단순)
- AssignmentPlan의 `contractedSeconds`: CT 합의 시 확정된 값

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
- **동의 버튼 활성**: 공정 CT 입력값이 없거나 ST 제안값과 동일한 경우
- **조정 요청 버튼 활성**: 최소 1개 공정에서 ST 제안값과 다른 CT를 입력한 경우
- 두 버튼은 항상 둘 중 하나만 활성화됨 (상호 배타적)
- 버튼 variant도 활성/비활성에 따라 contained/outlined로 전환

#### ctOverride 의미
- `ctOverride: true` = **이 배정 카드에 적용된 CT가 Style의 공식 CT와 다름**
- 라인장이 CT 조정 요청 시 설정되며, 운영팀 승인 후에도 true로 유지됨
- ctStatus와 ctSource 조합으로 현재 상태 구분:
  - `REJECTED + ctOverride=true` → 라인장 조정 요청, 운영팀 검토 대기 중
  - `AGREED + ctSource='LINE_LEADER_PROPOSAL'` → 운영팀이 라인장 제안 CT 승인 완료
  - `AGREED + ctSource='MANUAL'` → 라인장이 기본 CT 그대로 동의

#### 시간의 두 가지 용도 — 반드시 구분

| 용도 | 사용 시간 | 이유 |
|------|-----------|------|
| **배정 예상 기간** (endIndex 계산) | atParams 있으면 AT(q), 없으면 PT | 현실에 가까운 일정 예측 |
| **CT 제안값** (라인장 협의 출발점) | ST(q) (= Style.processes[].ct), 없으면 PT | 공식 단가 기준으로 협의 시작 |
| **급여 확정값** | CT (contractedSeconds 스냅샷) | 합의된 계약값, 이후 변경 없음 |

#### ST/CT 운영 흐름
1. **스타일 최초 등록**: atParams = null → ST = PT. 배정 예상 기간도 PT(q) 기준
2. **AT(q) 산출 시작**: atParams 갱신됨. 배정 예상 기간은 AT(q)로 전환. ST는 아직 PT 기반 유지
3. **AT(q) vs ST 차이 기준 이상**: "ST 조정 필요" 경고 → 운영팀이 ST 점진 조정 (버전 증가). 단번에 AT로 맞추지 않음
4. **배정 시 CT 협의**: 시스템이 현재 ST(q)를 제안값으로 표시
   - 라인장 동의 → CT = ST(q) 그대로 확정 (ctStatus=AGREED, ctSource=MANUAL)
   - 라인장 조정 요청 → 해당 카드·라인만의 임시 CT로 협의 (ctStatus=REJECTED → 운영팀 검토 → AGREED 또는 배정삭제)
5. **CT 확정 후**: 해당 카드의 CT는 영구 고정. ST 변경·AT 갱신 무관
6. **다음 배정**: 최신 ST(q) 버전 기준으로 다시 제안

#### 공임 계산
`급여 = contractedSeconds(CT) × 수량` — CT 확정 후에는 다른 값 참조 없음

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
  └─ Style (processes: JSON [{code, name, pt, atParams:{a,b}, ct, ctVersion, ctUpdatedAt, quantity}], bom: JSON)
       ※ PT: 매니저 직접 입력. AT 없을 때 ST(q) 기준값으로 사용
       ※ atParams: WorkRecord 기반 자동 산출. AT(q)=a+b/q 파라미터. 데이터 부족 시 null
       ※ ct: ST(q) 역할. 버전 관리 대상. ctVersion은 정수로 증가, ctUpdatedAt은 마지막 변경 시각
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
  ※ 신규 배정 시 perPieceSeconds 산출: atParams 있으면 AT(q), 없으면 PT 사용 (스케줄링 예측용)
- **매칭 기준**: styleId + colorName + gender + customer로 관련 배정 카드 탐색

---

## 비즈니스 규칙

1. CT(Contracted Time)는 합의 시점에 확정(snapshot)됨 — 이후 PT/AT/ST 변경과 완전히 무관
2. WorkLog/WorkRecord는 직원 퇴사 후에도 보존 (workerId nullable)
3. 작업 배정 계획과 실제 작업 기록은 독립적으로 유지
4. 수주 수량과 배정 카드 수량은 별도 관리 (카드는 수주를 쪼개서 배정)
5. 급여 계산은 WorkRecord의 ctSeconds 기준 — Style.processes 변경 영향 없음
6. 라인 인원 변경 시 해당 라인의 AssignmentBoard capacity 재계산 (트리거 방식)
7. 카드 완료 처리: isCompleted 플래그 + finalQuantity 입력 — CT 동의 후 라인장이 최종 수량 입력. 급여와 무관, 수량 초과 감지용. 완료 처리 시 WorkRecord 누적 수량과 비교하여 초과 여부 표시
8. 초과 공정(WorkRecord 누적 > finalQuantity) 시 급여 포함 여부: **미결 (추후 결정)**
9. **ST(q) = Style.processes[].ct** — 버전 관리 대상. AT 데이터 없으면 PT가 ST 역할
10. **ST 변경 절차**: AT(q)와 현재 ST 차이가 기준 이상이면 "ST 조정 필요" 안내 → 운영팀 검토 후 새 버전으로 갱신. 버전 증가 기록됨
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
