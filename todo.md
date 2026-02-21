# BARO 개발 TODO

작업 방식: 하나씩 순서대로. 완료된 항목은 삭제. 항목 시작 전 반드시 사용자에게 확인.

개발 순서: 4 → 5 → 6 → 1 → 2 → 3

---

## 4. 직원 퇴사 처리 시 작업 기록 보존 확인

퇴사한 직원의 WorkRecord가 삭제되지 않고 보존되는지 확인 및 보완.
코드 변경보다 확인/검증 위주의 작업.

### 확인 대상
- `backend/prisma/schema.prisma`
  - WorkRecord.workerId는 `Int?` (nullable) → Employee 삭제 시 null로 유지되는지 확인
  - WorkRecord ↔ Employee 간 onDelete 설정 없는지 확인 (현재 없음 = 보존됨)
- `backend/src/index.ts` 또는 employee 관련 라우터
  - Employee 비활성화/퇴사 처리 API 찾기 (leftAt 설정 로직)
  - 해당 API에서 WorkRecord 삭제 시도 없는지 확인
- `frontend/src/` — 직원 퇴사 처리 UI 파일 찾기
  - 퇴사 처리 버튼/폼 위치 확인
  - "작업 기록은 보존됩니다" 안내 문구 추가 위치 파악

### 구현
- 퇴사 처리 UI에 안내 문구 추가 (코드 변경은 이것만 예상)
- 만약 onDelete Cascade가 있다면 schema 수정 필요 (마이그레이션)

---

## 5. 작업 기록 입력 UI 개선 — 카드 기반 입력

현재는 스타일/공정/색상을 수동 입력. 라인 배정 카드에서 정보를 불러오는 방식으로 개선.
이 개선으로 WorkRecord ↔ AssignmentPlan 연결(assignmentPlanId)이 자연스럽게 생김.

### 변경 흐름
- 작업 기록 입력 시 해당 라인에 배정된 카드 목록 조회
- 카드 선택 → 스타일, 색상, 공정 목록(CT 포함) 자동 로드
- 작업자는 공정별 수량만 입력
- 저장 시 WorkRecord.assignmentPlanId 자동 연결
- 한 라인에 카드가 여러 개면(A/B 혼용) 카드를 각각 선택해 기록

### 확인 대상 파일
- `backend/prisma/schema.prisma` — WorkRecord 모델 (assignmentPlanId 추가 위치)
- `backend/src/index.ts` — 작업 기록 관련 API 엔드포인트 찾기 (/work-log, /work-record)
- `frontend/src/pages/WorkHistory*.jsx` 또는 유사 파일 — 현재 작업 기록 입력 UI
- `frontend/src/pages/AssignmentBoard*.jsx` — AssignmentPlan 구조 참고

### 구현 단계
1. schema.prisma: WorkRecord에 `assignmentPlanId Int?` + `assignmentPlan AssignmentPlan? @relation(...)` 추가
2. `npx prisma migrate dev --name add_assignment_plan_id_to_work_record`
3. backend API: 라인 ID 기준 활성 AssignmentPlan 목록 조회 엔드포인트 추가
   - `GET /assignment-plans?lineId=&orgId=&status=active`
4. backend API: WorkRecord 저장 시 assignmentPlanId 받아서 저장
5. frontend: 작업 기록 입력 화면에 카드 선택 UI 추가
   - 라인 선택 → 해당 라인의 배정 카드 목록 드롭다운
   - 카드 선택 → 스타일/색상/공정 자동 로드
   - 수량 입력만 수동

---

## 1. 급여 계산 기능 개발 (미개발)

CT 기반 급여 계산 모듈 전체 구현. 데이터 기반 구조는 이미 준비됨.
(WorkLog.factoryWagePerSecond, WorkRecord.ctSeconds 모두 입력 시 스냅샷 저장됨)

### 확인 대상 파일
- `backend/prisma/schema.prisma` — Payroll 모델 추가 위치
- `backend/src/index.ts` — 급여 관련 기존 API 있는지 확인
- `frontend/src/pages/Payroll*.jsx` 또는 유사 파일 — 현재 급여 화면 상태

### 급여 계산 공식
`WorkRecord.ctSeconds × WorkRecord.quantity × WorkLog.factoryWagePerSecond`

### 구현 단계
1. 급여 계산 로직 설계 확정
   - 월별 집계 단위: workDate(YYYY-MM-DD) 기준 월 필터
   - 집계 단위: 직원별 (workerId 기준)
2. schema.prisma: Payroll 확정 모델 추가
   ```
   model PayrollSnapshot {
     id        Int      @id @default(autoincrement())
     orgId     Int
     month     String   -- "2025-02" 형식
     data      Json     -- 확정 시점의 급여 데이터 스냅샷
     lockedAt  DateTime
     lockedBy  String
     createdAt DateTime @default(now())
   }
   ```
3. `npx prisma migrate dev --name add_payroll_snapshot`
4. backend API:
   - `GET /payroll?orgId=&month=` — 월별 직원 급여 집계 (WorkRecord 조회 + 계산)
   - `POST /payroll/lock?orgId=&month=` — 급여 확정(잠금), PayrollSnapshot 생성
5. frontend: 급여 계산 화면
   - 월 선택 → 직원별 급여 목록 (이름, 공정별 내역, 합계)
   - 급여 확정 버튼 → 확정 후 잠금 (편집 불가)
   - 확정된 월은 스냅샷 데이터로 표시

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

## ~~6. CT 버전 관리 구현~~ ✅ 완료

- `processTime.js` — `ct` 필드 추가, `resolveProcessCtBaseSeconds` (ct→at→pt), `hasAnyCt`
- `ProductionPlanBoard.jsx` — `resolveProcessCtBaseSeconds` ct 우선순위 반영, 조정 요청 시 `ctOverride: true`, 목록에 "CT 임시" Chip 표시
- `StyleBoard.jsx` + `StyleProcess.jsx` — CT 컬럼 추가 (읽기 전용 Chip), CT 합계 푸터
- `CtReviewBoard.jsx` — CT 괴리율 컬럼, 스타일별 CT 현황 섹션 (AT vs CT, 재검토 권장 알림)

---

## 백로그 (우선순위 미정)

- 배정 계획 실수 복구 수단 — 현재 자동저장만 있어서 실수 시 되돌릴 방법 없음. undo/redo 또는 최근 N개 상태 보관 중 어떤 방식이 적합한지 결정 필요.
- 작업 계획 카드 진행률 바 — 일일 WorkRecord 기반으로 카드에 진행률 표시. 5번(assignmentPlanId 연결) 완료 후 구현 가능.
