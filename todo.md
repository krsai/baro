# TODO

## 2026-07-13 style process PT/ST/AT input semantics

- Done: Changed the style process info tab so ST and AT are display-only there. ST remains editable through the purchase price/time matrix tab, and AT remains an output of the training pipeline rather than a manual input.
- Done: PT edits now keep or reset ST buckets based on process work-record history. Existing processes with work records preserve their current ST(q) buckets when PT changes; processes without work records reset all standard ST buckets from the new PT(1,000) value after user confirmation.
- Done: Added per-process `workRecordCount`/`hasWorkRecords` to style process responses so the frontend can make that decision from the relational `StyleProcess -> WorkRecord` link instead of guessing.
- Done: Added a backend guard so an existing process with work records does not get PT-derived ST buckets created merely because the request omitted ST bucket data, and so PT-only edits can explicitly preserve existing ST rows without delete/recreate churn.
- Validation: `npm --prefix frontend run build` and `npm --prefix backend run build` passed.

## 2026-07-13 assignment board layout polish

- Done: Removed the visible "assignment cancel" text from the assignment board separator. The right-side unassigned panel remains the cancel drop target for assigned cards, but the UI now reads as a simple section divider with drag-over highlighting.
- Done: Moved the search/undo/redo/reset row into the sticky page toolbar so it stays fixed with the save controls while scrolling.
- Done: Made the line-month capacity table use a month-count-based minimum width instead of a fixed 980px minimum, and narrowed the unassigned-work column responsively so the line capacity area can fill the available screen width.
- Validation: `npm --prefix frontend run build` passed.

## 2026-07-13 work-log import unassigned assignment diagnostics

- Done: Checked `5월 (1).xlsx` and `6월 (1).xlsx`. May has 239 rows for assigned orders `L16-1`/`L16-2`; June has 391 rows and starts with `L16-3`, while production DB currently has `AssignmentPlan` rows only for `L16-1`/`L16-2`. `L16-3`/`L16-4` have manufacturer `AssignmentCard` rows but no line assignment plans, so work-log import correctly blocks them because `WorkRecord.assignmentPlanId` is mandatory.
- Done: Improved `/work-logs/import` diagnostics to distinguish "no assignment card" from "assignment card exists but is not assigned to a worker-factory line", and translated that case in the upload error modal.
- Validation: `npm --prefix frontend run build` passed. `npm --prefix backend run build` initially failed because local `backend/node_modules/jose` was missing despite being declared in package files; after `npm --prefix backend install`, the backend build passed. No package file changes were kept.

## 2026-07-13 style search numeric id crash

- Done: Fixed `StyleBoard` search filtering so every searchable field is normalized with `String(value ?? '')` before `toLowerCase()`. This prevents numeric `style.id` values from crashing the style list when a search term is typed.
- Validation: `npm --prefix frontend run build` passed.

## 2026-07-13 assignment cancel drop zone UX

- Done: Changed the assignment cancel target from a narrow dashed box into the vertical divider before the unassigned-work panel. While dragging an assigned card, the entire area to the right of that divider is now the cancel drop zone.
- Done: Updated DnD collision priority so an assigned card dropped over the unassigned-work panel resolves as `assignment-cancel-drop` first, instead of accidentally falling through to a line-row/slot placement.
- Validation: `npm --prefix frontend run build` passed.

## 2026-07-11 통합 리뷰 기준 미적용 항목

### 최우선
- [ ] 라인/공장 삭제 경로에서 orphan `WorkRecord`를 만들지 않도록 수정
  - `WorkRecord.assignmentPlanId = null` 후 `AssignmentPlan` 삭제하는 경로 제거
  - 연결된 작업기록이 있으면 라인/공장 삭제를 409로 막기

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
