# baro 프로젝트 컨텍스트

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
- **WorkLog**: `(factoryId, workDate)` 기준 하루 1개. `lineId`가 스키마 FK 없이 `records` JSON 안에 비정규화 저장됨 (DB 조인 불가 — 구조적 한계).
- **WorkRecord**: WorkLog 하위. 한 행 = `(작업자, 스타일, 공정, 색상, 수량, ctSeconds)`. 같은 작업자가 같은 날 여러 공정 가능.
- **급여 계산용**: 공정별로 몇 개 만들었는지 집계. 주문 100장이어도 실제로는 95장 또는 105장 만들 수 있음.

### AssignmentPlan (스케줄 카드)
- 단위: 기본 `주문 × 스타일` (색상/사이즈 단위 미구현)
- `ctSnapshot`: 프론트에서 계산한 CT 스냅샷 JSON 저장 (백엔드 검증 없음)
- `isCompleted / finalQuantity / completedAt`: QC 완료 처리 결과

---

## AT 학습 파이프라인

### 작동 방식
1. WorkLog를 `workDate` 기준으로 버킷화 (AtTrainingBucket)
2. **Period Spreading**: 드문드문 입력해도 날짜 간격만큼 시간 자동 분산
   - 예) workDate: 4/1, 4/15, 4/30 → 각각 1일, 14일, 15일 기간으로 처리
3. `totalSeconds` = 해당 기간 작업자 출퇴근 실측 합 (없으면 `workerCount × 기본8h × 일수`)
4. 회귀 분석: `totalSeconds ≈ Σ(a_i × q_i + b_i)` → 공정별 `a`, `b` 학습

### 출퇴근 필터 (중요)
출퇴근 데이터가 없으면 **작업기록이 있어도 AT 학습 안 됨**.
월말 일괄 작업기록 입력 시 출퇴근도 같이 입력돼 있어야 함.

### 신뢰도 상태
`COLLECTING → UNRELIABLE → INSUFFICIENT → USABLE → TRUSTED → VERIFIED`
`attendanceFallbackShare`(출퇴근 미입력 비율)가 높을수록 신뢰도 하락.

---

## QC 완료 흐름

```
1. QcReview.jsx: 검수자가 색상/사이즈별 통과 수량 입력 → qcPassQuantity 합산
2. PATCH /assignment-plans/:id/complete { finalQuantity: qcPassQuantity }
3. 백엔드: producedQuantity = Math.min(공정별 WorkRecord 수량 합계들)
4. producedQuantity < finalQuantity → 409 에러 (현재 버그)
5. 완료 시: isCompleted=true, 같은 라인 다음 카드 일정 당김
```

### ⚠️ 현재 버그: QC hard block
**위치**: `backend/src/index.ts:14168`

작업기록이 드문드문 있거나 없으면 `producedQuantity=0` → 검수팀이 완료 눌러도 시스템이 막음.
QC가 완료의 권위자여야 하는데, 작업기록이 게이트키퍼가 된 상태.

**설계 배경**: 원래 설계 의도는 "작업기록 수량 기반 자동 완료"였음 (`index.ts:14213` reopen 에러 메시지 참조).
QC 완료 버튼이 나중에 추가되면서 충돌이 생긴 구조.

**합의된 수정 방향**:
- 백엔드: `force: true` 파라미터 추가. 불일치 시 `canForce: true` 경고 응답 (409), force면 강제 완료
- 백엔드: `force` 판정은 `Boolean(req.body?.force)`가 아니라 `req.body?.force === true`처럼 엄격하게 처리
- 프론트: `error.details?.canForce` 확인 후 재확인 다이얼로그 → `force: true`로 재요청
- 완료 후 추가 작업기록 차단은 이미 `assignmentPlan` 단위로 구현돼 있음 (`index.ts:6435`, `7178`)
- 차단 범위도 이번에는 `assignmentPlan` 단위 유지. 같은 주문/스타일의 다른 plan까지 전역 차단하는 규칙은 이번 범위에 넣지 않음
- reopen 기능은 이번 범위 외 (별도 판단)
- 재확인 UI는 1차 구현에서 `window.confirm` 허용. 이후 필요하면 MUI Dialog로 교체

**프론트 구현 시 주의**: force 재요청 성공 후에도 성공 알림 + `loadRows` 호출이 실행돼야 함.
try/catch 구조를 `doComplete(force)` 헬퍼로 분리하는 방식으로 처리.

---

## 스케줄러 로직 분석 결과

### 이미 구현돼 있는 것
- **미배정 카드 표시**: `buildCardsFromOrders`가 주문의 모든 카드를 생성. 미배정 카드는 보드 풀(pool)에 남아 있어 눈으로 확인 가능.
- **QC 완료 → 자동 재배치**: 완료 엔드포인트(`index.ts:14187`)가 `reorderAssignmentSchedulesByManualCompletion`(`index.ts:6041`) 자동 호출. 완료 카드는 맨 앞, 미완료 카드는 원래 순서 유지 후 날짜 재계산. 원하는 "완료 전엔 그대로, 완료되면 재배치" 동작 이미 구현됨.
- **라인 균형**: 시각적으로 보드에서 확인 가능 (별도 지표 불필요).
- **`progressPercent` 필드**: `/assignment-plan-progress` 응답에 이미 있음. 단 계산 공식이 잘못됨 (Math.min 기반).
- **`sumByPlanId`**: 진행도 계산 함수 내부에 plan별 전체 수량 합계가 이미 계산됨 (`index.ts:13933`).

---

## 내일 코딩 명세 (Codex 즉시 실행용)

### Task 1: QC 완료 hard block 제거 [최우선]

#### 1-A. 백엔드 `backend/src/index.ts`

대상: `PATCH /assignment-plans/:externalId/complete` 엔드포인트 (line ~14118)

**변경 1**: `finalQuantity` 파싱 바로 아래에 `force` 파싱 추가
```ts
const finalQuantity = toOptionalNonNegativeInt(req.body?.finalQuantity, null);
// ↓ 이 줄 추가
const force = req.body?.force === true;
```

**변경 2**: hard block 조건에 `&& !force` 추가 + 응답에 `canForce`, `code` 추가 (line ~14168)
```ts
// 기존:
if (producedQuantity < finalQuantity) {
  return res.status(409).json({
    ok: false,
    error: `work log not finalized (produced=${producedQuantity}, finalQuantity=${finalQuantity})`,
    producedQuantity,
    finalQuantity,
  });
}

// 변경 후:
if (producedQuantity < finalQuantity && !force) {
  return res.status(409).json({
    ok: false,
    error: `work log not finalized (produced=${producedQuantity}, finalQuantity=${finalQuantity})`,
    producedQuantity,
    finalQuantity,
    canForce: true,
    code: "WORK_LOG_SHORTFALL",
  });
}
```

주의: `Boolean(req.body?.force)` 사용 금지. 문자열 `"false"`가 truthy로 처리되는 것을 막기 위해 반드시 `=== true` 로 엄격하게 처리.

#### 1-B. 프론트 `frontend/src/pages/App/QcReview.jsx`

대상: `handleComplete` 콜백 (line ~570)

현재 코드를 아래 구조로 교체:

```jsx
const handleComplete = useCallback(
  async (row) => {
    const finalQuantity = toNonNegativeIntOrNull(row?.qcPassQuantity);
    if (finalQuantity === null) {
      showNotification('검수 통과 수량을 입력해 주세요.', 'error');
      return;
    }
    if (row?.isCompleted) {
      showNotification('이미 마감완료된 건입니다.', 'warning');
      return;
    }

    const doComplete = async (force = false) => {
      await requestJSON(
        `/assignment-plans/${encodeURIComponent(String(row.id || ''))}/complete` +
          buildQueryString({ orgId: activeOrgId }),
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finalQuantity, ...(force ? { force: true } : {}) }),
        }
      );
    };

    setCompletingPlanId(row.id);
    try {
      await doComplete();
    } catch (error) {
      if (error?.status === 409 && error?.details?.canForce) {
        const producedQuantity = error.details?.producedQuantity ?? 0;
        const confirmed = window.confirm(
          `작업기록상 생산수량(${producedQuantity}장)이 검수수량(${finalQuantity}장)보다 적습니다. 그래도 완료 처리하시겠습니까?`
        );
        if (!confirmed) {
          setCompletingPlanId(null);
          return;
        }
        try {
          await doComplete(true);
        } catch (forceError) {
          showNotification(forceError?.message || '검수 마감 처리에 실패했습니다.', 'error');
          setCompletingPlanId(null);
          return;
        }
      } else {
        showNotification(error?.message || '검수 마감 처리에 실패했습니다.', 'error');
        setCompletingPlanId(null);
        return;
      }
    }
    // 일반 완료, force 완료 모두 여기 도달
    emitWorkspaceDataChanged({
      topics: [WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
      orgId: activeOrgId,
      assignmentIds: [row.id],
      source: 'qc-review',
    });
    showNotification('검수 마감을 완료했습니다.', 'success');
    await loadRows({ forceRefresh: true });
    setCompletingPlanId(null);
  },
  [activeOrgId, loadRows, showNotification]
);
```

참고: `error.details`는 `apiClient.js:373`의 `createHttpError` 구조 기준. 서버 응답 전체가 `error.details`에 담김.

---

### Task 2: 진행도 계산 공식 변경

#### 배경
현재 `progressPercent = producedQuantity / planQuantity * 100` 이고, `producedQuantity = Math.min(공정별 합계)` 라서 일부 공정 기록만 있으면 0%가 됨.

#### 새 공식
```
progressPercent = sum(모든 WorkRecord.quantity) / (planQuantity × processCount) × 100
```

예시: 주문 100장, 공정 5개 → 전체 500. 작업기록 합산 50개 → 10%.

#### 변경 위치: `backend/src/index.ts` line ~13872 (진행도 집계 함수 내부)

**변경 1**: plan select에 `ctSnapshot` 추가 (line ~13879)
```ts
select: {
  id: true,
  externalId: true,
  lineId: true,
  orderNo: true,
  customer: true,
  label: true,
  colorId: true,
  colorName: true,
  quantity: true,
  isCompleted: true,
  finalQuantity: true,
  completedAt: true,
  ctSnapshot: true,  // ← 추가
},
```

**변경 2**: processCount 계산 추가 (line ~13951 map 시작 부분)
```ts
return plans.map((plan) => {
  const planId = Number(plan.id);
  const plannedQuantity = toOptionalNonNegativeInt(plan.quantity, null);
  const finalQuantity = toOptionalNonNegativeInt(plan.finalQuantity, null);
  const baselineQuantityRaw = plannedQuantity != null && plannedQuantity > 0 ? plannedQuantity : null;

  // processCount: ctSnapshot에서 공정 수 추출, 없으면 작업기록의 distinct 공정 수로 fallback
  const ctSnapshotProcesses = (() => {
    try {
      const snapshot = plan.ctSnapshot;
      if (!snapshot) return null;
      const parsed = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot;
      const processes = Array.isArray(parsed?.processes) ? parsed.processes : null;
      return processes;
    } catch {
      return null;
    }
  })();
  const processCountFromSnapshot = ctSnapshotProcesses ? ctSnapshotProcesses.length : null;
  const processCountFromRecords = processAggregates
    .filter((row) => Number(row.assignmentPlanId) === planId)
    .length;
  const processCount = processCountFromSnapshot ?? processCountFromRecords;

  // 새 progressPercent 공식
  const totalExpected = baselineQuantityRaw != null && processCount > 0
    ? baselineQuantityRaw * processCount
    : null;
  const totalDone = sumByPlanId.get(planId) || 0;
  const isCompleted = Boolean(plan?.isCompleted || toIsoDateStringOrNull(plan?.completedAt));

  const progressPercent = isCompleted
    ? 100
    : totalExpected != null && totalExpected > 0
      ? Math.min(100, Math.round((totalDone / totalExpected) * 100))
      : null;

  // ... 이하 기존 return 유지, progressPercent만 위 계산값으로 교체
```

주의: `producedQuantity`(Math.min 기반)는 QC 완료 체크용으로 **그대로 유지**. progressPercent만 새 공식으로 교체.

---

### Task 3: 스케줄 카드 배경 진행도 표시

#### 개념
스케줄 보드의 배정 카드 배경을 `progressPercent`에 따라 색으로 채움.
0% → 배경 없음, 50% → 절반 채움, 100% → 전체 채움 (완료 시 완전히 다른 색).

#### 변경 위치: `frontend/src/pages/App/assign/AssignBoard.jsx`

AssignBoard에서 assignment 카드를 렌더링하는 부분을 찾아 progressPercent 기반 배경 오버레이 추가.

카드 컨테이너 내부에 절대 위치 div 삽입:
```jsx
{/* 진행도 배경 채우기 */}
{typeof progressPercent === 'number' && progressPercent > 0 && !isCompleted && (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: `${progressPercent}%`,
      height: '100%',
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      pointerEvents: 'none',
      zIndex: 0,
    }}
  />
)}
```

`progressPercent` 값은 `/assignment-plan-progress` API 응답에서 이미 내려오므로, AssignBoard가 progress 데이터를 로드하는 시점에 카드에 매핑하면 됨.

완료된 카드(`isCompleted: true`)는 기존 완료 스타일 유지, 별도 오버레이 불필요.

---

## 구조적 문제 (우선순위순)

| # | 문제 | 위치 | 영향 |
|---|---|---|---|
| 1 | QC hard block | `index.ts:14168` | 작업기록 없으면 완료 불가 |
| 2 | WorkLog에 lineId FK 없음 | `schema.prisma:682` | 라인별 분석 불가 |
| 3 | 재배치 로직이 프론트에 있음 | `AssignBoard.jsx:1869` | 서버 이벤트에 자동 반응 불가 |
| 4 | 소스오브트루스 이중화 | 여러 곳 | WorkLog.records vs WorkRecord, ctSnapshot 등 |
| 5 | 실행 엔티티 부재 | — | 시작/중단/완료 이벤트 모델 없음 |

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
| AT 학습 파이프라인 | `backend/src/index.ts:2030~3232` |
| QC 완료 엔드포인트 | `backend/src/index.ts:14118` |
| 작업기록 저장 엔드포인트 | `backend/src/index.ts:14712` |
| 스케줄 재배치 (프론트) | `frontend/src/pages/App/assign/AssignBoard.jsx:1869` |
| 진행률 계산 | `backend/src/index.ts:5454` |
| DB 스키마 | `backend/prisma/schema.prisma` |
