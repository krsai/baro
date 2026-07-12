# TODO

## 2026-07-11 통합 리뷰 기준 미적용 항목

### 최우선
- [ ] 라인/공장 삭제 경로에서 orphan `WorkRecord`를 만들지 않도록 수정
  - `WorkRecord.assignmentPlanId = null` 후 `AssignmentPlan` 삭제하는 경로 제거
  - 연결된 작업기록이 있으면 라인/공장 삭제를 409로 막기

- [ ] 배정 저장 시 CT 우회 저장 경로 제거
  - `preserveExistingAssignmentCtSnapshotsForSave` 재설계 또는 제거
  - 현재 수량/스타일과 불일치하는 기존 CT snapshot 재사용 금지
  - live CT 재생성 실패 시 저장을 hard fail로 유지하기

### 다음 순위
- [ ] 미완료 assignment 일반 저장에도 optimistic locking 추가
  - `PUT /assignment-board-state`에 `updatedAt` 또는 version 비교 적용
  - 마지막 저장이 앞선 저장을 조용히 덮어쓰지 못하게 하기

- [ ] `AssignBoard.jsx`의 `getTodayDayIndex` 범위 밖 fallback `0` 수정
  - 오늘 날짜가 현재 보드 범위 밖일 때 과거 인덱스 `0`으로 재배치 기준이 잡히지 않게 하기

- [ ] 프론트 synthetic assignment card fallback 제거
  - `cardId` / `originOrderId` 문자열 파싱으로 카드를 다시 만들지 않기
  - 실제 `AssignmentCard` FK row가 없으면 화면에서 문제를 드러내도록 바꾸기

- [ ] 남은 배정 display/string fallback 정리
  - `resolveAssignmentDisplayFallback`
  - `findOrderItemByAssignmentIdentity`
  - FK 기반 조회로 대체하거나 완전히 제거하기

### 배포 후 확인
- [ ] Railway 백엔드 환경변수에 `SUPABASE_URL`, `SYSTEM_ADMIN_EMAIL`이 실제로 설정되어 있는지 확인
- [ ] 운영 배포 후 `GET /assignment-cards?orgId=1&includeProcesses=1`가 비어 있지 않은 `styles`를 반환하는지 확인
- [ ] 운영 배포 후 `/assignment`에서 기존 CT 409가 나던 카드들을 다시 드래그 저장해 재현이 사라졌는지 확인
- [ ] `migration_fix.sql`의 `AssignmentCard.payload` legacy key cleanup이 운영 DB에 실제 적용됐는지 확인
