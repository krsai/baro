# BARO 개발 TODO

작업 방식: 하나씩 순서대로. 완료된 항목은 삭제.

---

## 1. 급여 계산 기능 개발 (미개발)

CT 기반 급여 계산 모듈 전체 구현. 데이터 기반 구조는 이미 준비됨.

### 1-1. 급여 계산 로직 설계
- 급여 계산 공식 확정: WorkRecord.ctSeconds × quantity × WorkLog.factoryWagePerSecond
- 월별 집계 단위 결정 (workDate 기준)
- 직원별 / 라인별 집계 방식 결정

### 1-2. 급여 계산 API 개발 (backend)
- GET /payroll?orgId=&month= — 월별 직원 급여 집계
- 직원별 WorkRecord 집계 쿼리 작성

### 1-3. 급여 확정(잠금) 기능
- Payroll 확정 모델 설계 (schema.prisma 추가)
- 확정 시 해당 월 급여 데이터 스냅샷 저장
- 확정된 급여는 마스터 데이터 변경에 영향받지 않도록 처리

### 1-4. 급여 계산 UI 개발 (frontend)
- 월 선택 → 직원별 급여 목록 표시
- 급여 확정 버튼 및 확정 상태 표시
- 확정된 급여 잠금 처리 (편집 불가)

---

## 2. 라인 인원 변경 시 배정 계획 capacity 재계산

라인 인원(LineAssignment)이 변경될 때 해당 라인의 AssignmentBoard가 재계산되어야 함.

### 2-1. 현황 파악
- AssignmentBoard에서 라인 capacity 계산 방식 코드 파악
- LineAssignment 변경 시점(입사/퇴사/이동)이 어디서 발생하는지 파악

### 2-2. 재계산 트리거 구현
- 라인 인원 변경(LineAssignment 생성/종료) 시 프론트엔드에 이벤트 전달
- 해당 라인의 AssignmentBoard capacity 재계산 로직 호출

---

## 3. 수주 수량 변경 연동 (설계 확정 필요)

수주 수량이 변경될 때 배정 보드의 카드와 연동하는 방식.
기존 배정 카드에 직접 반영하지 않고, 차이만큼 "차이 카드"를 미배정 풀에 생성한다.

### 차이 카드 동작 방식
- **+차이 카드** (수량 증가): 미배정 풀에 생성. 빈 라인에 드롭 → 새 배정, 기존 카드 위에 드롭 → 수량 흡수(병합)
- **-차이 카드** (수량 감소): 미배정 풀에 생성. 드래그 시 동일 수주/스타일/색상의 배정 카드를 하이라이트(나머지 블러). 해당 카드 위에 드롭 → 수량 차감

### 시각화
- 동일 수주의 분할 카드들은 카드 윤곽선 색상으로 그룹 표시 (같은 제품임을 한눈에 식별)

### 진행
- 설계 확정 후 구현

---

## 4. 직원 퇴사 처리 시 작업 기록 보존 확인

퇴사한 직원의 WorkRecord가 삭제되지 않고 보존되는지 확인 및 보완.

- Employee 삭제/비활성화 시 WorkRecord ON DELETE 동작 확인 (현재 workerId nullable)
- 직원 퇴사 처리 UI에서 데이터 보존 안내 문구 추가
- 퇴사 직원의 WorkRecord가 급여 계산에 정상 포함되는지 확인

---

## 5. 작업 기록 입력 UI 개선 — 카드 기반 입력

현재는 스타일/공정/색상을 수동 입력. 라인 배정 카드에서 정보를 불러오는 방식으로 개선.
이 개선으로 WorkRecord ↔ AssignmentPlan 연결(assignmentPlanId)이 자연스럽게 생김.

### 변경 흐름
- 작업 기록 입력 시 해당 라인에 배정된 카드 목록 조회
- 카드 선택 → 스타일, 색상, 공정 목록(CT 포함) 자동 로드
- 작업자는 공정별 수량만 입력
- 저장 시 WorkRecord.assignmentPlanId 자동 연결

### 필요 데이터 변경
- WorkRecord에 `assignmentPlanId Int?` 추가 (schema.prisma 마이그레이션)

### 진행
- schema.prisma 마이그레이션
- 작업 기록 입력 화면 UI 개선 (카드 선택 → 자동 로드)
- 카드 목록 조회 API: 해당 라인의 활성 AssignmentPlan 목록

---

## 6. 카드 완료 처리 & 최종 수량 검증

작업계획협의 화면에서 라인장이 완료 처리. 날짜 없이 최종 수량만 입력.
5번(assignmentPlanId 연결) 완료 후 구현.

### 완료 처리 동작
- 완료 버튼 클릭 → 최종 수량 입력 팝업
- 시스템 체크: WorkRecord 누적 수량 > 최종 수량이면 경고 표시 (초과 공정 감지)
- 초과 공정 수량의 급여 포함 여부: 미결 (추후 결정)

### 필요 데이터 변경
- AssignmentPlan에 `isCompleted Boolean @default(false)`, `finalQuantity Int?` 추가

---

## 백로그 (우선순위 미정)

- 배정 계획 실수 복구 수단 — 현재 자동저장만 있어서 실수 시 되돌릴 방법 없음. undo/redo 또는 최근 N개 상태 보관 중 어떤 방식이 적합한지 결정 필요.
- 작업 계획 카드 진행률 바 — 일일 WorkRecord 기반으로 카드에 진행률 표시. WorkRecord-AssignmentPlan 연결(5번 선결 이슈) 해결 후 구현 가능.
