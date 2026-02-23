# BARO 미구현 체크리스트 (검증 업데이트)

기준일: 2026-02-23  
검증 기준: 기존 `todo.md` 항목을 실제 코드/엔드포인트/UI 동작으로 재확인

## 1) 기존 항목 검증 결과

- [x] 서버 날짜 계산이 UTC 기준이던 문제
  판정: 구현 완료 (`backend/src/index.ts`의 `BUSINESS_TIME_ZONE`, `todayDateKey()` 적용 + `scripts/time-date-regression.test.mjs` 추가)

- [ ] AT가 수량별 함수가 아닌 단순 평균
  판정: 미구현 (`backend/src/index.ts`의 `syncStyleProcessActualTimesFromWorkRecords`에서 `at = totalSeconds / totalQuantity`만 계산, `atParams(a,b)` 학습/저장 없음)

- [ ] 라인 시프트 시간이 AT 계산에 반영되지 않는 문제
  판정: 미구현 (`backend/src/index.ts`의 `FACTORY_WORK_HOURS_PER_DAY = 8` 고정 사용, 라인별 시프트 입력/반영 경로 없음)

- [ ] 월급 단가 계산의 26일 × 8시간 고정 오차
  판정: 미구현 (`backend/src/index.ts`에서 `FACTORY_WORK_DAYS_PER_MONTH = 26`, `FACTORY_WORK_HOURS_PER_DAY = 8` 고정 분모 사용)

- [ ] 수량 변경 후 배정 기간 재계산 시 휴일 미반영
  판정: 미구현 (`frontend/src/pages/App/production/ProductionPlanBoard.jsx`의 ABSORB/DEDUCT 재계산이 `ceil(perPieceSeconds * qty / lineDailyCapacitySeconds)` 단순식)

- [ ] 공휴일이 로컬 브라우저에만 저장되는 문제
  판정: 미구현 (`frontend/src/utils/localData.js`의 localStorage 저장만 존재, 백엔드 holiday API/테이블 없음)

- [x] 소셜 로그인 시 기존 활성 멤버십이 있으면 즉시 로그인
  판정: 구현 완료 (`backend/src/index.ts`의 `/auth/context` + `frontend/src/context/AuthContext.jsx` 자동 컨텍스트 로딩)

- [ ] 신규 소셜 로그인 사용자 조직 선택/가입 신청 플로우
  판정: 부분 구현(백엔드만) (`/org-memberships/apply` API는 있으나 `frontend/src/pages/Auth/Signup.jsx`에 조직 선택/가입 신청 UI 없음)

- [ ] 배정 계획 실수 복구 수단(undo/redo 또는 상태 복원)
  판정: 미구현 (자동저장 스냅샷은 있으나 사용자 복구 UI/기능 없음)

- [ ] 작업 계획 카드 진행률 바(WorkRecord 기반)
  판정: 미구현 (`assignmentPlanId` 연결은 되어 있으나 카드 진행률 집계/표시 UI 없음)

## 2) 현재 미구현 TODO (우선순위)

### P0 (시간 정확도 필수)

- [ ] `atParams` 기반 AT(q) 학습 파이프라인 구현
- [ ] AT 산출 시 라인/일자별 실제 근무시간(시프트/연장) 반영
- [ ] 공임 단가 분모 고정(26일 × 8시간) 제거, 실제 근무 기준으로 전환
- [ ] DELTA ABSORB/DEDUCT 시 endIndex 재계산에 휴일/비근무일 반영
- [ ] 공휴일을 서버 저장(조직 공통)으로 전환하고 capacity 계산을 단일 기준으로 통일

### P1 (기능 완성도)

- [ ] 신규 소셜 로그인 온보딩 UI 구현(조직 선택, 기본정보, 가입 신청)
- [ ] 배정 보드 복구 기능 구현(undo/redo 또는 최근 N개 상태 복원)
- [ ] WorkRecord 누적 기반 카드 진행률 바 구현

### 정책 결정 필요

- [ ] 초과 공정(WorkRecord 누적 > finalQuantity) 급여 포함 여부 확정 후 반영
