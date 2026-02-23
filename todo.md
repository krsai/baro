# BARO 개선 TODO (미구현/불일치 기준)

기준일: 2026-02-23
작성 목적: 문서(agent.md)와 실제 구현의 불일치를 해소하고, 시간/급여 계산 오류 가능성을 제거한다.

## 진행 원칙
- 시간 관련 오류는 P0 최우선으로 처리한다.
- 정책이 바뀌지 않는 항목은 코드와 문서를 동시에 맞춘다.
- 각 항목은 "완료 기준"과 "Claude 검토 포인트"를 반드시 충족해야 완료로 본다.

## 오늘 실행 순서 (2026-02-23)
1. [완료] `P0-1` AT 학습 모델 불일치 해소
   - 오늘은 **B안(코드 보강)**으로 진행: `atParams`를 실제로 생성/갱신하도록 구현
2. [완료] `P0-2` atParams 경로 정합성 확정 (1번 결과와 연동)
3. [완료] `P0-3` AT 학습 실행 시점 보장(스케줄러)
4. [완료] `P0-4` stManual=false 공정의 CT 저장 정책 확정/반영
5. [완료] `P1-5` AT 컷오프 백엔드 유틸 추출 + 회귀 테스트 보강
6. [완료] `P1-6` 문서/스키마 불일치 정리
7. [완료] `P2-7` factoryId 공장 경계 보강
8. [완료] `P2-8` 동기화 관측성 로그 강화
9. [완료] `P2-9` (선택) 저우선 코드 정합성 정리

## 실행 검증 (2026-02-23)
- `npm --prefix backend run build` : PASS
- `npm --prefix frontend run build` : PASS
- `npm run test:regression` : PASS
  - quantity-change 3/3 pass
  - time-date 6/6 pass
- 재확인 메모:
  - `agent.md`의 `PayrollSnapshot`, `ctOverride`, AT 1차 구현 문구를 현재 코드 기준으로 교정 완료
  - 시간 정책은 `Asia/Seoul`, 출퇴근 미입력 시 8시간 폴백 유지

---

## P0 (즉시 개선)

### 1) AT 학습 모델 불일치 해소 (문서 vs 구현)
- 오늘 결정:
  - **B안 채택**: 백엔드에서 atParams를 실제 생성/갱신하도록 구현 진행
- 현재 문제:
  - 문서는 `AT(q)=a+b/q`, WLS/OLS/Clamp 학습을 설명함.
  - 실제 구현은 `nextAt = totalSeconds / totalQuantity` 단순 평균.
- 대상 파일:
  - `backend/src/index.ts`
  - `frontend/src/utils/processTime.js`
  - `agent.md`
- 구현 방식:
  1. 정책 결정: 아래 둘 중 하나 확정
     - A안(단기): 문서를 현실화(현재는 단순 평균 AT)하고 atParams 기반 표현을 "미구현"으로 명시
     - B안(중기): 백엔드에 atParams 산출/저장 파이프라인 구현
  2. A안 선택 시
     - `agent.md`에서 WLS/atParams 자동 산출 문구를 "계획"으로 분리
     - 프론트 `processTime.js`의 atParams 분기 유지 여부 결정(미사용 경로 경고 표시 또는 제거)
  3. B안 선택 시
     - `syncStyleProcessActualTimesFromWorkRecords`에서 `atParams`를 실제 갱신
     - 최소 단계로 `a=nextAt, b=0`부터 시작 후 버전/학습월 메타 추가
- 완료 기준:
  - 문서와 코드가 같은 모델을 설명한다.
  - `style.processes` 조회 시 AT 관련 필드가 문서 정의와 일치한다.
- Claude 검토 포인트:
  - 문서의 AT 정의와 `backend/src/index.ts` 계산식이 완전히 일치하는가.

### 2) atParams 경로 정합성 확보 (dead path 제거 또는 활성화)
- 연동 규칙:
  - 이 항목은 **항목 1의 A/B안 결정 이후** 같은 방향으로 연동 처리한다.
  - (항목 1 A안 선택 시: atParams 경로 축소/제거, 항목 1 B안 선택 시: atParams 경로 활성화)
- 현재 문제:
  - 프론트는 atParams 분기(`a*q+b`)를 사용 가능하게 구현됨.
  - 백엔드는 atParams를 갱신하지 않아 실질적으로 비활성 경로.
- 대상 파일:
  - `frontend/src/utils/processTime.js`
  - `backend/src/index.ts`
  - `agent.md`
- 구현 방식:
  1. 백엔드에서 atParams를 갱신할 계획이 없으면 프론트 분기를 제거/단순화
  2. 갱신할 계획이면 백엔드에서 atParams를 저장하고 프론트 분기 유지
  3. 어떤 선택이든 "현재 동작"을 문서에 명확히 표기
- 완료 기준:
  - atParams 관련 코드가 실제 데이터 흐름과 불일치하지 않는다.
- Claude 검토 포인트:
  - atParams가 실제로 생성/갱신/소비되는지 E2E 경로가 존재하는가.

### 3) AT 학습 실행 시점 보장 (매월 5일 00:00)
- 현재 문제:
  - 5일 컷오프 계산 로직은 있으나, 스케줄러가 없어 변경 이벤트가 없으면 실행 안 됨.
- 대상 파일:
  - `backend/src/index.ts`
  - (필요 시) scheduler 분리 파일 신규 추가
  - `agent.md`
- 구현 방식:
  1. `Asia/Seoul` 기준 매월 5일 00:00 실행 스케줄러 추가
  2. 서버 재시작/중복실행 방지 장치(락 또는 중복 실행 가드) 반영
  3. 변경 이벤트 트리거(출퇴근/작업기록 저장 후 동기화)는 유지하되, 정기 실행을 보조로 둠
- 완료 기준:
  - 스케줄러 로그 또는 실행 증빙이 남는다.
  - 5일 이후 데이터 변경이 없어도 AT 동기화가 수행된다.
- Claude 검토 포인트:
  - cron/스케줄 코드가 실제 부팅 경로에서 등록되는가.

### 4) `stManual=false` 공정의 CT 저장 정책 명확화
- 오늘 결정:
  - **A안 채택**: `stManual=false` 공정은 AT 갱신 시 DB `ct`도 동기화
- 현재 문제:
  - `ct`는 null일 때만 `at`로 초기화되고, 이후 AT가 바뀌어도 DB `ct`는 유지됨.
  - 화면 계산은 동적 AT 우선이라 DB 값과 의미가 분리됨.
- 대상 파일:
  - `backend/src/index.ts`
  - `frontend/src/utils/processTime.js`
  - `agent.md`
- 구현 방식:
  1. 정책 결정
     - A안: `stManual=false`면 백엔드도 AT 변경 시 `ct`를 계속 동기화
     - B안: `ct`는 초기값만 저장, 화면에서만 동적 계산 (문서에 명확히 기재)
  2. 선택한 정책대로 코드/문서 정렬
- 완료 기준:
  - DB의 `ct` 의미와 화면 계산 방식이 문서에 정확히 설명된다.
- Claude 검토 포인트:
  - 동일 공정에 대해 DB값/화면값 불일치가 의도인지 버그인지 명확한가.

---

## P1 (중요 개선)

### 5) 시간 회귀 테스트 보강 (AT 컷오프)
- 현재 문제:
  - `resolveAtTrainingMonthKey`에 대한 단위 테스트 부재.
  - 현재 함수가 `backend/src/index.ts` 내부에 있어 직접 임포트 테스트가 어려움.
- 대상 파일:
  - `backend/src/index.ts` (함수 추출 반영)
  - `backend/src/utils/atTrainingMonthKey.ts` (신규, 테스트 대상 유틸)
  - `scripts/time-date-regression.test.mjs`
- 구현 방식:
  1. `resolveAtTrainingMonthKey` 로직을 백엔드 유틸로 먼저 추출한다. (선행 필수)
  2. 백엔드 AT 동기화 경로가 추출 유틸을 사용하도록 교체한다.
  3. 회귀 테스트에서 해당 유틸을 직접 임포트해 경계 케이스를 검증한다.
  4. 5일 경계 케이스 추가 (day=4, day=5)
  5. 연도 경계 케이스 추가 (1월 4일/5일)
  6. 타임존 고정 입력으로 결정적 테스트 작성
- 완료 기준:
  - 경계 케이스 테스트가 CI/회귀 스크립트에 포함되어 pass.
  - 테스트가 실제 백엔드 유틸을 직접 검증한다.
- Claude 검토 포인트:
  - 추출된 유틸과 백엔드 사용 경로가 동일한 로직을 공유하는가.
  - 테스트가 실제 백엔드 로직과 동일 기준을 검증하는가.

### 6) 문서 스키마 불일치 정리 (정확성)
- 현재 문제:
  - `PayrollSnapshot` 문서 필드(`yearMonth`, `isLocked`)와 실제 스키마(`month`, `lockedAt`, `lockedBy`) 불일치.
  - `AssignmentPlan.ctOverride` 문서 설명과 실제 DB 스키마 불일치.
- 대상 파일:
  - `agent.md`
  - `backend/prisma/schema.prisma` (필요 시 실제 모델 변경)
- 구현 방식:
  1. 문서를 스키마 기준으로 교정
  2. `ctOverride`는 정책적으로 DB 컬럼 추가할지, 상태 조합(`ctStatus+ctSource`)로 유지할지 결정
- 완료 기준:
  - 문서의 데이터 모델 설명이 스키마와 1:1로 일치.
- Claude 검토 포인트:
  - 문서의 필드명/타입/의미가 schema와 완전히 동일한가.

---

## P2 (안정화/운영 가시성)

### 7) 출퇴근 조회의 공장 경계 보강 (`factoryId` 혼입 위험)
- 현재 문제:
  - AT 동기화 시 출퇴근 조회 쿼리에 `factoryId`가 없어 멀티공장에서 혼입 가능성.
  - 현재 리스크는 낮지만(작업자-공장 1:1 전제), 향후 공장 이동/다중 운영 시 오류 여지가 있음.
- 대상 파일:
  - `backend/src/index.ts`
- 구현 방식:
  1. workLog의 공장 정보와 worker 매핑 기준으로 조회 범위 제한
  2. 최소한 workerId 수집 단계에서 공장 기준 필터를 명확히 적용
- 완료 기준:
  - 다른 공장 출퇴근 데이터가 학습 입력에 섞이지 않음.
- Claude 검토 포인트:
  - 조회 where 조건과 worker 수집 로직이 공장 경계를 보장하는가.

### 8) AT 동기화 관측성 강화
- 현재 문제:
  - 동기화가 실패해도 운영자가 즉시 인지하기 어려움.
- 대상 파일:
  - `backend/src/index.ts`
- 구현 방식:
  1. 동기화 시작/완료/실패 로그를 구조화
  2. 학습 대상 월(`trainingMonthKey`), 처리 스타일 수, 갱신 공정 수를 로그에 포함
- 완료 기준:
  - 장애 시 로그만으로 원인 범위를 좁힐 수 있다.
- Claude 검토 포인트:
  - 운영 로그에 재현 가능한 메타데이터가 충분한가.

### 9) (선택) 저우선 코드 정합성 정리
- 현재 문제:
  - `resolveProcessCtBaseSeconds`가 공통 유틸/보드 로컬에 각각 존재해 역할이 혼란스러울 수 있음.
- 대상 파일:
  - `frontend/src/utils/processTime.js`
  - `frontend/src/pages/App/production/ProductionPlanBoard.jsx`
- 구현 방식:
  1. 함수 네이밍/역할을 분리하거나 공통 유틸로 일원화
  2. 주석으로 기준 우선순위(ST/AT/PT)를 명확히 남김
- 완료 기준:
  - 동일 역할 함수의 중복/혼란이 제거됨.
- Claude 검토 포인트:
  - 호출 경로별 함수 책임이 명확하고 중복이 최소화되었는가.

---

## Claude 검토 요청 시 전달할 체크리스트
- 문서(agent.md)와 구현 코드의 불일치를 "문서 오류/구현 오류/정책 미확정"으로 구분해서 표시
- 시간 관련 항목(P0-1~4)을 최우선으로 재검증
- 각 항목별로 file:line 근거와 재현 절차를 포함
- "완료 기준" 충족 여부를 항목별 pass/fail로 명시
