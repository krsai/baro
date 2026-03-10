# BARO - 봉제 생산관리 시스템 Agent 참조 문서

## 프로젝트 개요

봉제(縫製) 공장을 위한 B2B 생산관리 웹 애플리케이션.
수주자(봉제 공장, MANUFACTURER)와 발주자(브랜드, BRAND) 두 유형의 조직을 지원한다.

**스택**: React (Vite) + MUI / Node.js + Express 5 + Prisma + PostgreSQL + Supabase Auth

---

## 코딩 원칙 (단순성 최우선)

- 모든 코딩은 **최대한 간단하게** 구현한다.
- 사용자 요청 범위를 벗어난 **불필요한 기능/옵션/추상화는 추가하지 않는다.**
- 기본 원칙은 **"지금 필요한 것만 구현(YAGNI)"** 이다.

## 2026-03-10 확정 정책 (우선 적용)

이 섹션이 아래의 오래된 설명보다 우선한다.

- `PT`는 스타일+공정별 `PT(1000)` 하나만 가진다.
- `AT`는 스타일+공정별 함수 `atParams={a,b,...}`만 저장한다. 단순 숫자 `at`는 삭제 대상 레거시이며 신규 정책에서 사용하지 않는다.
- `ST`는 스타일+공정별 `ST(q)` 기준점을 수량별로 저장한다.
- `CT`는 `AssignmentPlan.contractedSeconds`만 진짜 카드 단위 확정값으로 사용한다.
- `AT(q)`는 `ST(q)`/`CT(q)`를 자동 결정하는 값이 아니라, 운영팀이 `ST(q)`를 검토할 때 참고하는 값이다.
- 배정 카드 생성 시점에 해당 수량의 `ST(q)`가 없으면 기본값을 잡아 새 `ST(q)` 기준점을 만든다.
- 라인장과 협의해 바뀐 `CT`는 그 배정 건에만 적용되며, 다른 배정은 다시 `ST(q)`를 기본값으로 사용한다.
- `ST` 값의 증가/감소 방향은 시스템이 강제하지 않는다. 대신 나중에 `표준 공임 검토` 메뉴에서 운영 검토 경고를 보여준다.
- 이 문서 아래에서 `Style.processes[].ct`, `stManual`, `timeRefQuantity`, `Style.processes[].at`를 `ST/AT`의 저장 원본으로 설명하는 부분은 레거시 메모로 본다.

---

## 핵심 도메인 개념

### 시간 관리 체계

#### 핵심 개념 정의

**PT (Planned Time) — 인간 추정 기준점**
- 스타일+공정별 `PT(1000)` 하나만 가진다.
- 공장장/매니저가 스타일 최초 등록 시 입력하는 기본 가이드라인이다.
- 다른 q값의 `PT(q)`는 따로 두지 않는다.
- 새로운 `ST(q)` 기준점이 처음 필요할 때 초기 참고값으로만 사용한다.
- PT 변경은 이미 저장된 `ST(q)`나 카드별 `CT`를 자동으로 덮어쓰지 않는다.

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
  - `b_p`: **공정 단위 시작 오버헤드**로 정의하며, 하루에 해당 공정을 수행하면 1회 발생하는 고정 시간으로 모델링한다.
- **저장 위치**:
  ```json
  atParams = {
    "a": number,
    "b": number,
    "version": number,
    "updatedAt": "timestamp",
    "trainedPeriod": "YYYY-MM"
  }
  ```
- 단순 숫자 `at`는 더 이상 정책상 원본 필드가 아니다.
- 데이터가 부족하여 파라미터를 추정할 수 없는 경우 `atParams`는 `null`일 수 있다.
- 배정/협의 화면에서 AT가 없으면 `수집중`으로 표시한다.

**AT(q) 고급 추정(구현) — 비례배분 + WLS 반복학습**
- **문제 정의**: 공정별 실제 투입 시간(`t_p`)은 직접 관측할 수 없다. 관측 가능한 데이터는 라인별/일별 총 근무시간(`T_d`)과 공정별 생산 수량(`q_d,p`) 뿐이다.
- **관측 데이터 (라인 × 일자 `d` 단위)**:
  - `T_d`: 해당 라인의 해당 일자 총 근무시간 (초)
  - `q_{d,p}`: 해당 라인 해당 일자에 공정 `p`로 기록된 처리 수량 (WorkRecord는 `assignmentPlanId`를 통해 공정별 수량과 연결됨)
- **핵심 원리**: 현재 추정치 `w_p`(초/개)를 기준으로 하루 총 근무시간 `T_d`를 공정별 작업량에 비례 배분하여 가상 투입시간 `t̂_{d,p}`를 산출한다. 이 가상 데이터를 기반으로 공정별 회귀분석을 수행하고, 이 과정을 수렴할 때까지 반복한다.

**1. 초기값 설정**
- `w_p` = PT(Planned Time) 기반 개당 작업 시간 (초/개)
- 초기 학습 단계에서는 안정성을 위해 `b_p = 0`으로 고정하고 `a_p`를 중심으로 학습을 시작한다.

**2. 반복 학습을 통한 파라미터 수렴 (안정성 우선)**
- (비례배분 → OLS → Trim) 과정을 파라미터 변화량이 충분히 작아질 때까지(수렴할 때까지) 반복한다. 이 단계에서는 가중치(`w_trend`, `w_mag`)를 적용하지 않고 수렴 안정성을 우선 확보한다.

  **2-1. 비례배분 (시간 할당)**
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

  **2-2. 공정별 OLS (Ordinary Least Squares) 회귀분석**
  - 각 공정 `p`에 대해, 데이터 포인트를 사용하여 선형 모델 `t̂ = a_p * q + b_p`를 피팅한다.
  - **데이터셋 규칙**: 공정 `p`에 대해 **`q_{d,p} = 0`인 일자는 해당 공정의 OLS 데이터셋에서 제외한다.**
  - **Outlier 제거 (Trim)**: `T_d` 또는 `T_d / Σ q_{d,p}` (일일 평균 작업 시간) 기준 상/하위 p% 데이터는 회귀분석에서 제외한다.
  - **제약 조건**: `a_p >= 0`, `b_p >= 0`. 데이터 부족 시 `b_p = 0` 고정 후 `a_p`만 추정한다.

  **2-3. 파라미터 업데이트**
  - `w_p`를 새로 추정된 `a_p`로 업데이트한다: `w_p ← a_p`

**3. 최종 가중치 계산 및 WLS 적용 (정확성 보정)**
- 반복 루프가 수렴된 후, 최종 파라미터를 결정하기 위해 가중치를 적용한 회귀분석을 **단 1회** 수행한다.

  **3-1. WLS를 위한 데이터 재계산**
  - 반복 루프에서 최종적으로 **수렴된 `w_p`를 기준**으로, 전체 학습 기간에 대해 **비례배분을 다시 수행하여 `t̂_{d,p}`를 재계산**한다. 이후 WLS 단계에서는 이 재계산된 데이터를 사용한다.

  **3-2. 데이터 품질 가중치 계산 (Weight + Drift)**
  - **편차 기반 가중치 (`w_mag`)**: 수렴된 `atParams`로 예측한 시간 `T̂_d`와 실제 시간 `T_d`의 차이(`r_d`)가 클수록 가중치를 낮춘다. (`r_d = (T_d - T̂_d) / T_d`)
  - **방향성 기반 가중치 (`w_trend`)**: 편차가 크더라도 한 방향으로 지속 발생하면(Drift) 의도된 변화로 간주하여 가중치를 높인다.
  - **일자별 최종 가중치 (`w_day`)**: `w_day = max(w_mag, w_trend)`. Trim으로 제외된 데이터는 `w_day = 0`으로 처리된다. **`w_day`는 일자 단위 가중치이며, 해당 일자에 수행된 모든 공정 `p`에 동일하게 적용된다.**

  **3-3. 공정별 WLS (Weighted Least Squares) 회귀분석**
  - **공정별 OLS는 Weighted Least Squares(WLS) 방식으로 수행하며, 각 데이터 포인트 `(q_{d,p}, t̂_{d,p})`에 일자 가중치 `w_day`를 적용한다.**
  - 이 WLS를 통해 최종 `a_p`와 `b_p`를 확정한다.

**4. 월간 변경폭 제한 (Clamp)**
- 새로 계산된 `a_p_new`는 `a_p_old` 대비 ±δ% (예: 5~15%) 범위 내로 clamp하여 급격한 변화를 방지한다. **월간 변경폭 제한은 `a_p`에 적용하며, `a_p_new`는 `a_p_old` 대비 ±δ% 범위 내로 제한한다.**
- `b_p`는 초기에는 `0`으로 고정하거나, 별도의 안정화 정책에 따라 제한적으로 학습/갱신한다.

**학습 실행 정책**
- **실행 시점**: 매달 5일 00:00 이후(Asia/Seoul) 스케줄러 자동 실행 + 이벤트 트리거 보조
- **학습 대상**: 직전 월 전체 데이터
- **출퇴근 기록 폴백 규칙(확정)**:
  - 매달 5일까지 전월 출퇴근 기록이 입력된 경우: 입력된 실제 근무시간으로 `T_d`를 사용한다.
  - 매달 5일까지 전월 출퇴근 기록이 입력되지 않은 경우: 해당 라인/작업자는 `T_d = 8 * 3600` (8시간)으로 간주한다.
  - 위 규칙은 학습(AT 갱신)에만 적용하며, 실제 급여 계산 기준은 별도 정책을 따른다.
- **구현 상태(반영 완료)**: 출퇴근 입력은 화면 + 서버 저장으로 동작하며, AT 학습 계산은 매월 5일 기준 직전 월 데이터를 반영할 때 출퇴근 입력값을 우선 사용한다. 입력이 없거나 불완전한 경우 8시간 기준으로 폴백한다.

**AT 추정 구현(현재)**
- 현재 운영 구현은 **라인×일자 총시간(T_d)을 공정별 작업량(q×w_p)으로 비례배분**하고, 공정별 `t = a*q + b`를 반복 추정한다.
- `w_p <- a_p`로 갱신하는 반복 수렴 루프를 수행한 뒤, 일자 단위 가중치(`w_day = max(w_mag, w_trend)`)를 적용한 최종 WLS를 1회 수행해 `a,b`를 확정한다.
- 월간 급변 방지를 위해 `a`는 직전 값 대비 `±AT_MONTHLY_A_CLAMP_RATIO` 범위로 clamp한다.
- 추정 결과는 `Style.processes[].atParams = { a, b, version, updatedAt, trainedPeriod }`로 저장되며, `at` 필드는 더 이상 갱신하거나 사용하지 않는다.
- 데이터가 부족하거나 회귀가 불안정한 경우에는 `b=0`(원점 통과 slope) 및 평균 단위시간 fallback을 사용한다.

**ST(q) (Standard Time) — 정책 기준값 (충격 완충재)**
- PT → AT로 기준이 전환될 때 급격한 변화를 막기 위한 완충 구간
- AT(q)가 나왔다고 ST를 바로 AT로 맞추지 않음 — 현장 충격(파업 등) 방지
- 운영팀이 AT(q)를 참고해 ST를 점진적으로 조정
- ST는 스타일+공정별 `q` 기준점으로 저장한다.
- 같은 공정명이라도 스타일이 다르면 다른 ST 집합이다.
- 새로운 수량 q가 처음 필요하면 초기값은 `PT(1000)`을 참고해 만든다.
- 이후 운영팀이 수동으로 수정한 `ST(q)`는 그 스타일+공정+수량의 반복 사용 기준이 된다.
- ST는 CT 합의 결과로 자동 갱신되지 않는다.
- ST 값의 증가/감소 방향은 시스템이 강제하지 않고, 추후 `ST 검토` 메뉴에서 경고만 제공한다.

**CT (Contracted Time) — 카드 단위 확정 스냅샷**
- 주문 수량 q 확정 후, 시스템이 현재 ST(q)를 제안값으로 보여주고 라인장이 승인/조정하여 확정
- CT는 함수가 아닌 카드(AssignmentPlan) 단위 고정값. **확정 후 ST/PT/AT 변경과 완전히 무관**
- **급여 = CT × 수량** (단순)
- `proposalSeconds`: 운영팀 제안 CT(초기 오퍼). **배정 건 전체 총시간(초)**
- `contractedSeconds`: 최종 합의 CT(지급 기준). 제안 송부 시점에는 `null` 가능. **배정 건 전체 총시간(초)**
- `proposalSeconds` / `contractedSeconds` / `totalSeconds`는 카드 1건 전체 총시간이다.
- 스타일 레벨 `PT(1000)` / `AT(q)` / `ST(q)` 저장 구조와 카드 레벨 `CT` 스냅샷은 구분해서 본다.
- **CT 제안 흐름은 스타일의 ST 기준점을 절대 수정하지 않는다.** CT는 해당 AssignmentPlan의 `proposalSeconds`/`contractedSeconds`에만 저장된다
- **배정 화면에서 ST(q) 수정 불가** — ST(q)는 스타일 상세 화면에서만 변경한다
- **라인마다 CT가 다를 수 있다**: 같은 스타일을 여러 라인에 배정하면 각 라인이 협의한 CT가 독립적으로 저장되며 서로 영향을 주지 않는다

#### CT 협의 상태 흐름 (ctStatus)

```
PENDING (제안 전)
  └─ 운영팀 "제안 송부" ────────────────────────────────── SENT
       proposalSeconds = 운영팀 제안값
       contractedSeconds = null
       ctSource='OPERATOR_PROPOSAL'

SENT (승인 전, 제안 송부 상태)
  ├─ 라인장 "동의" ──────────────────────────────────────── AGREED
  │    contractedSeconds = proposalSeconds (제안값 수락)
  │    ctAgreedBy='LINE_LEADER' (실사용자명), ctAgreedAt 기록
  └─ 라인장 "변경 요청" ────────────────────────────────── REJECTED
       ctSource='LINE_LEADER_PROPOSAL', ctOverride=true
       pendingCtProposal에 공정별 요청 CT 저장

REJECTED (변경 요청, 운영팀 재검토)
  ├─ 운영팀 "요청 동의" ────────────────────────────────── AGREED
  │    ctAgreedBy='OPERATOR', ctSource='LINE_LEADER_PROPOSAL'
  │    contractedSeconds = 라인장 요청 CT
  │    proposalSeconds는 기존 제안값 유지
  ├─ 운영팀 "다시 제안" ────────────────────────────────── SENT
  │    proposalSeconds 갱신, contractedSeconds는 null 유지
  └─ 운영팀 "배정 취소" ────────────────────────────────── 배정 삭제 + 미배정 카드 복귀

AGREED (확정)
  └─ 관리자 "재협의 개시" ──────────────────────────────── PENDING
       ctSource='REOPENED_BY_ADMIN'
       기존 합의값은 card.ctAgreementHistory에 보관
```

> ⚠️ 현재 구현의 잠금은 기능별로 다르다.
> `SENT`/`AGREED`는 `isAssignmentLockedStatus` 대상이라 **수량 분할 / 카드·배정 병합 / 초기화**에서는 제외된다.
> 다만 드래그 자체는 완전 잠금이 아니다. `AGREED`는 **다른 라인 이동 / 보드 밖 제거**만 막고, 같은 라인 내 날짜 이동은 현재 허용된다. `SENT`는 드래그 이동과 보드 밖 제거가 현재 코드상 가능하다.
> `REJECTED`는 재협의 상태이며 운영팀 액션(요청 동의/다시 제안/배정 취소)이 열려 있고, 일반 배정처럼 저장/reflow 대상에도 포함된다.
> 운영팀이 제안 CT를 수정한 상태에서는 **요청 동의가 비활성화**되며, 다시 제안으로만 진행 가능하다.
> `SENT` 상태가 48시간을 초과하면 읽기/저장 과정에서 자동으로 관리자 검토 대상으로 에스컬레이션된다. (`ctEscalatedAt`, `ctEscalationReason='SENT_TIMEOUT_48H'`)

#### CT 협의 UI 버튼 규칙 (ProductionPlanBoard)
- **동의 버튼 활성**: 요청 CT 입력값이 없거나 제안 CT와 동일한 경우
- **변경 요청 버튼 활성**: 최소 1개 공정에서 요청 CT가 제안 CT와 다른 경우
- 두 버튼은 항상 둘 중 하나만 활성화됨 (상호 배타적)
- 버튼 variant도 활성/비활성에 따라 contained/outlined로 전환
- 액션(동의/변경 요청) 성공 시 우측 확장 패널은 자동으로 닫혀 목록 복귀

#### ctOverride 의미
- `ctOverride`는 **AssignmentPlan DB 컬럼이 아니라** `AssignmentBoardState.assignments`의 보드 상태 값이다.
- DB 영속 상태 판별은 `ctStatus + ctSource (+ contractedSeconds)` 조합을 기준으로 본다.
- 상태 해석 기준:
  - `SENT + ctSource='OPERATOR_PROPOSAL'` → 운영팀 제안 송부 후 라인장 승인 대기
  - `REJECTED + ctSource='LINE_LEADER_PROPOSAL'` → 라인장 조정 요청, 운영팀 검토 대기 중
  - `AGREED + ctSource='LINE_LEADER_PROPOSAL'` → 운영팀이 라인장 요청 CT 동의 완료
  - `AGREED + ctSource!='LINE_LEADER_PROPOSAL'` → 라인장이 제안 CT를 동의해 확정

#### 시간의 두 가지 용도 — 반드시 구분

| 용도 | 사용 시간 | 이유 |
|------|-----------|------|
| **배정 예상 기간** (endIndex 계산) | **ST(q)** (없으면 PT(1000)을 참고해 ST(q) 생성 후 사용) | ST(q)가 현재 공식 기준값이며, AT는 참고용일 뿐 자동 fallback이 아니다 |
| **CT 제안값** (라인장 협의 출발점) | 현재 ST(q) | 충격 완충 + 재협의 연속성 |
| **급여 확정값** | CT (contractedSeconds 스냅샷) | 합의된 계약값, 이후 변경 없음 |

> ST(q)는 AT(q)가 추출된 뒤 운영자가 스타일 상세에서 수동 조정하는 현장 기준값이다.
> ST(q) 수정은 수정 시점 이후 생성되거나 미배정 상태인 카드에만 반영된다 (배정된 카드는 생성 시점의 totalSt 스냅샷 유지).
> CT 합의/거부는 배정 기간(totalSeconds)에 영향을 주지 않는다 — contractedSeconds만 변경된다.

#### ST/CT 운영 흐름
1. **스타일 최초 등록**: `PT(1000)` 입력. 새로운 수량 `q`가 처음 필요해질 때 `PT(1000)`을 참고해 `ST(q)`를 만든다.
2. **AT(q) 산출 시작**: `atParams`가 갱신되어도 배정/CT 기본값은 자동으로 AT로 바뀌지 않는다.
3. **AT(q) vs ST(q) 차이 기준 이상**: "ST 조정 필요" 경고 → 운영팀이 `ST(q)`를 검토/수정한다. 단번에 AT로 맞추지 않음
4. **배정 시 CT 협의**: 시스템이 현재 ST(q)를 제안값으로 표시
   - 제안 송부 시 `proposalSeconds` 저장, `contractedSeconds`는 비움(null)
   - 라인장 동의 → `contractedSeconds = proposalSeconds`로 확정 (ctStatus=AGREED)
   - 라인장 조정 요청 → `pendingCtProposal`에 요청 CT 저장 (ctStatus=REJECTED)
   - 운영팀 요청 동의 → `contractedSeconds = 요청 CT`, `proposalSeconds`는 보존
5. **CT 확정 후**: 해당 카드의 CT는 영구 고정. ST 변경·AT 갱신 무관
6. **다음 배정**: 최신 ST(q) 기준으로 다시 제안

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
- **공장 초당 급여 단가 정책(확정)**: `factoryWagePerSecond = 월 목표 급여 / (26일 × 8시간 × 3600초)` 고정
- **PayrollSnapshot 모델 구현 완료**: orgId, month(YYYY-MM), data(JSON 스냅샷), lockedAt(DateTime), lockedBy(String)
  - GET /payroll: WorkRecord × ctSeconds × quantity × factoryWagePerSecond 집계, 직원/월 단위 그룹핑
  - POST /payroll/lock: 해당 월 잠금(lockedAt/lockedBy 기록) → 확정 후 소급 변경 불가

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

### 프론트엔드 루트 라우트 정책
- `/`는 더 이상 대시보드 페이지가 아니다. 인증된 사용자가 `/`로 들어오면 `resolveFirstAccessiblePath` 기준 첫 접근 가능 메뉴로 즉시 redirect한다.
- 로그인 성공, OAuth 콜백 복귀, 권한 없는 URL fallback, 마지막 탭 종료 후 복귀 경로는 모두 같은 기준(`resolveFirstAccessiblePath`)으로 맞춘다.
- 사이드바/탭은 실제 메뉴만 다룬다. `/`는 빈 워크스페이스나 고정 탭으로 유지하지 않는다.

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
  └─ Style (processes: JSON [{code, name, pt, atParams:{a,b,version,updatedAt,trainedPeriod}, at, ct, stManual, timeRefQuantity, quantity}], bom: JSON)
       ※ PT: 매니저 직접 입력. AT 없을 때 ST(q) 기준값으로 사용
       ※ atParams: WorkRecord 기반 자동 산출. 현재는 스타일+공정 단위 관측점으로 WLS 회귀(`t=a*q+b`) 후 `a,b`를 저장. 데이터 부족 시 null 또는 `b=0` fallback
       ※ ct: ST(q) 역할. 운영팀이 수동 ST를 관리할 때 저장되는 기준값
       ※ 공정별 quantity 필드 있음 (processQuantity로 CT 계산 시 반영)
  └─ WorkOrder
       └─ WorkOrderItem (styleId, colorId→AttrColor FK, colorCode, colorName, gender, sizeQuantities, sortOrder)
  └─ AssignmentCard (cardId, sortOrder, payload: JSON) — 미배정 카드 저장 테이블
  └─ AssignmentPlan (lineId, ctStatus, contractedSeconds, ctSource, ctAgreedBy, ctAgreedAt, ctNote, startIndex, endIndex, isCompleted, finalQuantity, completedAt)
  └─ AssignmentBoardState (assignments: JSON) — 수동 저장 보드 스냅샷(upsert)
       ※ assignments: 라인 타임라인에 배정된 카드 배열 (AssignmentPlan의 프론트엔드 표현)
       ※ cards 컬럼은 레거시 호환/이관용으로만 유지, 현재 소스 오브 트루스는 `AssignmentCard`
  └─ PayrollSnapshot (orgId, month, data: JSON, lockedAt, lockedBy)
  └─ SystemUser (email, systemRole)
  └─ WorkLog (workDate, factoryWagePerSecond snapshot)
       └─ WorkRecord (workerId, ctSeconds snapshot, quantity, assignmentPlanId)
```

### AssignmentBoardState 주의사항
- 조직당 단 1개의 레코드 (upsert)
- 작업 배정 보드는 **수동 저장 버튼**으로만 저장 (자동저장 없음)
- 저장되지 않은 변경이 있으면 라우트 이동/탭 이탈/브라우저 종료 시 경고
- `assignments`에는 `startDateKey`, `version`, `versionUpdatedAt`, `ctSentAt`, `ctEscalatedAt`, `ctEscalation*` 같은 보드 전용 필드가 포함된다.
- `PUT /assignment-board-state`와 `PATCH /assignment-board-state/ct`는 assignment 단위 optimistic concurrency를 사용하며, stale version이면 `409 assignment version conflict`를 반환한다.
- UI는 로컬 undo/redo(최대 30단계)만 제공한다. 서버가 과거 스냅샷을 보관해 복원해 주지는 않는다.
- **cards vs assignments 구분**:
  - `cards`: 미배정 풀 (일반 카드 + DELTA 카드). 라인에 아직 배정되지 않은 것. 현재는 `AssignmentCard` 테이블에 저장된다.
  - `assignments`: 라인 타임라인에 배정된 카드. ctStatus, contractedSeconds 등 협의 정보 포함.
- `cards` payload에는 `operatorCtProposal`, `pendingCtProposal`, `ctAgreedSnapshot`, `ctAgreementHistory` 같은 협의 스냅샷/이력 값이 함께 저장될 수 있다.
- DELTA 카드(type='DELTA')는 `AssignmentCard`에만 존재, assignments에는 없음
- `AssignmentBoardState.cards`는 레거시 JSON 필드로 남아 있지만 신규 로직의 읽기 소스로 사용하지 않는다.

### 카드(Card) 개념
- **(수주 × 스타일 × 색상 × 성별) 조합으로 자동 생성되는 배정 단위**
- 같은 스타일·색상이라도 수주가 다르면 별개의 카드로 인식
- 미배정(unassigned pool)과 배정(line timeline) 상태로 구분
- 미배정 카드는 `AssignmentCard` 테이블에 영속 저장되고, 배정 카드는 `AssignmentBoardState.assignments` + `AssignmentPlan`으로 관리된다.
- `GET /assignment-cards`는 `AssignmentCard` 테이블만 읽는다. 조회 시 재계산하지 않는다.
- 카드는 수량 기준으로 분할(split) / 병합(merge) 가능
- 분할 시 새 카드 id가 생겨도 `originOrderId`는 유지한다.
- 병합은 `originOrderId`가 같은 카드/배정끼리만 허용된다.
- `SENT`/`AGREED` 배정은 분할/병합 대상에서 제외된다.
- 카드에 배정된 수량과 수주 수량은 독립적 (수동 관리)

### 수주 수량 변경 시 배정 처리 (정책 확정)
- 수주 수량 변경 시 **해당 수주의 기존 배정은 취소**하고, 변경된 수량 기준으로 **미배정 카드로 재생성**한다.
- 수량이 `0`이면 해당 카드는 제거한다.
- 동일 주문에 매달린 DELTA 카드는 함께 정리하고, 다른 주문의 DELTA 카드는 유지한다.
- 주문 저장 후 서버는 즉시 `AssignmentCard`를 재생성한다. 배정 보드에 이미 올려둔 카드 취소/DELTA 정리는 현재 프론트(`OrderList.jsx`)의 `reconcileBoardStateForQuantityChanges` 저장 흐름과 함께 동작한다.
- 즉, 수량 변경 시 기존 배정 카드의 기간을 늘이거나 줄여 유지하지 않는다.
- 결과적으로 변경분 반영 이후에는 운영자가 다시 배정(라인/시작일 지정)하도록 한다.

---

## 비즈니스 규칙

1. CT(Contracted Time)는 합의 시점에 확정(snapshot)됨 — 이후 PT/AT/ST 변경과 완전히 무관
2. WorkLog/WorkRecord는 직원 퇴사 후에도 보존 (workerId nullable)
3. 작업 배정 계획과 실제 작업 기록은 독립적으로 유지
4. 수주 수량과 배정 카드 수량은 별도 관리 (카드는 수주를 쪼개서 배정)
5. 급여 계산은 WorkRecord의 ctSeconds 기준 — Style.processes 변경 영향 없음
6. 라인 인원 변경 시 해당 라인의 AssignmentBoard capacity 재계산 (트리거 방식)
7. 카드 완료 처리: isCompleted 플래그 + finalQuantity 입력 — CT 동의 후 라인장이 최종 수량 입력. 급여와 무관, 수량 초과 감지용. 완료 처리 시 WorkRecord 누적 수량과 비교하여 초과 여부 표시
8. 초과 공정(WorkRecord 누적 > finalQuantity)도 **급여 지급 대상에 포함**한다.
9. 회계 관리의 `생산 결과` 메뉴는 연결만 되어 있으며, 세부 로직은 추후 구현한다.
10. **ST(q)는 `StyleProcessStandard(styleProcessId, quantity)` 기준점** — `Style.processes[].ct`, `stManual`, `timeRefQuantity`는 레거시 마이그레이션 전 임시 호환 모델
11. **ST 변경 절차**: AT(q)와 현재 ST 차이가 기준 이상이면 "ST 조정 필요" 안내 → 운영팀 검토 후 ST 값을 재설정
12. **구독 상태 SUSPENDED 조직**: API 호출 403 차단. 로그인 자체는 허용되나 데이터 접근 불가

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

---

## Clause 검토용 구현 반영 현황 (2026-02-23)

이 섹션은 정책 설명이 아니라, 현재 코드에 반영된 구현 기준이다.

### 1) ST/PT/AT(q) 반영 상태
- 스타일 공정 입력에서 공통 q(`timeRefQuantity`)를 먼저 지정하고 `PT(q) / AT(q, 자동) / ST(q)`를 표시/입력한다.
  - 파일: `frontend/src/pages/App/style/styleDetail/StyleProcess.jsx`
- 저장 모델은 `StyleProcess + StyleProcessStandard + Style.processes(호환용 미러)`를 사용한다.
  - `StyleProcess`는 `PT(1000)`과 `atParams`를 저장한다.
  - `StyleProcessStandard`는 `q`별 `ST(q)` 기준점을 저장한다.
  - `Style.processes`는 레거시/화면 호환용 미러로만 유지한다.
  - 파일: `backend/prisma/schema.prisma`, `backend/src/index.ts`
- 배정 협의 ST 시드 계산 규칙(코드 기준):
  - 동일 q의 이전 제안 ST(`operatorCtProposal.stSeconds`) 우선
  - 없으면 해당 q의 저장된 `ST(q)` exact match
  - 없으면 `PT(1000)`을 참고해 `ST(q)`를 생성한 뒤 사용
  - `AT(q)`는 참고용으로만 사용하고 자동 fallback하지 않음
  - 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/production/ProductionPlanBoard.jsx`
- 중요: 스타일 화면에서 입력하는 ST는 현재 q에 대한 `stValues[q]`를 직접 수정하는 방식이다.
  - 파일: `frontend/src/pages/App/style/styleDetail/StyleProcess.jsx`, `frontend/src/utils/processTime.js`
- 구버전/혼합 데이터 보정:
  - `stManual`이 비어 있고 `ct≈at`이면 자동 ST로 추정한다(수동 오판 방지).
  - 파일: `frontend/src/utils/processTime.js`, `backend/src/index.ts`

### 2) 생산계획/CT 협의에 ST 규칙 반영
- 생산계획/작업배정 확장 패널 컬럼은 `PT(q) / AT(q) / ST(q) / 제안 CT(q) / 요청 CT(q)`로 구성한다.
  - 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/production/ProductionPlanBoard.jsx`
- PT가 현재 q와 다른 기준으로 저장되어 있으면 `ref q=...`로 fallback임을 명시한다.
- AT 데이터가 없으면 `수집중`으로 표시한다.
- CT 검토 보드도 AT 계산을 공통 유틸(`resolveProcessAtPerPieceSeconds`)로 통일했다.
  - 파일: `frontend/src/pages/App/production/CtReviewBoard.jsx`

### 3) 수량 변경 시 배정 취소/미배정 환원
- 주문 수량 변경 시, 해당 원본 카드(origin)와 연결된 기존 배정을 취소하고 변경 수량으로 미배정 카드를 재생성한다.
- 변경 수량이 `0`이면 해당 카드는 제거한다.
- 동일 주문의 DELTA 카드는 함께 정리하고, 타 주문 DELTA 카드는 유지한다.
- 파일: `frontend/src/utils/quantityChangeBoard.mjs`, `frontend/src/pages/App/order/OrderList.jsx`
- 회귀 테스트로 검증 중:
  - 파일: `scripts/quantity-change-regression.test.mjs`

### 4) 출퇴근 입력 + AT 학습 연동
- 출퇴근 입력 화면/라우트:
  - 라우트: `/attendance`
  - 파일: `frontend/src/router.jsx`, `frontend/src/layouts/MainLayout.jsx`, `frontend/src/pages/App/attendance/AttendanceBoard.jsx`
- 출퇴근 API:
  - `GET /attendance-entries` (일자/월 조회)
  - `PUT /attendance-entries` (해당 일자 데이터 교체 저장)
  - 파일: `backend/src/index.ts`
- AT 학습 시 근무시간 규칙(코드 기준):
  - 입력이 있으면 해당 `workedSeconds` 사용
  - 입력이 없거나 불완전하면 8시간(`28800`) 폴백
  - 학습 기준 월은 매월 5일 컷오프로 계산: 5일 이후면 전월, 5일 이전이면 전전월
  - 파일: `backend/src/index.ts` (`resolveAtTrainingMonthKey`, `syncStyleProcessActualTimesFromWorkRecords`)
- 출퇴근/작업기록 변경 시 AT 동기화가 백그라운드로 재실행된다.
  - 파일: `backend/src/index.ts`

### 5) 생산 결과
- 생산 결과 메뉴의 빈 초기 페이지가 연결되어 있다.
  - 라우트: `/production-result`
  - 페이지: `frontend/src/pages/App/production/ProductionResultBoard.jsx`
- 백엔드 API:
  - `GET /assignment-plan-progress`
  - 파일: `backend/src/index.ts`

### 6) Clause 확인 우선순위(추천)
1. 주문 수량 변경 시 기존 배정이 실제로 사라지고 미배정 카드로 재생성되는지 (`quantity=0` 포함)
2. 스타일 공정에서 `수동 ST/자동 ST`를 여러 번 전환해도 저장/재편집이 일관적인지
3. `stManual=false` 공정이 생산계획 보드에서 AT(q) 기준으로 계산되는지
4. 출퇴근 입력이 없는 데이터에서 AT 학습이 8시간 폴백으로 동작하는지
5. 생산 결과 메뉴 구현 시 권한/라우팅/탭 동작이 기존 회계 관리 흐름과 일관적인지

## AT 모델 현재 구현 단계 (2026-02-25)

- 백엔드 학습 진입점은 `backend/src/index.ts`의 `syncStyleProcessActualTimesFromWorkRecords`이며, 핵심 피팅은 `fitAtParamsWithProportionalAllocation`로 수행한다.
- 학습 단위는 **스타일+공정 조합**이다.
  - 키: `style.uid + process.code` 우선, code가 없으면 `style.uid + process.name`
  - 공정명이 같아도 스타일이 다르면 추정치는 분리된다.
- 학습 입력은 라인×일자 단위 버킷이다.
  - `T_d`: 해당 라인/일자의 총 근무시간(출퇴근 우선, 없으면 8시간 폴백)
  - `q_{d,p}`: 해당 라인/일자/공정 처리 수량
- 피팅 방식(현재 반영):
  - 비례배분 반복 수렴 루프(`w_p <- a_p`)
  - 방향성 가중치(`w_trend`) + 편차 가중치(`w_mag`) 기반 최종 WLS 1회
  - 월간 변경폭 clamp(`a_new`를 `a_old ± ratio` 범위 제한)
  - 제약: `a >= 0`, `b >= 0`; 데이터 부족 시 `b=0` 및 평균 단위시간 fallback
- 저장/반영:
  - `Style.processes[].atParams = { a, b, version, updatedAt, trainedPeriod }`
  - `Style.processes[].at` 필드는 삭제 대상 레거시이며, AT sync는 `atParams`만 갱신한다.
  - `stManual=false` 공정은 AT 동기화 시 `ct`를 PT(`pt`) 기준으로 유지 (AT 신뢰도가 충분해지면 운영자가 수동으로 ST 조정), `stManual=true` 공정은 수동 ST(`ct`) 유지
- 실행 경로:
  - 이벤트 트리거(출퇴근/작업기록 저장)
  - 매월 5일 이후 자동 스케줄러
  - 스케줄러는 DB advisory lock + `SchedulerRunHistory(jobKey, monthKey)`로 중복 실행 방지

## 오늘 반영 메모 (2026-02-23)

- 스타일 공정 기준 수량 `q` 기본값은 `1000`이다.
- `q`는 기준 표시값이며, PT/AT/ST 자체를 `q` 배수로 스케일하지 않는다. (시간값은 1개 작업 기준)
- 제조사 스타일 저장 API에 공정 중복 방어를 추가했다.
  - 대상: `POST /styles`, `PUT /styles/:styleId`, `POST /styles/import`
  - 기준: `code`(trim+upper) 우선, code가 없으면 `name`(trim+lower)
- 생산관리 용어를 `CT 조정 검토`에서 `배정 결과`로 정리했다. (메뉴/화면 타이틀)

## 오늘 반영 메모 (2026-02-24)

- 작업 배정 보드는 자동 저장을 제거하고 수동 저장으로 전환했다. 상단에 `저장됨/저장 안됨/저장 중` 상태를 표시한다.
- 저장되지 않은 변경이 있으면 화면 이탈 시 확인 경고를 띄운다. (`useBlocker`, `useBeforeUnload`)
- 미배정 카드는 주문 단위로 그룹화해 가로 배치하며, 그룹 헤더에 납기일을 표시하고 납기일 오름차순으로 정렬한다.
- 라인 목록은 LineAssignment 기준 실제 배정 인원으로 계산하며, 배정 인원 0명 라인은 작업 배정에서 제외한다.
- 작업 배정 우클릭 메뉴는 `업무 상세`, `수량 분할`로 통일했다.
- 운영팀의 변경 요청 대응 액션을 `요청 동의 / 다시 제안 / 배정 취소` 3가지로 분리했다.
- `다시 제안`은 제안 CT가 실제로 수정된 경우에만 활성화되고, 제안 CT를 수정한 상태에서는 `요청 동의`가 비활성화된다.
- 작업 계획 협의 화면에서 라인장(WORKER)은 본인이 관리하는 라인(`managedOnly`)만 조회한다.
- 작업 기록은 공장 선택 후 라인 선택이 필수이며, 선택한 작업일 기준으로 해당 라인 소속 작업자만 저장 가능하다.
- 작업 기록 저장은 CT 동의된 배정 카드 기준으로만 허용하고, 공정 수량은 비정상적으로 큰 값(기준 수량의 과도한 배수)을 제한한다.
- 탑바 빈 공간 클릭은 무반응이며, 현재 `BARO` 텍스트 버튼도 화면 전환 동작이 없다.
- 생산관리 비용 표기는 `동(VND)` 기준으로 표기한다.

## 오늘 반영 메모 (2026-02-25)

- 작업 배정/작업 계획 협의 확장 테이블은 `PT(q), AT(q), ST(q), 제안 CT(q), 요청 CT(q)`를 표시한다.
- 공간 문제로 확장 테이블의 `주문 공임`, `기간` 칼럼은 제거했다.
- `PT(q)`는 정확히 같은 q가 아니면 `ref q=...` 라벨로 fallback 사실을 노출한다.
- `AT(q)` 데이터가 없으면 `수집중`으로 표시한다.
- AT 학습에 비례배분 반복 수렴 루프, 방향성 가중치(`w_trend`), 월간 변경폭 clamp를 반영했다.
- 운영팀 제안 송부/합의는 `AssignmentPlan`만 갱신하며, 스타일 ST에는 역방향 기록하지 않는다.
- CT 저장 정책:
  - 제안 송부(`SENT`): `proposalSeconds` 저장, `contractedSeconds=null`
  - 요청 동의(`REJECTED -> AGREED`): `proposalSeconds`는 보존, `contractedSeconds`만 최종값으로 확정
- ST는 CT 합의 결과로 자동 갱신되지 않는다.
- CT는 카드 단위 스냅샷이므로 `ctVersion`, `ctUpdatedAt` 별도 필드/전용 UI를 두지 않는다.
- 서버 시작 시 DB 연결 재시도(`STARTUP_DB_MAX_RETRIES`, `STARTUP_DB_RETRY_DELAY_MS`)를 추가했다.
- CT 제안/합의는 `AssignmentPlan`에만 기록한다. `Style.processes[]` 또는 향후 `StyleProcessStandard`에 CT 결과를 역반영하지 않는다.
- 라인장 작업 계획 협의 화면의 `완료 처리` 기능(UI/클라이언트 로직)은 제거하고, 해당 화면은 CT 협의에만 집중한다.

## 문서 정합성 교정 우선본 (2026-02-23)

아래 항목은 기존 본문 서술과 충돌하더라도 **이 섹션을 우선 적용**한다.

### PayrollSnapshot 스키마 정합성
- 실제 스키마 기준 필드:
  - `month` (YYYY-MM)
  - `data` (JSON)
  - `lockedAt` (DateTime)
  - `lockedBy` (String)
- 문서에서 사용된 `yearMonth`, `isLocked` 표현은 레거시 표기로 간주한다.

### AssignmentPlan의 ctOverride 정합성
- `ctOverride`는 `AssignmentPlan` DB 컬럼이 아니다.
- 현재 `ctOverride`는 보드 상태 JSON(`AssignmentBoardState.assignments`) 병합 시점의 상태값이다.
- DB 영속 상태 판단은 `ctStatus + ctSource + contractedSeconds` 조합을 기준으로 한다.

### ST/AT 저장 정책 정합성
- `stManual=false` 공정은 AT 동기화 시 DB `ct`를 PT(`pt`)로 설정한다 (AT를 자동으로 ST에 반영하지 않음).
- `stManual=true` 공정은 수동 ST(`ct`)를 유지한다.
- AT 신뢰도가 충분해지면 운영자가 직접 ST를 수정한다.

### AT 학습 실행 정책 정합성
- 이벤트 트리거(출퇴근/작업기록 저장) + 자동 스케줄러 병행으로 동기화한다.
- 자동 스케줄러는 DB 락 + 월 실행 이력 기반으로 해당 학습월의 중복 실행을 제어한다.

## 공유 상태 색상 팔레트

생산계획 카드 상태 라벨, AT 신뢰도 칩 등 여러 곳에서 일관되게 사용하는 팔레트.
새 UI 컴포넌트에 상태 색상이 필요하면 이 팔레트를 재사용할 것.

| 상태 키  | 의미 | 배경(bg)    | 텍스트(text) | 테두리(border rgba)          |
|---------|------|------------|-------------|------------------------------|
| PENDING | 대기  | `#EBEBF0` | `#747484`   | `rgba(116, 116, 132, 0.35)` |
| SENT    | 제안  | `#BFEAD0` | `#268444`   | `rgba(38, 132, 68, 0.35)`   |
| AGREED  | 확정  | `#C8DFF7` | `#3674B4`   | `rgba(54, 116, 180, 0.4)`   |
| REJECTED| 요청  | `#F7DCC8` | `#AC6424`   | `rgba(172, 100, 36, 0.35)`  |

AT 신뢰도 팔레트 매핑(현재 코드 기준):
- COLLECTING → neutral gray (`#EBEBF0` / `#747484`)
- UNRELIABLE → red (`#F5D0D5` / `#B42318`)
- INSUFFICIENT → orange (`#F7DCC8` / `#AC6424`)
- USABLE → yellow (`#F5E7B2` / `#8A6100`)
- TRUSTED → green (`#BFEAD0` / `#268444`)
- VERIFIED → blue (`#C8DFF7` / `#3674B4`)

사용 파일:
- `frontend/src/pages/App/production/ProductionPlanBoard.jsx` — `AT_RELIABILITY_COLOR`
- `frontend/src/pages/App/assign/AssignBoard.jsx` — `AT_RELIABILITY_COLOR`
- `frontend/src/pages/App/style/StyleBoard.jsx` — `AT_RELIABILITY_PALETTE`
- `frontend/src/pages/App/style/styleDetail/StyleProcess.jsx` — `AT_RELIABILITY_PALETTE`

## 오늘 반영 메모 (2026-03-05)

- `formatSeconds`는 소수점 없이 정수로 표시한다 (`Math.round` 적용).
- **ST 자동 갱신 정책 변경**: `stManual=false` 공정은 AT 동기화 시 CT를 AT로 덮지 않고 PT 기준으로 유지한다. 운영자가 AT 신뢰도를 확인 후 직접 ST를 수정하는 수동 운영 방식으로 전환.
- **AT 신뢰도 배지 추가**:
  - 스타일 목록(`StyleBoard`): AT 값 오른쪽에 스타일 전체 공정의 집계 신뢰도 Chip 표시.
  - 스타일 상세(`StyleProcess`): AT(q) 컬럼 헤더 오른쪽에 동일 집계 신뢰도 Chip 표시.
  - 신뢰도 단계/색상 키: COLLECTING=default, UNRELIABLE=error, INSUFFICIENT=warning, USABLE=info, TRUSTED=success, VERIFIED=primary.
  - 스타일 신뢰도는 공정별로 계산한 뒤 공정별 AT 기여시간 가중 평균 퍼센트로 집계한다.
- AT 학습 기준월: 오늘(5일 이상)이면 전월 데이터 사용. 샘플 데이터가 현재월(3월)에 있으면 `POST /at-sync/run-now { trainingMonthKey: "YYYY-MM" }`으로 강제 학습 가능.


---

## 개발 환경 설정

### 새 환경에서 최초 셋팅 순서 (AI가 이 순서대로 진행)
1. `backend/.env` 파일 생성 (아래 내용 그대로)
2. `frontend/.env` 파일 생성 (아래 내용 그대로)
3. 의존성 설치: `npm install` (루트에서 실행 — frontend/backend 동시)
4. Prisma 클라이언트 생성: `cd backend && npx prisma generate`
5. 실행: 루트에서 `npm run dev`
   - `predev` 스크립트가 자동으로 `scripts/fix-prisma-client-entry.js` 실행 후 서버 시작

### 실행
```bash
npm run dev
```
프론트: http://localhost:5173 / 백엔드: http://localhost:4000

### Supabase 프로젝트
- 프로젝트명: `lineos`
- 프로젝트 ref: `mqohhiufmjnfuhxpfwkn`
- 리전: ap-northeast-2 (Seoul)
- 대시보드: https://supabase.com/dashboard/project/mqohhiufmjnfuhxpfwkn

### backend/.env
```
DATABASE_URL="postgresql://postgres.mqohhiufmjnfuhxpfwkn:DxAwGN7yXNhV0dqw@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
PORT=4000
BUSINESS_TIME_ZONE=Asia/Seoul
WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER=3
```

### frontend/.env
```
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://mqohhiufmjnfuhxpfwkn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_I5v2Y8rVxnX7VDm6-3Goog_nlViC8KX
```

### 코드 수정사항 (이미 적용됨, 새 환경에서 확인)
- `backend/src/index.ts:17` → `dotenv.config({ override: true });` (dotenv v17 필수)

### DB 비밀번호 재설정이 필요한 경우
Supabase 대시보드 → Project Settings → Infrastructure → Database password → Reset
재설정 후 `backend/.env`의 `DATABASE_URL` 비밀번호 부분과 이 문서의 `backend/.env` 섹션 동시 업데이트.

### 주의사항
- Transaction pooler 포트: **6543** (Session pooler: 5432)
- dotenv v17은 `override: true` 필수 (위 코드 수정사항 참고)
- DB 연결 실패 시 Windows DNS를 Cloudflare(1.1.1.1)로 변경 후 재시도

---

## 오늘 반영 메모 (2026-03-01)

### 작업 배정 보드 — 핵심 구조 변경

#### startDateKey 절대 날짜 추적
- 각 assignment는 `startDateKey: "YYYY-MM-DD"` 필드로 절대 날짜를 보관한다.
- viewStart 네비게이션 시 `oldBase + currentStartIndex`로 절대 날짜를 재계산하고 `newDays`에서 새 인덱스를 탐색한다.
- 뷰 범위 밖 카드는 음수/초과 인덱스를 가질 수 있으며 `assignmentsForRender` 필터(`0 <= startIndex < days.length`)로 제외된다.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`

#### 로드 시 손상된 startIndex 복구
- 이전 버그로 저장된 대형 startIndex(예: 200+) 보정 로직을 `loadSourceData` 내부에 추가했다.
- 복구 순서: `startDateKey`로 `restoreDays`에서 재매핑 → 실패 시 `[0, rdCount-1]` 클램핑.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx` (loadSourceData 함수 내 normalizedRestoredAssignments 처리 직후)

#### 드래그 드롭 타겟 감지 통일
- 인디케이터(`onDragMove`)와 실제 드롭(`onDragEnd`) 모두 **커서 위치 기준**으로 타겟을 탐색한다.
- 기존: `onDragEnd`는 dnd-kit `event.over` (rect intersection)으로 타겟 결정 → 인디케이터와 불일치 버그.
- 수정: `assign-drop-{id}` 위에 드롭 시 `detectedAssignment.startIndex + Math.floor(relPos * spanDays)`로 커서의 절대 날짜를 계산 후 `getTargetOnDay`로 실제 타겟 재탐색.
- `dropBeforeTarget`는 `dayIndex < (targetOnDay.startIndex + targetOnDay.endIndex + 1) / 2`로 판단.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx` (handleDragEnd, assign-drop 분기)

#### ScheduleTimeline z-index 스택
| 레이어 | zIndex |
|---|---|
| DropCell (배경 셀) | 0 |
| AssignBar (일반) | 20 |
| AssignBar (연결 가능, showLinkPrev=true) | appBar+3 = 1103 |
| 커서 컬럼 하이라이트 오버레이 | 1104 |
| 삽입 인디케이터 (세로선) | 1200 |
- 하이라이트와 인디케이터는 카드 위에 표시되어야 하므로 1103 이상의 zIndex가 필요하다.
- 파일: `frontend/src/pages/App/assign/components/ScheduleTimeline.jsx`

### CT 전송 성능 개선

#### PATCH /assignment-board-state/ct (신규 경량 엔드포인트)
- 요청: `{ assignmentId, assignmentPatch, cardId?, cardPatch? }` — 변경된 필드만 전송
- 처리: 기존 상태 읽기 → 해당 항목만 패치 → 전체 상태 쓰기 → 변경 plan 1건만 동기화
- 응답: `{ ok, assignment, card, updatedAt, serverNow }` — 변경된 항목만 반환
- 기존 PUT 대비 DB 쿼리 8+ → 5개로 감소, 인증 조회 2건 제거
- 파일: `backend/src/index.ts`

#### 프론트 CT 액션 경량화
| 액션 | 이전 | 이후 |
|---|---|---|
| 제안 송부 (SENT), reflow 없음 | PUT 전체 payload | PATCH 경량 |
| 제안 송부 (SENT), reflow 있음 | PUT 전체 payload | PUT fallback 유지 |
| 요청 동의 (AGREED) | PUT 전체 payload | PATCH 경량 (항상) |
| 배정 취소 | PUT 전체 payload | DELETE 경량 (`/assignment-board-state/assignment/:assignmentId`) |
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx` (`handleSendProposalToLineLeader`, `handleAgreeLineRequest`, `handleCancelAssignmentFromLineRequest`)

#### updatePlanRows 병렬화
- 기존: `for...of` 순차 `await prisma.assignmentPlan.update(...)` → N번 DB 왕복
- 수정: `Promise.all(updatePlanRows.map(...))` 병렬 실행
- 파일: `backend/src/index.ts` (PUT /assignment-board-state 핸들러 내부)

### 상태 토글 경량화 원칙 (2026-03-06)
- 완료/미완료 같은 **단순 상태 토글**은 기본적으로 `단건 mutation + 해당 row 로컬 상태 반영`으로 처리한다.
- 상태 토글 직후 **전체 보드 재조회**(`refreshBoardState`)와 **전체 진행률 재집계**(all assignment `groupBy`)는 기본 금지한다.
- 진행률/파생값 동기화가 필요하면 **해당 assignment 1건만** 재조회한다.
- 전역 로딩 오버레이는 긴 네트워크 작업에서만 사용하고, 단건 토글 요청에는 버튼 단위 busy 표시를 우선한다.
- 위 원칙을 벗어나는 구현은 요구사항(정합성/감사/통계) 근거를 코드 주석 또는 PR 설명에 명시해야 한다.

## 오늘 반영 메모 (2026-03-02)

### AssignmentBoardState 동시 수정 충돌 방지
- 보드 assignment는 `version`, `versionUpdatedAt`를 가진다.
- 전체 저장(`PUT /assignment-board-state`)과 CT 부분 저장(`PATCH /assignment-board-state/ct`) 모두 assignment별 optimistic concurrency를 사용한다.
- stale payload로 저장하면 서버가 `409 assignment version conflict`를 반환하고, 프론트는 사용자에게 새로고침/최신 상태 반영 메시지를 보여준다.
- 파일: `backend/src/index.ts`, `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/production/ProductionPlanBoard.jsx`

### SENT 48시간 초과 자동 에스컬레이션
- `ctStatus='SENT'`이고 `ctSentAt` 기준 48시간이 지나면 서버가 자동으로 `ctEscalatedAt`, `ctEscalationReason='SENT_TIMEOUT_48H'`, `ctEscalationTargetRole='ADMIN'`, `ctEscalationStatus='OPEN'`을 부여한다.
- 이 처리는 `GET /assignment-board-state`, `PATCH /assignment-board-state/ct`, `PUT /assignment-board-state` 경로에서 공통으로 반영된다.
- 작업 배정 상세 패널에는 "48시간 초과 관리자 검토" 경고가 표시된다.
- 파일: `backend/src/index.ts`, `frontend/src/pages/App/assign/AssignBoard.jsx`

### 확정 배정 재협의 개시
- `AGREED` 상태 배정은 관리자만 `재협의 개시`할 수 있다.
- 재협의 개시 시 `ctStatus='PENDING'`, `ctSource='REOPENED_BY_ADMIN'`으로 되돌리고, 기존 합의 정보는 카드의 `ctAgreementHistory`에 아카이브한다.
- 서버 `PUT /assignment-board-state`도 `AGREED -> 비AGREED` 전환을 관리자만 허용한다.
- 현재 경량 `DELETE /assignment-board-state/assignment/:assignmentId` 경로에는 상태별 권한 검증이 없어, UI는 `REJECTED` 검토 흐름에서만 이 엔드포인트를 사용한다.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `backend/src/index.ts`

### 작업 배정 보드 편집 규칙 보정
- `SENT`/`AGREED`는 분할/병합/초기화에서는 잠금이지만, 드래그는 완전 잠금이 아니다.
- `AGREED`는 다른 라인 이동과 보드 밖 제거만 막고, 같은 라인 내 날짜 이동은 현재 허용된다.
- `SENT`는 현재 코드상 타임라인 이동과 보드 밖 제거가 가능하다.
- `초기화` 버튼은 전체 배정을 비우지 않고 `SENT`/`AGREED`만 남긴다.
- 보드 상단에 `되돌리기 / 다시하기 / 초기화`가 있으며 undo/redo는 로컬 30단계 히스토리다.
- **REJECTED 카드는 자동 리플로우에서 위치 고정**: 변경 요청 진행 중인 카드(ctStatus='REJECTED')를 리플로우 시 밀어내지 않기 위해 `reflowAssignmentsByLineCapacity`에서 `isPositionFixed` 조건으로 큐에서 제외한다. 드래그는 여전히 가능하다.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`

### 드래그앤드롭 성능 최적화
- `PointerSensor`에 `activationConstraint: { distance: 5 }` 설정 — 5px 이상 이동해야 드래그 시작 (불필요한 드래그 이벤트 제거)
- 드래그 중 하이라이트 + 프리뷰 상태를 `dragState = { hoveredTarget, dragPreview }` 하나로 통합 — 매 프레임 렌더 2회 → 1회
- 드래그 카드 너비(`ghostWidthPx`)를 `onDragStart`에서 1회만 계산 후 ref에 캐시 (`ghostWidthPxRef`) — onDragMove 내 O(n) 배열 탐색 제거
- `AssignBar`의 `setNodeRef`를 `useCallback`으로 감싸 드래그 중 불필요한 ref 재등록 방지
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/assign/components/ScheduleTimeline.jsx`, `frontend/src/pages/App/assign/components/AssignBar.jsx`

### ProductionPlanBoard DELTA 카드 처리
- DELTA 카드는 생산계획/작업 계획 협의 보드에서만 처리한다.
- `PLUS` DELTA는 새 라인에 직접 배정하거나, 동일 고객사/스타일(or styleId)/색상/성별의 기존 미완료 배정에 흡수할 수 있다.
- `MINUS` DELTA는 동일 조건의 기존 미완료 배정에서 수량을 차감한다. 차감 결과 수량이 `0`이면 해당 배정은 삭제된다.
- 수주 수량 변경 후 보드 재구성 시 **같은 주문의 DELTA 카드만** 함께 정리한다.
- 파일: `frontend/src/pages/App/production/ProductionPlanBoard.jsx`, `frontend/src/utils/quantityChangeBoard.mjs`, `frontend/src/pages/App/order/OrderList.jsx`

## 오늘 반영 메모 (2026-03-03)

### WorkOrder.items JSON → WorkOrderItem 테이블 분리 (FK 연결)

#### 배경
- 기존 `WorkOrder.items`는 `Json?` 필드로 색상/스타일/수량 데이터를 저장해 `AttrColor`와 실질적 FK 관계가 없었다.
- 색상 코드/이름을 수정해도 기존 주문 데이터에 반영되지 않아 일관성 문제 발생했다.
- `WorkRecord`도 `colorId`, `processCode`를 단순 값으로 저장해 동일한 문제.

#### 변경 내용

**DB/스키마**
- `WorkOrderItem` 테이블 신규 생성: `workOrderId` → `WorkOrder` FK (onDelete: Cascade), `colorId` → `AttrColor` FK (onDelete: SetNull)
- `WorkOrder.items Json?` 컬럼은 하위호환을 위해 유지 (향후 별도 마이그레이션으로 DROP 예정)
- `WorkRecord`에 `processId Int?` 컬럼 추가: `AttrProcess` FK (onDelete: SetNull)
- `WorkRecord.colorId` → `AttrColor` FK 추가 (onDelete: SetNull), 고아 colorId는 NULL 처리 후 FK 적용
- 마이그레이션: `backend/prisma/migrations/20260303000000_work_order_item_fks/migration.sql` (STEP 1-5)
  - STEP 2: 기존 `WorkOrder.items` JSON → `WorkOrderItem` 행으로 데이터 이전 (PL/pgSQL)
  - STEP 4: `processCode` → `AttrProcess` 조회해 `processId` 초기값 채우기
- 마이그레이션은 `prisma migrate` CLI 미사용(DIRECT_URL 미설정) → Node.js `$executeRawUnsafe` 스크립트로 실행

**백엔드 (index.ts)**
- `workOrderItemToItemShape(row)` 헬퍼: `WorkOrderItem` 행 → 기존 `items` 배열 원소 형태로 변환 (프론트 호환)
- `toOrderResponse`: `order.workOrderItems`가 있으면 우선 사용, 없으면 `order.items` JSON 폴백
- `GET /orders`: `include: { workOrderItems: { orderBy: { sortOrder: 'asc' } } }` 추가
- `POST /orders` (`createOrReuseSharedOrder`): WorkOrder 생성 후 `workOrderItem.createMany()` 병렬 저장
- `PUT /orders/:orderId`: 트랜잭션 내에서 `workOrderItem.deleteMany()` + `createMany()` 전체 교체
- `POST /orders`, `PUT /orders/:orderId`, `DELETE /orders/:orderId` 후 관련 조직의 `AssignmentCard`를 즉시 재생성
- `POST /styles`, `PUT /styles/:styleId`, `POST /styles/import` 후 관련 조직의 `AssignmentCard`를 즉시 재생성
- `GET /assignment-cards`: `AssignmentCard` 테이블만 조회
- `loadAssignmentDisplayReferenceMaps`, `buildAssignmentCardsFromOrders`: `workOrderItems` 우선 사용
- `DELETE /styles/:styleId`: `WorkOrder.items` JSON 순회 → `WorkOrderItem.findFirst({ where: { styleId } })` 쿼리로 교체
- `POST/PUT /work-logs`: `processCode` 목록으로 `AttrProcess` 일괄 조회 → `processId` Map 생성 → `WorkRecord.createMany` 시 `processId` 자동 채우기

**속성 관리 (AttrBoard.jsx)**
- 각 섹션 카드를 `code` 오름차순으로 정렬해 표시
- `TableContainer` `maxHeight: 374` + `overflow: 'auto'` + `stickyHeader`로 10개 내외 스크롤 뷰 적용

**DEFAULT_ATTRIBUTES 초기화 방지**
- `backend/src/index.ts`의 `DEFAULT_ATTRIBUTES.colors`를 빈 배열 `[]`로 변경 → `GET /attributes` 시 색상 재시드 방지
- 색상은 더 이상 조직별 기본값이 아니라 DB 공통 마스터(`AttrColor`)로만 관리

## 오늘 반영 메모 (2026-03-04)

### 성능 개선 — 로딩 속도 3개 이슈 수정

#### 이슈 1: assignment repair 쿼리 사전 체크
- `assignmentPlanNeedsDisplayRepair(plan)` 헬퍼 추가: orderNo/customer/label/colorName 중 하나라도 비거나 corruption regex(`\?{2,}|<U+FFFD>`) 매칭 시 true 반환
- `/assignment-plans` GET, `/assignment-board-state` GET 두 곳에서 `plans.some(assignmentPlanNeedsDisplayRepair)` 조건 추가
- 효과: display 필드가 이미 정상이면 `loadAssignmentDisplayReferenceMaps`(workOrder + style 전체 조회 2개) 완전 스킵
- 파일: `backend/src/index.ts`

#### 이슈 2: AssignBoard 상호작용 리렌더링 최적화
- `ScheduleTimeline`에 `memo()` 추가 — activeDrag/searchTerm/contextMenuState 등 무관 state 변경 시 타임라인 리렌더링 차단
- `handleDragEnd` (5300줄 근처)에 `useCallback` 누락 보완 → DndContext에 안정적 참조 전달
- `handleLinkPrev`에 `useCallback` 누락 보완 → ScheduleTimeline의 memo 효과를 살림
- `useAssignBoardDnd` 훅 분리 (`sensors`, `handleDragStart`, `handleDragCancel`) — cardsRef/assignmentsRef 사용으로 컴포넌트 최상단에서 호출 가능
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/assign/components/ScheduleTimeline.jsx`, `frontend/src/pages/App/assign/hooks/useAssignBoardDnd.js`

#### 이슈 3: GET 캐시 선택적 무효화
- `CACHE_INVALIDATION_MAP`: mutation 경로별 무효화할 GET 캐시 prefix 목록 정의
- `invalidateCacheByPath(mutationPath)`: 매핑된 prefix만 삭제, 매핑 없는 경로는 기존처럼 전체 삭제(fallback)
- POST/PUT/DELETE 시 `getResponseCache.clear()` → `invalidateCacheByPath(path)` 교체
- 효과: 보드 저장(PUT /assignment-board-state) 후 /factories, /lines, /line-workers 등 무관 캐시 유지
- 파일: `frontend/src/utils/apiClient.js`

## 오늘 반영 메모 (2026-03-10)

### 작업 카드 저장 구조 단순화
- `AssignmentCard` 테이블을 추가해 미배정 카드의 소스 오브 트루스를 JSON이 아닌 테이블로 분리했다.
- `PUT /assignment-board-state`, `PATCH /assignment-board-state/ct`, `DELETE /assignment-board-state/assignment/:assignmentId`는 카드 변경분을 `AssignmentCard`에 동기화한다.
- `GET /assignment-board-view`, `GET /assignment-board-state`, `GET /assignment-plans`는 카드 조회 시 `AssignmentCard`를 사용한다.
- `GET /assignment-cards`는 조회만 수행한다. 카드 재생성은 주문/스타일/색상 변경 시점에 즉시 실행한다.
- `AssignmentBoardState.cards`는 더 이상 읽기 소스로 사용하지 않는다. 레거시 컬럼으로만 남겨둔다.

### 공통 색상 마스터
- `AttrColor`는 조직별 속성이 아니라 전 조직이 함께 쓰는 공통 마스터다.
- `/attributes`의 `colors`는 조직 구분 없이 동일한 목록을 반환한다.
- 색상 수정 시 `WorkOrderItem.colorCode`, `WorkRecord.colorCode`, `AssignmentCard`를 같이 맞춘다.

### 직원 관리 규칙 정리

#### 권한/직무/급여타입 정책
- `관리자(ADMIN)`, `운영자(OPERATOR)`, `회계사(ACCOUNTANT)`는 권한명 자체를 직무로 간주한다.
- 비작업자 3종은 별도 작업자 직무를 선택하지 않는다.
- 작업자(`WORKER`)만 작업자 직무(`재단/봉제/다림/검수/포장/기타`)를 선택한다.
- 기본 급여타입은 `봉제(WORKER_SEWING)=CT`, 그 외 전부 `FIXED`다.
- 직원 관리 화면의 급여 타입은 `기본값 사용` 옵션을 제거하고 항상 명시값(`CT`/`FIXED`)으로 저장한다.
- 기존 직원 데이터도 전부 명시값으로 DB 백필했다. 현재 로컬 기준 `null payType = 0건`.

#### 공장 권한/필터 정책
- 운영자는 본인 소속 공장 직원만 수정 가능하다.
- 관리자는 전체 공장 또는 특정 공장 필터로 조회/수정 가능하다.
- 직원 관리 화면의 공장 필터는 페이지 상단 우측이 아니라 **직원 목록 카드 제목 줄 우측**으로 이동했다.
- 카드 제목 우측에 따로 표시되던 선택 공장명 텍스트는 제거했다. 필터 UI 하나만 남긴다.

#### 구현 메모
- 서버에서 비작업자 `roleId`는 비우고, 작업자만 유효 작업자 직무를 유지한다.
- 작업자 직무가 비어 있거나 잘못 연결된 경우 기본값은 `WORKER_SEWING`으로 보정한다.
- `/attributes`의 `roles` 응답은 현재 작업자 직무 하드코딩 목록만 내려준다.

### 다국어 준비용 정규화 밑작업

> **중요 원칙**: 실제 다국어(i18n) 적용은 **맨 마지막 단계**에서 진행한다.  
> 이번 작업은 다국어를 바로 붙이기 위한 **선행 정규화 / anchor 준비 작업**이다.

#### 이번에 정리한 기준
- 다른 테이블을 참조할 때는 번역 가능한 문자열(name)을 직접 저장하지 말고, **ID FK를 anchor**로 사용한다.
- 상태값은 한국어 문자열이 아니라 **enum/code 값**으로 저장한다.
- 화면/API 호환 때문에 필요한 표시 문자열은 JOIN/유도값으로 응답하고, DB 저장 기준은 FK/code로 정리한다.

#### 이번에 반영한 스키마 정규화
- `WorkOrder.status`를 한국어 문자열에서 `WorkOrderStatus` enum으로 변경
  - `ORDER_RECEIVED`, `IN_PROGRESS`, `PRODUCTION_DONE`, `SHIPPED`
- `AssignmentPlan.ctStatus`를 `CtStatus` enum으로 변경
  - `PENDING`, `SENT`, `AGREED`, `REJECTED`
- 번역 anchor FK 추가
  - `WorkOrderItem.styleUid -> Style.uid`
  - `AssignmentPlan.colorId -> AttrColor.id`
  - `WorkRecord.styleUid -> Style.uid`
- 중복 문자열 제거
  - `WorkOrderItem.colorName` 제거
  - `WorkRecord.processName` 제거
  - `WorkRecord.colorName` 제거

#### 중요한 예외 / 설계 메모
- `WorkOrderItem.styleId`, `WorkRecord.styleId`는 현재 시스템에서 비즈니스 키 문자열로 넓게 사용 중이다.
- 따라서 스타일 번역/참조의 실제 anchor는 `styleId` 문자열이 아니라 **새 정수 FK `styleUid`** 로 본다.
- `styleId` 문자열은 당분간 외부 식별/호환용으로 유지한다.
- 스냅샷 성격의 문자열(`buyerOrgName`, `sellerOrgName`, `customerName`, `factoryName`, `workerName`)은 히스토리 보존 목적이 있으므로 성급히 제거하지 않는다.

#### 현재 호환성 정책
- DB에는 enum/FK 중심으로 저장한다.
- API 응답은 기존 화면이 깨지지 않도록 `styleName`, `colorName`, `processName`을 JOIN 결과로 복원해서 내려준다.
- 주문 상태는 DB/API 모두 코드값을 사용하고, 프런트에서 한글 라벨로 매핑한다.

#### 기존 데이터 백필 상태
- `WorkOrder.status` 기존 한국어 값은 enum 코드로 전환 완료
- `AssignmentPlan.ctStatus` 기존 문자열은 enum으로 전환 완료
- `WorkOrderItem.styleUid`는 현재 로컬 데이터 `16/16`건 연결 완료
- `AssignmentPlan.colorId`는 현재 로컬 데이터 `6/6`건 연결 완료
- `WorkRecord`는 현재 로컬 데이터가 `0건`이라 styleUid 백필 대상은 없었다

#### 다국어 실제 개발 시 참고 모델
- 속성 번역은 FK 기준 번역 테이블로 붙인다.
  - 예시: `AttrColorTranslation(colorId, locale, name)`
  - 예시: `AttrProcessTranslation(processId, locale, name)`
  - 예시: `AttrRoleTranslation(roleId, locale, name)`
- 상태값(enum)은 번역 테이블보다 **코드 -> locale 라벨 매핑**으로 처리하는 편이 단순하다.
- 스타일명처럼 번역 대상이 실제로 필요한 경우에만 `StyleTranslation(styleUid, locale, name)` 같은 구조를 별도 검토한다.
- 스냅샷 문자열은 번역 대상이 아니라 **당시 입력값 보존 데이터**로 취급한다.

#### 다국어 구현 순서 (나중에 마지막 단계에서)
1. 프런트 locale 인프라와 공통 label 레이어 도입
2. 번역 대상 마스터의 translation 테이블 추가 + 기본 `ko` 데이터 시드
3. 백엔드 응답을 locale 기준 JOIN/매핑하도록 확장
4. 프런트 하드코딩 한글 라벨을 locale key 기반으로 치환
5. 필요 시 번역 관리 UI를 마지막에 추가

#### 검증 메모
- `backend` TypeScript 빌드 통과
- `frontend` Vite 빌드 통과
- HTTP smoke test:
  - `/orders`
  - `/assignment-plans`
  - `/work-logs`
  - `/payroll`
  모두 정상 응답 확인

## 오늘 반영 메모 (2026-03-05)

### 급여 계산 1차 구현

#### 화면/동작
- 급여 계산 화면을 1차 실사용 형태로 확장했다.
- 메인 표는 `직원 / 급여 구분 / 기준 급여 / 보너스 / 공제 / 최종 급여 / 상세` 구조다.
- `FIXED` 직원은 기준 급여를 수동 입력한다.
- `CT` 직원은 서버 계산값을 기준 급여로 사용한다.
- 모든 직원은 `보너스`, `공제`를 입력할 수 있고 최종 급여는 `기준 급여 + 보너스 - 공제`로 계산한다.
- 확정 상태에서는 입력이 잠기고, 관리자만 `확정 취소`를 할 수 있다.
- 공정 상세는 `공정 / 수량 / 총 CT초 / 적용 평균단가 / 급여`를 표시한다.
- 파일: `frontend/src/pages/App/payroll/PayrollEntry.jsx`, `frontend/src/pages/App/payroll/PayrollBoard.jsx`

#### 백엔드 응답/스냅샷
- `GET /payroll`은 작업기록이 없는 `FIXED` 직원도 응답에 포함한다.
- 비작업자(`관리자/운영자/회계사`)도 급여 화면에서 직무명이 비지 않도록 권한명 기반 직무 라벨을 같이 내려준다.
- 응답 employee 항목은 다음 필드를 포함한다.
  - `employeeKey`
  - `baseEarnings`
  - `fixedSalary`
  - `bonus`
  - `deduction`
  - `finalEarnings`
  - `bankName`
  - `bankAccountNumber`
- 공정 상세 항목은 `totalCtSeconds`, `wagePerSecond`, `totalEarnings`를 포함한다.
- `POST /payroll/lock`은 위 구조를 정규화해서 스냅샷 JSON으로 저장한다.
- `DELETE /payroll/snapshots/:month`를 추가해 확정 취소를 지원한다. 권한은 `ADMIN`만 허용한다.
- 파일: `backend/src/index.ts`(기존 구현), 이후 `backend/src/payroll/*`로 분리 시작

#### 검증 메모
- `backend` 빌드 통과
- `frontend` 빌드 통과
- HTTP smoke test:
  - `GET /payroll?orgId=2&month=2026-03` → `200`, 직원 `43명`, `FIXED 3명` 포함 확인
  - `POST /payroll/lock`
  - `GET /payroll`
  - `DELETE /payroll/snapshots/:month`
  순서로 확정/재조회/취소 정상 확인

### 급여 계산 메뉴 접근 권한 수정
- 운영자(`OPERATOR`)도 `회계 관리 > 급여 계산` 메뉴를 볼 수 있도록 프론트 접근 제어를 수정했다.
- 기존에는 `ADMIN`, `ACCOUNTANT`만 허용되어 운영자 로그인 시 메뉴가 숨겨졌다.
- 수정 후 `PAYROLL` feature 접근 권한은 `ADMIN`, `OPERATOR`, `ACCOUNTANT`다.
- 파일: `frontend/src/utils/accessControl.js`

### 백엔드 구조 정리 시작

#### 이번에 실제로 분리한 모듈
- Prisma 싱글톤 분리
  - `backend/src/db.ts`
- env 초기화 분리
  - `backend/src/config/env.ts`
- 공용 헬퍼 분리
  - `backend/src/utils/common.ts`
  - `backend/src/utils/http.ts`
- 공통 접근/권한 해석 분리
  - `backend/src/middleware/access.ts`
- 직원 급여 타입/권한 라벨 공용 로직 분리
  - `backend/src/employees/employeeCompensation.ts`
- WorkRecord 공용 include/이름 해석 분리
  - `backend/src/work-records/workRecord.shared.ts`
- 급여 도메인 분리
  - `backend/src/payroll/payroll.routes.ts`
  - `backend/src/payroll/payroll.controller.ts`
  - `backend/src/payroll/payroll.service.ts`
- `backend/src/index.ts`는 위 모듈을 import하고 `payrollRouter`를 mount하는 형태로 정리했다.

#### 백엔드 개발 시 참고할 구조 원칙
- 방향은 **고전 MVC 전체 강제**가 아니라 **feature-based modular monolith**로 간다.
- 기본 원칙은 **fat service, thin controller**다.
  - `routes`: URL 연결만 담당
  - `controller`: `req/res` 변환, status code, 입력 파싱
  - `service`: 실제 비즈니스 규칙과 흐름
- `index.ts`는 최종적으로 **서버 bootstrap + route mount + 전역 에러 처리**만 남기는 방향으로 줄인다.
- Prisma는 파일마다 새로 만들지 않고 `db.ts`의 singleton만 사용한다.
- `utils`에는 **여러 도메인이 같이 쓰는 진짜 공용 함수만** 둔다.
  - 예: 문자열/숫자 정규화, 공통 HTTP 에러 유틸
- 특정 도메인 규칙은 공용으로 빼지 않고 **그 도메인 service 또는 shared 파일**에 둔다.
  - 예: payroll snapshot 정규화, employee role/payType 보정
- `middleware`에는 인증/권한/조직 접근 해석처럼 HTTP 입구 공통 로직을 둔다.
- `repository` 계층은 지금 필수는 아니다.
  - Prisma 쿼리가 과도하게 복잡해질 때만 선택적으로 도입한다.

#### 백엔드 리팩터링 순서 기준
1. `db.ts`
2. 공용 `utils`
3. 공통 `middleware`
4. 기능 단위 모듈 분리 (`payroll`부터 시작)
5. 같은 패턴으로 `employee`, `organization/subscription`, `order`, `work-log`, `assignment` 확장

#### 주의사항
- 공용 분리 과정에서 **domain-specific helper를 무리하게 utils로 올리지 않는다.**
- 현재는 `payroll`만 먼저 패턴을 확정한 상태다.
- 다음 분리 후보는 `employee` 도메인이다.

### 초기화 스크립트 운영 규칙 (2026-03-05)

#### 단일 진입점
- 초기화 스크립트는 무조건 `backend/scripts/reset-to-baseline.js` 하나만 사용한다. 분할 스크립트 추가 금지.
- 테스트 baseline은 계정/조직/라인/스타일/공통 색상까지만 재구성하고, 주문/작업 배정 더미 데이터는 재생성하지 않는다.
- 분리돼 있던 테스트 계정 전용 스크립트 `backend/scripts/seed-test-accounts.js`는 제거되었다.
- 실행 커맨드:
  - 루트: `npm run reset:baseline`
  - 백엔드: `npm run reset:baseline` (`prereset:baseline`에서 `prisma:prepare-client` 자동 실행)

#### 작업기록 데이터 보호 원칙
- baseline reset은 `WorkLog`, `WorkRecord` 데이터를 삭제/초기화하지 않는다.
- reset 결과 요약 카운트에도 `WorkLog`, `WorkRecord` 항목은 포함하지 않는다.
- 따라서 작업기록 기반 검증(AT/급여/이력 확인)은 reset 이후에도 유지되는 것이 정상 동작이다.

#### 운영 주의사항
- Prisma 마이그레이션 이후에는 반드시 Prisma Client 재생성 상태를 확인한다.
- 권장 커맨드: `npm --prefix backend run prisma:prepare-client` (또는 `npm run reset:baseline` 실행 시 자동 처리)
- 스키마와 생성된 클라이언트가 불일치하면 배정/주문 조회 API에서 컬럼 불일치 오류가 발생할 수 있다.

### 재고 관리 개발 계획 (초안, 2026-03-05)

#### 범위 (확정)
- 운영자가 고객사 입고 수량을 실측 입력한다.
- 라인/작업 단위 불출 수량을 기록하고, 완성품 수량 및 재고 변동과 비교 검토한다.
- BOM 기준 예상 소모량(`완성품 수량 × BOM 소요`)과 실제 재고 변동량을 비교한다.
- 공장 간 이동(송신/수신) 기록을 지원하며, 송신-수신 수량 불일치 시 경고/사유를 남긴다.
- 재고 화면에서 품목 검색 결과가 없으면 화면 이동 없이 즉시 신규 품목 등록 후 바로 입력한다.

#### 핵심 모델링 원칙 (FK 우선)
- 모든 재고 변동 레코드는 반드시 `itemId(FK)`를 가진다.  
  - 자유 텍스트 품목명만으로 거래를 저장하지 않는다.
- 품목은 `품목 마스터(제품 공통)`와 `재고 SKU(변형)`를 분리해 관리한다.
  - 품목 마스터: `카테고리 + 품목명 + 규격 + 기본단위` (예: `원단 YS-001`)
  - 재고 SKU(변형): `itemMasterId + 색상(옵션)` 단위
  - 원단처럼 색상별 재고 추적이 필요한 경우 `같은 제품 + 색상별 SKU`로 분리한다.
  - 색상이 없는 부자재는 `색상 NULL(또는 NO_COLOR)` 단일 SKU로 운영한다.
  - 상위 분류(종류)는 검색/집계를 위한 분류값으로 유지한다.
- 삭제 정책은 `RESTRICT + soft delete`를 우선한다.
  - 거래가 있는 품목은 물리 삭제하지 않고 비활성 처리한다.
- 중복 방지를 위해 정규화 키(unique 후보)를 둔다.
  - 예:
    - 마스터 unique: `(orgId, categoryId, normalizedName, normalizedSpec, unitId)`
    - SKU unique: `(itemMasterId, colorId)` (`colorId` nullable 처리 포함)

#### 공장 간 이동 설계 (고객 이동 로직 재사용 전제)
- `TransferHeader` + `TransferLine` 구조로 송신/수신을 분리 기록한다.
  - `fromOrgId`, `toOrgId`, `status(SENT/RECEIVED/MISMATCH/CONFIRMED)` 관리
  - line별 `sentQty`, `receivedQty`, `deltaQty`, `deltaReason`
- 수신 등록 시 line 단위로 자동 비교하고 불일치 건을 즉시 표시한다.
- 전송 엔진은 상대 타입(`FACTORY`, `CUSTOMER`, 향후 `LINE`) 확장 가능 구조로 만든다.
  - 고객 반출/반입 시 같은 비교/사유 로직을 재사용한다.

#### 재고 화면 UX 정책 (간단/실무형)
- 단일 검색 입력에서 `종류 + 품목명 + 코드 + 규격 + 색상` 통합 검색을 지원한다.
  - 부분일치/토큰일치: `원단 YS`, `스냅 10`, `지퍼 블랙` 형태 모두 매칭.
- 검색 결과가 없으면 같은 위치에서 `빠른 품목 등록` UI를 연다.
  - 최소 필수값만 입력: `종류(선택/입력)`, `품목명`, `단위`, `규격/색상(선택)`
  - 저장 즉시 해당 품목을 현재 입력행에 자동 선택한다.
- 빠른 등록 시 유사 품목 후보를 먼저 보여 중복 생성을 줄인다.

#### BOM 비교/검토 정책
- `예상 소모량 = 확정 완성품 수량 × BOM 기준 소요량`으로 계산한다.
- 실제 소모량은 기간/작업단위의 재고 변동 ledger 합으로 산출한다.
- 현재는 “작업 완료” 도메인이 없으므로, 1차에서는 검토 화면에 **UI 상태값**만 둔다.
  - 예: `검토대상 선택`, `검토완료(임시)` 버튼/배지 (백엔드 완료 의미는 추후)
- 차이 발생 시 운영자 사유 입력을 필수화한다.

#### 단계별 개발 순서
1. 원부자재 마스터 + 통합 검색 + 재고화면 내 빠른 품목 등록
2. 고객 입고 기록(실측 입력) + 입고 원장
3. 공장 간 이동(송신/수신) + 수량 불일치 경고/사유
4. 라인 불출 기록 + 완성품 수량 입력(기초)
5. BOM 예상소모 vs 실제변동 비교 화면(UI 우선, 완료개념 임시)
6. 차이 사유 확정/이력 + 고객 이동 로직 재사용 확장

#### 구현 시 주의사항
- 거래 테이블에 품목명/색상명을 직접 기준값으로 쓰지 말고 FK 기준으로 저장한다.
- 화면 표시를 위한 문자열 스냅샷은 별도 컬럼으로 허용하되, 계산/조회 기준은 FK로 고정한다.
- 품목 즉시 등록 플로우에서도 최종 저장은 반드시 `itemId`를 받은 뒤 거래 저장을 진행한다.

#### 진행 현황 (2026-03-05)
- 1차 UI 반영 완료 (프론트엔드):
  - 신규 경로: `/inventory`
  - 메뉴 연동: 생산 관리 > 재고 관리
  - 권한 연동: `FEATURE_KEYS.INVENTORY` (제조사 `ADMIN/OPERATOR` 접근)
  - 화면 구성(UI-only):
    - 통합 품목 검색(토큰 부분일치)
    - 검색 실패 시 같은 화면에서 품목 빠른 등록
    - 입고/불출 입력 패널 + 샘플 원장
    - 공장간 이동(송신/수신) 입력 + 불일치 표시
    - BOM 예상소모 vs 실제변동 비교/사유/검토상태
- 아직 미구현(백엔드):
  - 재고/이동/BOM 비교 데이터 영속화 API
  - 작업 완료 도메인 연계 및 확정 로직
  - 고객 이동 로직 재사용 전송 엔진

### AT 신뢰도 정책 업데이트 (2026-03-05)

- 화면 일관성:
  - AT 신뢰도 분류는 주문/카드 수량(`displayOrderQuantity`)이 아니라 공정의 `timeRefQuantity` 기준으로 계산한다.
  - 같은 공정/같은 `atParams`는 화면(스타일/생산계획/배정)과 관계없이 같은 신뢰도 상태를 가져야 한다.

- LOW_SENSITIVITY 관련 메모:
  - 현재 코드에서 `LOW_SENSITIVITY`는 별도 상태명이 아니라 퍼센트 계산용 penalty 개념이다.
  - `b <= 0`일 때는 LOW_SENSITIVITY penalty를 적용하지 않는다.
  - `b > 0`이면서 `setupShare < threshold`인 경우에만 LOW_SENSITIVITY penalty를 적용한다.

- 버전 증가 규칙:
  - `atParams.version`은 `a,b`가 실제로 변할 때만 증가한다.
  - `trainedPeriod`/품질 메타만 변경된 경우에는 version을 유지한다.

- 출퇴근 폴백 반영:
  - 학습 시 공정별 출퇴근 커버리지(`attendanceCoverage`)와 폴백 비율(`attendanceFallbackShare`)을 `atParams`에 기록한다.
  - 프론트 신뢰도 퍼센트는 폴백 비율 패널티를 반영한다.

- 스타일 단위 집계:
  - 스타일 신뢰도는 공정 최소값(min) 대신 공정별 AT 기여시간 가중 평균 퍼센트로 집계한다.
  - 집계 퍼센트로 상태(`COLLECTING/UNRELIABLE/INSUFFICIENT/USABLE/TRUSTED/VERIFIED`)를 매핑한다.
