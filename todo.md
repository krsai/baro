# TODO 메모 - 2026-06-28

이 파일은 오늘 점검한 내용을 내일 사무실에서 바로 이어서 볼 수 있게 정리한 메모다.
내가 이해한 의도, 실제 코드 상태, 지금 건드려도 되는 것과 아직 건드리면 안 되는 것을 같이 적는다.

---

## 0. 오늘 실제로 반영한 것

오늘 코드에 이미 반영해서 커밋/푸시한 내용:

1. 출퇴근 보정 규칙 반영
   - `in`만 있고 `out`이 없으면 당일 `18:00` 퇴근으로 계산
   - `out`만 있고 `in`이 없으면 당일 `08:00` 출근으로 계산
   - 백엔드 계산과 프론트 출퇴근 화면 계산을 둘 다 맞춤

2. `Style.unitPriceUsd` 제거
   - 실제 사용처가 없어서 스키마와 백엔드 응답에서 제거
   - 배포 시 DB에서도 같이 내려가도록 `migration_fix.sql` 수정

3. `WorkRecord processName` 보강
   - 과거 작업기록이 `processId/styleUid`를 못 받은 채 남아 있는 문제를 확인
   - 읽을 때 `processCode/styleId` 기준으로 다시 보강해서 응답에 공정명이 살아나게 수정
   - 백필 스크립트도 확장해서 과거 `WorkRecord`의 `styleUid/styleName/processId/processCode`를 메울 수 있게 수정

오늘 반영 커밋(이 메모 전):
- `40f31cf` - `출퇴근 보정과 작업기록 참조 정리를 반영`

---

## 1. 지금 결론만 먼저

### 결론 A. `WorkRecord`의 색상 계열 칼럼은 지금 당장 지우면 안 됨

내가 처음 보기엔 사용자 의도상 맞는 말이다.
- 색상은 주문에서만 구분
- 배정/작업기록은 색상 없이 수량 집계

그런데 실제 코드에서는 아직 색상 칼럼을 참조하는 곳이 남아 있다.
특히 아래가 문제:
- `backend/src/quantity-settlement/quantitySettlement.service.ts`
- 일부 배정/QC/정산 보조 로직

즉, "의도상 불필요"와 "코드상 실제 미사용"은 아직 다르다.

내 의견:
- 지금 바로 DB 컬럼을 삭제하면 높은 확률로 다른 정산 화면이 깨진다.
- 먼저 "색상 없이도 완전히 동일하게 동작하는지"를 정산/QC 기준으로 정리한 다음 지우는 게 맞다.

### 결론 B. `processName`이 빈 이유는 fallback 때문이라기보다 과거 데이터 정리가 덜 된 쪽

핵심 원인:
- 새로 저장되는 작업기록은 `syncWorkRecordRefs`를 통해 `processId/processName/styleUid/styleName` 등을 채우려는 구조가 있음
- 그런데 과거 데이터는 그 정규 참조가 비어 있는 row가 남아 있음
- 기존 백필 스크립트는 사실상 `orderNo`, `lineId` 위주만 채우고 있었음

즉 "아예 설계가 없다"기보다
"설계는 있는데 과거 데이터가 그 설계 상태로 정리되지 못한 것"에 가깝다.

내 의견:
- `WorkRecord`는 장기적으로 문자열 `processName`에 의존하면 안 됨
- 진짜 소스오브트루스는 `processId`
- 다만 운영 편의를 위해 응답 단계에서 `processCode`로 이름을 보강해 주는 것은 현실적으로 좋음

### 결론 C. `employee.lineName`은 레거시 fallback 성격이 강함

이건 사용자 걱정이 맞다.
- 직원이 1라인 -> 2라인으로 이동 가능
- 그런데 `employee.lineName`은 현재 스냅샷 같은 값이라 과거 이력을 제대로 설명하지 못함

실제 더 믿을 수 있는 값:
- `LineAssignment` 이력
- `WorkRecord.lineId`
- `WorkLog.records` 안의 `lineName/lineId`

문제:
- 일부 월간 화면 유틸이 아직 `employee.lineName` fallback을 씀

내 의견:
- `employee.lineName`은 당장 삭제 대상은 아님
- 하지만 "역사 데이터 표시" 기준으로는 절대 메인 소스가 되면 안 됨
- 장기적으로는 `LineAssignment + WorkRecord.lineId` 중심으로 바꾸는 게 맞다

### 결론 D. 임금(`targetMonthlyWage`, `wagePerSecond`)은 지금 "월 기준 버전 관리"가 없음

현재 실제 급여 계산 흐름:
- 공장 정보의 `Factory.wagePerSecond` 사용
- 작업기록 저장 시점에 `WorkLog.factoryWagePerSecond`로 스냅샷 저장
- 급여 계산은 나중에 `WorkLog.factoryWagePerSecond`를 읽음

즉 지금 구조는:
- "현재 공장값을 작업기록 저장 시점에 복사해둔다"
- "월별 정책 이력"은 없음

사용자 의도:
- 예를 들어 6/28에 바꾸면 6월 작업기록 급여에 새 기준을 default로 쓰고 싶다

내 의견:
- 이건 맞는 요구다
- 다만 지금 구조로는 "언제부터 적용"을 명확히 설명할 수 없다
- 반드시 "공장 공임 이력 테이블" 또는 "월별 wage snapshot 정책"이 필요하다

중요:
- `Organization.targetMonthlyWage / wagePerSecond`가 null인 것은 현재 급여 계산 핵심 경로가 아니라서 그럴 가능성이 큼
- 지금 실사용은 조직이 아니라 공장(`Factory`) 쪽이다

### 결론 E. `AssignmentPlan.colorId/colorName/gender`, `WorkRecord.colorId/colorCode`도 일단 삭제 보류

의도상 null이어도 괜찮은 건 맞다.
하지만 실제 참조가 남아 있어서 지금 물리 삭제는 위험하다.

내 의견:
- 먼저 "정말로 주문 단에서만 색상 유지"로 구조를 정리
- 그 다음 DB 컬럼 드랍

---

## 2. 오늘 코드 점검 결과 상세

### 2-1. `Style.unitPriceUsd`

확인 결과:
- 스키마에는 있었음
- 백엔드 저장/응답 DTO에는 있었음
- 실제 화면 계산/입력 흐름은 `revenuePriceBuckets`, `revenueMemo`를 사용
- 즉 사실상 죽은 필드에 가까웠음

판단:
- 제거해도 안전하다고 판단

반영:
- `backend/prisma/schema.prisma`
- `backend/src/index.ts`
- `backend/migration_fix.sql`

### 2-2. `processName`

확인 결과:
- `WorkRecord` 테이블에는 `processName` 컬럼 자체가 없음
- 응답에서 `record.process.name` 또는 runtime `record.processName`을 보여주는 구조
- 즉 진짜 핵심은 `processId`가 살아 있느냐임

운영 데이터에서 보였던 현상:
- `styleId`, `processCode`, `assignmentPlanId`, `workerId`, `lineId`는 있는데
- `styleUid`, `processId`, `styleName`, `processName` 등이 비어 있는 row가 있었음

해석:
- 과거 저장분이 정규 참조 없이 남아 있었던 것

오늘 조치:
- 응답 만들 때 `syncWorkRecordRefs`를 한 번 더 태워서 `processCode`로 공정명 복구
- 백필 스크립트 확장

남은 숙제:
- 운영 DB 기준으로 백필을 실제 한 번 실행해야 할 수 있음

### 2-3. `lineName`

확인 결과:
- `employee.lineName`은 아직 코드 여러 곳에서 사용 중
- 라인 배정/해제/라인명 변경 시 같이 업데이트하는 레거시 방식이 남아 있음
- 월간 작업 화면 일부는 이것을 fallback으로 사용

왜 찜찜한가:
- 이 값은 "현재 소속 라인명" 성격이지 "과거 시점의 진실"이 아님
- 사람이 라인을 옮기면 과거 데이터 해석이 흔들릴 수 있음

내 의견:
- 조회 편의용 캐시 정도로만 남길 수는 있어도
- 집계/역사 해석의 기준값으로는 부적절

### 2-4. 공장 공임 / 월 목표 임금

확인 결과:
- 공장 정보(`Factory`)에는 `targetMonthlyWage`, `wagePerSecond` 저장됨
- 작업기록 저장 시 `factoryWagePerSecond`를 `WorkLog`에 스냅샷 저장
- 급여 계산은 이 스냅샷을 읽음

문제:
- "언제부터 새 값 적용?"에 대한 정책이 없다
- 월 중간 변경, 소급 변경, 월 마감 이후 재계산 기준이 불명확

내 의견:
- 이건 지금 null 여부보다 설계가 더 중요한 문제
- 단순 필드 보정으로 해결할 일이 아님

### 2-5. 출퇴근 단측 입력

확인 결과:
- 기존 로직은 `clockIn`, `clockOut` 둘 다 있어야만 `workedSeconds` 계산
- 하나라도 없으면 null

오늘 반영:
- `in만 있음 -> 18:00 퇴근`
- `out만 있음 -> 08:00 출근`

내 의견:
- 이건 실무적으로 매우 타당
- 나중에 필요하면 "기본 보정값(08:00/18:00)"을 환경설정으로 뺄 수도 있음

---

## 3. 내일 우선순위 추천

### 1순위: 색상 컬럼 삭제 여부를 결정하기 전에 "참조 제거"부터

내일 바로 할 일:

1. `quantitySettlement.service.ts`에서 색상 없이도 같은 결과가 나오는지 확인
2. QC 쪽에서 `colorId`가 정말 없어도 되는지 확인
3. 배정 보드/작업기록/정산에서 색상 관련 UI가 실제 업무상 필요한지 다시 확인

내 의견:
- 컬럼 삭제보다 "참조 제거"가 먼저다
- 참조가 남아 있는데 컬럼부터 드랍하면 문제를 뒤늦게 찾게 된다

### 2순위: `lineName`을 역사 집계에서 밀어내기

목표:
- 월간 작업 집계/상세에서 `employee.lineName` 의존 줄이기

추천 방향:
- 우선순위 1: `WorkRecord.lineId`
- 우선순위 2: `WorkLog`의 line 메타
- 우선순위 3: 정말 없을 때만 `employee.lineName`

내 의견:
- 완전 삭제 전까지는 fallback으로 둘 수 있지만
- "현재 직원 라인명"이 과거 기록까지 설명하는 구조는 빨리 벗어나는 게 좋다

### 3순위: 공장 공임 정책 이력 설계

내가 권하는 방향:

안 1. 월 기준 이력 테이블
- 예: `FactoryWageHistory`
- 컬럼 예시:
  - `factoryId`
  - `effectiveMonth`
  - `targetMonthlyWage`
  - `wagePerSecond`
  - `createdAt`
  - `createdBy`

장점:
- "2026-06은 얼마, 2026-07은 얼마"가 명확
- 급여 재계산 기준이 설명 가능

안 2. 작업기록 저장 시 스냅샷 유지 + 월 정책 테이블도 같이 운영

장점:
- 현재 구조를 덜 깨고 갈 수 있음

내 의견:
- 무조건 안 1 또는 안 2로 가야 한다
- 지금처럼 "현재 공장값을 작업기록 저장 시 복사"만으로는 기준 설명이 약하다

---

## 4. 내일 절대 서두르지 말아야 하는 것

### A. `WorkRecord.colorId/colorCode` 바로 삭제

이유:
- 정산 로직이 아직 참조함

### B. `AssignmentPlan.colorId/colorName/gender` 바로 삭제

이유:
- 배정/QC/정산 보조 흐름과 엮여 있을 가능성이 큼

### C. `employee.lineName` 바로 삭제

이유:
- 일부 화면 fallback이 아직 남아 있음

### D. 조직(`Organization`)의 임금 필드를 바로 제거

이유:
- null이라도 다른 응답 DTO나 UI 표시에서 아직 흔적이 있음
- 먼저 "정말 레거시인지" 확정해야 함

---

## 5. 내가 보기엔 이렇게 가는 게 가장 안전함

### 1단계
- 오늘 반영한 것 배포 확인
- 출퇴근 보정 정상 동작 확인
- 스타일 화면/스타일 저장에서 `unitPriceUsd` 제거 후 문제 없는지 확인

### 2단계
- 작업기록 상세/월간 화면에서 `processName`이 다시 보이는지 확인
- 안 보이면 운영 DB에서 백필 스크립트 실행 검토

### 3단계
- 색상 관련 참조를 하나씩 제거할지, 아니면 유지할지 업무 기준 확정

### 4단계
- `lineName` 역사값 설계 정리

### 5단계
- 공장 공임 이력 설계

---

## 6. 핵심 파일 메모

내일 다시 볼 때 우선 확인할 파일:

- 출퇴근 계산
  - `backend/src/index.ts`
  - `frontend/src/pages/App/attendance/AttendanceBoard.jsx`

- 작업기록 공정/스타일 참조 보강
  - `backend/src/index.ts`
  - `backend/scripts/backfill-workrecord-canonical-fields.js`

- 색상 의존 정산
  - `backend/src/quantity-settlement/quantitySettlement.service.ts`

- 라인명 fallback
  - `frontend/src/pages/App/work/workMonthlyUtils.js`
  - `backend/src/lines/line.routes.ts`

- 공장 임금/공임
  - `backend/src/factories/factory.routes.ts`
  - `backend/src/payroll/payroll.service.ts`
  - `frontend/src/pages/App/work/WorkDetail.jsx`
  - `frontend/src/pages/App/organization/factoryDetail/FactoryDetail.jsx`

---

## 7. 내 의견 한 줄 요약

지금 가장 중요한 건 "null 필드를 무조건 지우는 것"이 아니다.

더 중요한 건:
- 어떤 값이 진짜 소스오브트루스인지 다시 고정하고
- 과거 데이터가 그 구조를 못 따라간 부분은 백필하고
- 업무적으로 안 쓰기로 한 필드는 "참조 제거 -> 검증 -> 컬럼 삭제" 순서로 가는 것이다.

색상, 라인명, 공임 이력은 다 이 순서를 지켜야 안전하다.

---

## 8. 내일 시작할 때 추천 체크리스트

1. 오늘 반영분 배포 버전인지 먼저 확인
2. 출퇴근에서 `in만 입력`, `out만 입력` 케이스 테스트
3. 작업기록/월간 화면에서 `processName` 표시 확인
4. 정산 화면이 색상 없이도 성립하는지 코드와 화면 둘 다 확인
5. 공장 공임 변경 시 "6월 작업기록은 어떤 값으로 계산되어야 하는지" 정책 먼저 문장으로 확정

끝.
