# BARO - 봉제 생산관리 시스템 Agent 참조 문서

## 프로젝트 개요

봉제(縫製) 공장을 위한 B2B 생산관리 웹 애플리케이션.
수주자(봉제 공장, MANUFACTURER)와 발주자(브랜드, BRAND) 두 유형의 조직을 지원한다.

**스택**: React (Vite) + MUI / Node.js + Express 5 + Prisma + PostgreSQL + Supabase Auth

---

## 핵심 도메인 개념

### CT (Contracted Time) — 가장 중요한 개념
- **CT = 계약된 사이클타임** (초/개 단위)
- PT(Planned Time)와 AT(Actual Time)는 CT를 결정하기 위한 참고값일 뿐
- **라인장이 동의(Agree)해야 CT가 확정(snapshot)**된다
- 확정된 CT는 급여 계산의 기준이 됨
- AssignmentPlan의 ctStatus: PENDING → AGREED / REJECTED
- AssignmentPlan의 contractedSeconds: CT 합의 시 확정된 값 (이후 Style.processes 변경과 무관)

### 작업 배정 (Assignment) vs 작업 기록 (WorkLog)
- **작업 배정은 계획이다.** 실제 작업 결과와 다른 것이 정상
- 실제 작업 기록이 배정 계획의 내용(CT, 수량 등)에 영향을 주지 않음
- 현장에서는 A작업과 B작업을 섞어서 진행할 수 있고, 계획과 실제 순서가 다를 수 있음

### 작업 기록 입력 흐름 (개선 예정)
- 작업자는 모두 라인에 배정되므로, 작업 기록 입력 시 **라인에 배정된 카드 목록을 먼저 조회**
- 카드 선택 → 스타일, 색상, 공정 목록 자동 로드 (CT 포함)
- 작업자는 공정별 수량만 입력
- WorkRecord에 `assignmentPlanId` 자동 연결 → WorkRecord ↔ AssignmentPlan 연결 확보
- 한 라인에 카드가 여러 개 있으면(A/B 혼용) 카드를 각각 선택해 기록

### 급여 계산 기준
- **급여 = WorkRecord 기반** — 공정이 기록되면 지급 대상 (옷 전체 완성 여부와 무관)
- 카드(AssignmentPlan) 완료 여부는 급여와 무관
- WorkLog.factoryWagePerSecond, WorkRecord.ctSeconds 모두 입력 시점의 스냅샷으로 저장됨

### 라인 capacity 계산
- 일일 capacity = 라인 인원 수 × 시프트 시간(초)
- LineAssignment로 인원 변동 이력 관리 (startAt / endAt)
- 라인 인원이 변경되면 해당 라인의 AssignmentPlan capacity를 재계산해야 함
- AssignmentPlan에는 계획 당시의 headcount가 별도 저장되지 않음 (현재 이슈)

### 급여 계산 (아직 미개발)
- 기준: WorkRecord의 ctSeconds × 수량 × factoryWagePerSecond
- WorkLog에 factoryWagePerSecond 스냅샷이 이미 저장됨 (Factory 단가 변경에 무관)
- WorkRecord에 ctSeconds 스냅샷이 이미 저장됨 (Style CT 변경에 무관)
- 월별 급여 확정(잠금) 기능 필요 → 확정 후에는 소급 변경 불가

---

## 데이터 모델 요약

Organization (MANUFACTURER | BRAND)
  └─ Factory
       └─ Line
            └─ LineAssignment (직원-라인 배정, startAt/endAt)
  └─ Employee (OrgMembership 1:1)
  └─ Style (processes: JSON [{code, name, PT, AT}], bom: JSON)
  └─ WorkOrder (items: JSON)
  └─ AssignmentPlan (lineId, ctStatus, contractedSeconds, startIndex, endIndex)
  └─ AssignmentBoardState (cards: JSON, assignments: JSON) — 단일 자동저장
  └─ WorkLog (workDate, factoryWagePerSecond snapshot)
       └─ WorkRecord (workerId, assignmentPlanId, ctSeconds snapshot, quantity)

### AssignmentBoardState 주의사항
- 조직당 단 1개의 레코드 (upsert)
- 500ms debounce로 자동저장
- 현재 버전 관리 없음 — 이전 상태 복원 불가

### 카드(Card) 개념
- (수주 × 스타일 × 색상 × 성별) 조합으로 자동 생성되는 배정 단위
- 미배정(unassigned pool)과 배정(line timeline) 상태로 구분
- 카드는 수량 기준으로 분할(split) / 병합(merge) 가능
- 카드에 배정된 수량과 수주 수량은 독립적 (수동 관리)

### 수주 수량 변경 시 차이 카드 처리
- 수주 수량 변경 시 기존 배정 카드를 직접 수정하지 않음
- 차이만큼 "차이 카드"를 미배정 풀에 생성
- +차이 카드: 빈 라인 드롭 → 새 배정 / 기존 카드 위 드롭 → 수량 흡수(병합)
- -차이 카드: 드래그 시 관련 배정 카드 하이라이트 / 해당 카드 위 드롭 → 수량 차감
- 동일 수주의 분할 카드들은 카드 윤곽선 색상으로 그룹 표시

---

## 비즈니스 규칙

1. CT는 라인장 동의 시점에 확정(snapshot)됨 — 이후 PT/AT 변경과 무관
2. WorkLog/WorkRecord는 직원 퇴사 후에도 보존 (workerId nullable)
3. 작업 배정 계획과 실제 작업 기록은 독립적으로 유지
4. 수주 수량과 배정 카드 수량은 별도 관리 (카드는 수주를 쪼개서 배정)
5. 급여 계산은 WorkRecord의 ctSeconds 기준 — Style.processes 변경 영향 없음
6. 라인 인원 변경 시 해당 라인의 배정 계획 capacity 재계산 필요

---

## 개발 시 주의사항

- 다국어: 한국어 UI, 영문 코드/enum
- 날짜 인덱스: AssignmentPlan의 startIndex/endIndex는 달력 기준 일(day) 오프셋
- 휴일: 브라우저 localStorage에 저장, 일요일 + 공휴일 제외하여 capacity 계산
- 멀티테넌시: 모든 쿼리에 orgId 필터 필수
- Supabase Auth + Express 미들웨어로 인증 처리
- 개발 모드: DEV_BYPASS 플래그로 테스트 프로파일 사용 가능
