# 작업기록 "같은 작업자/배정/공정 조합 중복" 경고 원인 조사 (2026-08-18)

## 증상

- `작업 기록 - 상세` 화면 (기간: 2026-06-01 ~ 2026-06-30, LINE #1, HANOI, 총 392행)을 **조회만** 했는데도
  "같은 작업자/배정/공정 조합이 중복되어 있습니다. 수량으로 합산해 주세요." 경고 배너가 뜬다.
- 경고는 어떤 두 행이 충돌하는지 화면에 알려주지 않는다.
- `배정` 화면에서 해당 스타일(AJ2074, 주문 L16-3, 수량 70)의 공정별 수량 확인 drawer를 열어보면:
  - 대부분의 공정은 `70 / 0`(생산 70, 잔여 0)으로 정상.
  - `TA03 · May cửa tay + hoàn thiện cửa tay`만 `0 / -70`(생산 0, 잔여 -70)로 표시됨 — 즉 이 배정 기준으로는
    TA03에 대해 작업기록이 **전혀 없다.**
- 정리하면: 실제 수량으로는 어디서도 이중 카운트가 보이지 않는데, 경고는 계속 뜨고 있고 사용자가 의심되는
  TA03은 오히려 "입력이 0건"인 상태다. → 경고가 실제 데이터 중복을 가리키는 게 맞는지 의심되는 상황.

## 경고가 뜨는 코드 위치

`frontend/src/pages/App/work/WorkDetail.jsx`

- `buildWorkerMetric` (L740), `buildAssignmentPlanMetric` (L733), `buildProcessMetric` (L712)
- `buildWorkerStyleProcessSignature` (L749) — 위 세 metric을 합쳐 `workerKey:assignmentPlanKey:processKey` 서명을 만든다.
- `findDuplicateRow` (L778) — 레코드 배열을 순회하며 서명이 두 번째로 나오는 첫 레코드를 반환한다.
- 배너 렌더링: L3123 `{findDuplicateRow(summary.records) ? <Alert severity="warning">...` — **어떤 행이 충돌인지 인덱스/하이라이트를 넘기지 않는다.**
- 저장 자체를 막는 동일 검사: L2686-2688 (`handleSave` 내부).

### 서명(중복 판정 키) 구성

- workerId (없으면 이름으로 fallback)
- assignmentPlanId (없으면 서명 자체가 빈 문자열이 되어 검사에서 제외됨)
- process key: **`styleProcessId` 우선 → 없으면 `processId` → 없으면 공정 코드 → 없으면 공정명** (`buildProcessMetric`, L712-731)

날짜(`effectiveCoverageStartDate/EndDate`)나 수량은 서명에 전혀 포함되지 않는다. 즉 "같은 작업자가 같은 배정의 같은 공정을
같은 기간 안에서 여러 날 나눠 입력"해도 서명만 보면 항상 충돌로 잡힌다 (AGENTS.md의 "같은 작업기간×직원×주문×스타일×공정은
업로드 전에 합쳐라" 정책과 일치하는 정상 케이스).

## 이번 케이스가 그 "정상적인 합산 필요" 케이스가 아닌 것으로 보이는 이유

1. `summary.records`(중복 검사에 실제로 들어가는 배열)는 저장된 원본 `WorkRecord`를 그대로 쓰는 게 아니라,
   **화면에 로드된 편집 가능한 `rows` state를 매 렌더마다 다시 조립한 파생 배열**이다 (`WorkDetail.jsx` L1812-1848,
   `summary` useMemo). 각 행마다 `resolveAssignmentForRow` / `resolveProcessForRow`로 현재 화면에 로드된
   assignment/process 후보 목록과 다시 매칭해서 `assignmentPlanId`, `styleProcessId`를 만든다.
   → 즉 경고에 쓰이는 키가 "DB에 저장된 FK 값"이 아니라 "지금 브라우저가 다시 계산한 매칭 결과"다.
2. `summary.records`는 `Number(row?.quantity) > 0`인 행만 남긴다 (L1821). TA03이 수량 0인 상태로 화면에
   존재한다면 애초에 이 배열에 들어가지 않으므로, TA03 자신이 "TA03과 TA03이 중복"으로 잡힐 수는 없다.
3. 그런데 배정 drawer 기준 TA03은 실제 생산량이 0(=이 assignmentPlanId에 연결된 WorkRecord가 없음)인데도
   사용자는 이 조합이 중복 후보로 의심된다고 느꼈다 — 이는 다음 두 가지 중 하나를 시사한다.
   - (a) 실제로 중복인 두 행은 TA03이 아니라 다른 공정 조합인데, 화면상 위치/설명이 없어서 사용자가 TA03을
     의심하게 됐을 뿐 TA03과는 무관할 가능성.
   - (b) **더 유력한 가설**: 어딘가에 있는 실제 WorkRecord 행이 TA03로 표시/카운트는 되지만 이 AJ2074(L16-3)
     배정에는 집계되지 않고 있다 — 즉 `resolveProcessForRow`/`resolveAssignmentForRow`가 코드/이름 fallback
     매칭(styleProcessId가 비어있는 legacy 행이거나, process 옵션 목록에서 code로만 매칭되는 행)으로 인해
     **실제로는 다른 배정(다른 주문 또는 다른 스타일 인스턴스)에 속한 행을, 화면상 우연히 같은 process 코드
     "TA03"을 쓰는 다른 StyleProcess와 같은 키로 묶어버렸을 가능성**이 있다. 그 경우 두 원본 WorkRecord는
     서로 다른 진짜 데이터인데도 프론트가 재조립하는 과정에서만 우연히 같은 서명으로 수렴해 "중복"으로
     오탐지될 수 있다.

## 결론 (현재까지 코드 조사 기준)

- 경고 로직 자체는 코드로 확인됨: `worker × assignmentPlan × (styleProcessId 우선 fallback 체인)` 서명이 두 번
  이상 나오면 무조건 경고. 날짜/수량 무시.
- 이 서명은 **저장된 DB 값이 아니라 화면에서 다시 매칭한 값**이라는 점이 이번 조사에서 가장 중요한 발견이다.
  즉 실제 DB에 진짜 중복 행이 있어서 뜨는 경고인지, 아니면 프론트의 재매칭(fallback 매칭) 과정에서
  서로 다른 두 행이 우연히 같은 키로 수렴해서 뜨는 오탐인지 코드만으로는 100% 단정할 수 없다.
- 사용자가 관찰한 정황(수량 어디에도 이중 카운트 없음 + 의심되는 TA03은 오히려 0건)은 **오탐 가설(위 3-(b))에
  더 무게가 실리는 정황 증거**다. 진짜 중복이라면 그 공정의 생산량이 배정 대비 초과(overflow)로 나와야
  자연스러운데 TA03은 반대로 미달(0)이기 때문이다.

## 다음에 확인이 필요한 것 (DB 직접 조회 필요, 이번 세션에서는 미수행)

1. Railway 운영 DB(`DATABASE_PUBLIC_URL`, AGENTS.md 상단 안내 참고)에서 해당 WorkLog(6월, LINE #1, HANOI)의
   `WorkRecord` 392건을 `(workerId, assignmentPlanId, styleProcessId)`로 그룹핑해 실제로 count > 1인 조합이
   있는지 직접 확인한다. 있다면 그 두 행의 quantity, styleProcessId, assignmentPlanId를 비교해 정말 같은
   조합인지, 아니면 styleProcessId가 NULL이라 프론트 fallback으로만 같아 보이는 것인지 구분한다.
2. `styleProcessId`가 NULL이거나 매칭이 code/name fallback으로 떨어지는 행이 이 WorkLog에 있는지 확인한다
   (있다면 (b) 가설이 유력해짐).
3. AJ2074/L16-3(assignmentPlanId 특정값)에 실제로 연결된 WorkRecord 중 TA03에 해당하는 styleProcessId를 가진
   행이 몇 건인지 직접 카운트해서 drawer의 "0건" 표시와 일치하는지 재확인한다.
4. 위 확인 후, 진짜 원인이 (b) 오탐이라면 `buildWorkerStyleProcessSignature`/`resolveProcessForRow`가
   styleProcessId 없이 code/name fallback으로 서로 다른 StyleProcess를 같은 키로 묶는 지점을 수정해야 한다.
   진짜 원인이 실제 중복 저장이라면, 어떤 저장 경로(수기 입력 vs 엑셀 import)가 §49 정책(worker×assignmentPlan
   ×styleProcessId 기준 dedup)을 우회했는지 추적해야 한다.
