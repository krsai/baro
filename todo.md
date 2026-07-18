# TODO

## 우선 수정

- [ ] 라인/공장 삭제 경로에서 orphan `WorkRecord`가 생기지 않도록 수정
- [ ] `WorkRecord.assignmentPlanId = null` 후 `AssignmentPlan`을 삭제하는 경로 제거
- [ ] 연결된 작업기록이 있으면 라인/공장 삭제를 `409`로 막기
- [ ] 미완료 assignment 일반 저장에도 optimistic locking 추가
- [ ] `PUT /assignment-board-state`에 `updatedAt` 또는 version 비교 적용
- [ ] `AssignBoard.jsx`의 `getTodayDayIndex`가 보드 범위 밖일 때 `0`으로 fallback하지 않도록 수정
- [ ] 프론트 synthetic assignment card fallback 제거
- [ ] `cardId` / `originOrderId` 문자열 파싱으로 카드를 다시 만들지 않기
- [ ] 실제 `AssignmentCard` FK row가 없으면 화면에서 문제를 드러내기
- [ ] 남은 배정 display/string fallback 정리
- [ ] `resolveAssignmentDisplayFallback` 정리
- [ ] `findOrderItemByAssignmentIdentity` 정리
- [ ] FK 기반 조회로 대체하거나 완전히 제거하기
- [ ] 작업기록 중복 검사에서 비중복 group-level validation이 계속 혼란을 주는지 확인
- [ ] 필요하면 group anchor 표시와 별도 row-level 표시를 분리
- [ ] 주문 수량 부족/초과에 대한 별도 경고 또는 가시화 경로 필요 여부 검토
- [ ] 위 경고는 duplicate 검증과 섞지 않기

## 배포 후 확인

- [ ] 스타일 보드에서 AT 새로고침 버튼 재테스트
- [ ] rounded AT seconds 표시와 provisional / extrapolated 힌트 노출 확인
- [ ] `/assignment`의 2026-07 LINE #1에서 planned load가 100% / 9월에 고정되지 않는지 확인
- [ ] `/assignment` 새로고침 후 authenticated progress API 기준으로 assignment 진행 상태가 정상 반영되는지 확인
- [ ] order unlock / relock 또는 assignment cancel / recreate 없이도 상태가 정상인지 확인
- [ ] LINE #1의 2026-10 backlog 과대 표시가 사라졌는지 확인
- [ ] ST-unknown / progress-unknown 배지가 다른 라인에서 과하게 뜨지 않는지 확인
- [ ] 운영 데이터에서 `capacityOverlapCount`를 직접 조회해 실제 겹침이 있는지 확인
- [ ] Railway 백엔드 환경변수에 `SUPABASE_URL`, `SYSTEM_ADMIN_EMAIL`이 실제로 설정되어 있는지 확인
- [ ] 운영 배포 후 `GET /assignment-cards?orgId=1&includeProcesses=1`가 비어 있지 않은 `styles`를 반환하는지 확인
- [ ] 운영 배포 후 `/assignment`에서 기존 CT `409`가 나던 카드들을 다시 드래그 저장해 재현이 사라졌는지 확인
- [ ] `migration_fix.sql`의 `AssignmentCard.payload` legacy key cleanup이 운영 DB에 실제 적용됐는지 확인
