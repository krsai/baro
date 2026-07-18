# TODO

이 문서는 "지금 남은 일"만 적는다.
각 항목은 아래 3가지만 바로 보이게 쓴다.

- 무슨 문제가 남아 있는가
- 실제로 뭘 고치거나 확인해야 하는가
- 지금 기준으로 어떤 판단이 끝났는가

## 1. 먼저 고칠 후보

### [높음] 라인/공장 삭제가 작업기록을 고아로 만드는 문제

문제:
라인이나 공장을 삭제할 때, 연결된 `WorkRecord`가 `AssignmentPlan` 없이 남는 경로가 있다. 이렇게 되면 진행률, 정산, 추적이 틀어질 수 있다.

해야 할 일:
- [ ] `WorkRecord.assignmentPlanId = null`로 만든 뒤 `AssignmentPlan`을 삭제하는 경로 제거
- [ ] 연결된 작업기록이 있으면 라인/공장 삭제를 `409`로 막기

현재 판단:
- [ ] 삭제 편의보다 데이터 무결성을 우선
- [ ] "기록이 있으면 삭제 금지" 정책으로 가는 방향

### [중간] 보드 범위 밖 날짜를 첫날로 치는 fallback 제거

문제:
보드가 오늘 날짜를 포함하지 않는데도 `AssignBoard.jsx`의 `getTodayDayIndex`가 `0`을 반환하면, 시스템이 보드 첫날을 기준일처럼 오해할 수 있다. 이런 식의 fallback은 잘못된 자동 배치나 초기 위치 선정으로 이어질 수 있다.

해야 할 일:
- [ ] 보드 범위 밖이면 `0`으로 fallback하지 않기
- [ ] `null`, `-1`, 또는 "기준일 없음" 같은 명시적 상태로 처리하기

현재 판단:
- [ ] fallback으로 땜빵하지 않기
- [ ] 잘못된 자동 배치보다 "기준일 없음" 상태를 드러내는 쪽이 맞음

### [중간] 프론트가 없는 assignment card를 가짜로 만들어 숨기는 문제

문제:
프론트가 `cardId` / `originOrderId` 문자열을 파싱해서 synthetic assignment card를 만들면, 실제 데이터가 비정상이어도 화면에서 문제를 숨겨버린다.

해야 할 일:
- [ ] synthetic assignment card fallback 제거
- [ ] 실제 `AssignmentCard` FK row가 없으면 화면에서 이상 상태를 드러내기

현재 판단:
- [ ] 화면이 덜 매끈해져도 데이터 이상을 숨기지 않는 쪽이 맞음

### [중간] 작업기록 duplicate 검증과 수량 경고가 섞여 헷갈리는 문제

문제:
중복 입력 오류와 주문 수량 부족/초과 같은 운영 경고가 한 덩어리처럼 보이면, 사용자가 왜 막혔는지 판단하기 어렵다.

해야 할 일:
- [ ] 비중복 group-level validation이 계속 혼란을 주는지 확인
- [ ] 필요하면 group anchor 표시와 row-level 표시를 분리
- [ ] 주문 수량 부족/초과는 별도 경고 또는 가시화 경로로 분리
- [ ] 위 경고를 duplicate 검증과 섞지 않기

현재 판단:
- [ ] "입력 오류"와 "생산 편차"는 다른 문제로 보여줘야 함

## 2. 맨 마지막에 개발할 것

### [높음] assignment 저장 시 마지막 저장이 앞선 저장을 덮어쓰는 문제

문제:
두 사람이 거의 동시에 assignment를 저장하면, 나중 저장이 먼저 저장한 내용을 조용히 덮어쓸 수 있다.

해야 할 일:
- [ ] `PUT /assignment-board-state`에 `updatedAt` 또는 version 비교를 넣어서 optimistic locking 적용

현재 판단:
- [ ] 실제로 발생 가능한 문제로 인정
- [ ] 다만 다른 정합성/구조 정리를 먼저 끝내고 맨 마지막에 개발
- [ ] 저장 충돌 시에는 조용히 덮어쓰기보다 에러를 보여주고 다시 불러오게 하는 방향

## 3. 배포 후 확인할 것

이 섹션은 "코드를 더 짜야 하는 일"이 아니라, 이미 반영된 변경이 운영에서 진짜로 맞게 보이는지 확인하는 체크리스트다.

### [검증] AT 표시와 새로고침 버튼 확인

확인할 것:
- [ ] 스타일 보드에서 AT 새로고침 버튼 재테스트
- [ ] AT가 rounded seconds로 보이는지 확인
- [ ] provisional / extrapolated 힌트가 의도대로 보이는지 확인

왜 보나:
AT 계산 로직과 표시 방식이 바뀌었기 때문에, 숫자 자체보다도 사용자가 "이 값이 확정치인지 임시치인지" 구분할 수 있어야 한다.

### [검증] `/assignment` 진행률/부하 계산이 과대 표시되지 않는지 확인

확인할 것:
- [ ] `/assignment`의 2026-07 LINE #1에서 planned load가 100% / 9월에 고정되지 않는지 확인
- [ ] `/assignment` 새로고침 후 authenticated progress API 기준으로 assignment 진행 상태가 정상 반영되는지 확인
- [ ] order unlock / relock 또는 assignment cancel / recreate 없이도 상태가 정상인지 확인
- [ ] LINE #1의 2026-10 backlog 과대 표시가 사라졌는지 확인
- [ ] ST-unknown / progress-unknown 배지가 다른 라인에서 과하게 뜨지 않는지 확인

왜 보나:
최근 수정은 "남은 ST"와 "진행률" 계산이 실제 작업기록을 제대로 반영하도록 바꾸는 작업이었다. 숫자가 다시 과장되면 수정 효과가 없는 것이다.

### [검증] capacity overlap 진단값이 실제 운영 데이터와 맞는지 확인

확인할 것:
- [ ] 운영 데이터에서 `capacityOverlapCount`를 직접 조회해 실제 겹침이 있는지 확인

왜 보나:
진단 카운트는 추가했지만, 운영 데이터에서 실제로 값이 나오는지는 아직 확인하지 못했다.

### [검증] 운영 환경 변수와 API 응답 상태 확인

확인할 것:
- [ ] Railway 백엔드 환경변수에 `SUPABASE_URL`, `SYSTEM_ADMIN_EMAIL`이 실제로 설정되어 있는지 확인
- [ ] 운영 배포 후 `GET /assignment-cards?orgId=1&includeProcesses=1`가 비어 있지 않은 `styles`를 반환하는지 확인

왜 보나:
코드가 맞아도 운영 환경 변수나 실제 API 응답이 비정상이면 화면은 여전히 깨질 수 있다.

### [검증] CT snapshot 관련 운영 반영 상태 확인

확인할 것:
- [ ] 운영 배포 후 `/assignment`에서 기존 CT `409`가 나던 카드들을 다시 드래그 저장해 재현이 사라졌는지 확인
- [ ] `migration_fix.sql`의 `AssignmentCard.payload` legacy key cleanup이 운영 DB에 실제 적용됐는지 확인

왜 보나:
이 항목은 코드 수정만으로 끝나지 않고, 운영 DB 상태까지 맞아야 진짜로 해결된다.
