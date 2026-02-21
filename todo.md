# BARO 개발 TODO

작업 방식: 하나씩 순서대로. 완료된 항목은 삭제. 항목 시작 전 반드시 사용자에게 확인.

개발 순서: 2 → 3

---

## 2. 라인 인원 변경 시 배정 계획 capacity 재계산

라인 인원(LineAssignment)이 변경될 때 해당 라인의 AssignmentBoard가 재계산되어야 함.
headcount 스냅샷 저장 없이 트리거 기반 재계산으로 처리.

### 확인 대상 파일
- `frontend/src/pages/AssignmentBoard*.jsx` — capacity 계산 로직 위치
- `frontend/src/pages/Line*.jsx` 또는 LineManagement 관련 파일 — LineAssignment 변경 위치
- `backend/src/index.ts` — LineAssignment CRUD API

### 구현 단계
1. AssignmentBoard의 capacity 계산 방식 코드 파악
   - 현재 일일 capacity = 라인 인원 수 × 시프트 시간(초)
   - 인원 수를 어디서 가져오는지 확인
2. LineAssignment 변경 시점 파악
   - 직원 배정(입사/이동): LineAssignment 생성
   - 직원 이탈(퇴사/이동): LineAssignment.endAt 설정
3. 재계산 트리거 구현
   - LineAssignment 변경 후 → 해당 lineId의 AssignmentBoard capacity 재계산
   - 방식: API 응답에 변경된 라인 인원 수 포함 → 프론트엔드에서 보드 재계산

---

## 3. 수주 수량 변경 연동 (설계 확정 필요)

수주 수량이 변경될 때 배정 보드의 카드와 연동하는 방식.
기존 배정 카드에 직접 반영하지 않고, 차이만큼 "차이 카드"를 미배정 풀에 생성한다.

### 차이 카드 동작 방식
- **+차이 카드** (수량 증가): 미배정 풀에 생성. 빈 라인에 드롭 → 새 배정, 기존 카드 위에 드롭 → 수량 흡수(병합)
- **-차이 카드** (수량 감소): 미배정 풀에 생성. 드래그 시 동일 수주/스타일/색상/**성별**의 배정 카드를 하이라이트(나머지 블러). 해당 카드 위에 드롭 → 수량 차감
- 수량 흡수/차감 시 카드 기간(endIndex) 재계산됨

### 시각화
- 동일 수주의 분할 카드들은 카드 윤곽선 색상으로 그룹 표시 (같은 제품임을 한눈에 식별)

### 확인 대상 파일
- `frontend/src/pages/AssignmentBoard*.jsx` — 카드 생성/병합/분할 로직
- `backend/src/index.ts` — WorkOrder 수정 API

### 진행
- AssignmentBoard 카드 구조 및 split/merge 로직 파악 후 설계 확정
- 설계 확정 후 구현

---

## 백로그 (우선순위 미정)

- 배정 계획 실수 복구 수단 — 현재 자동저장만 있어서 실수 시 되돌릴 방법 없음. undo/redo 또는 최근 N개 상태 보관 중 어떤 방식이 적합한지 결정 필요.
- 작업 계획 카드 진행률 바 — 일일 WorkRecord 기반으로 카드에 진행률 표시. 5번(assignmentPlanId 연결) 완료 후 구현 가능.
