# TODO

## 2026-07-13 assignment CT snapshot processKey legacy cleanup

- Done: Removed the runtime bridge that restored `styleProcessId` from legacy snapshot `processKey`. New reads now trust only explicit `processes[].styleProcessId` / `processId` for FK identity.
- Done: Removed CT snapshot reuse by `processKey` in the assignment save path. Existing/incoming CT rows are reused only when their `styleProcessId` matches the live `StyleProcess.id`.
- Done: Stopped backend canonical CT snapshot rebuilds from writing `processKey` into persisted process rows. Frontend save payload and production-plan helper snapshots were also adjusted away from persisted `processKey`.
- Done: Updated assignment/production UI snapshot lookups to match saved CT rows by `styleProcessId` instead of `processKey`, so removing persisted `processKey` does not break displayed CT seconds.
- Done: Added `migration_fix.sql` step 6-4f to remove `processKey` from `AssignmentPlan.assignmentCtSnapshot` and legacy `AssignmentBoardState.assignments[].assignmentCtSnapshot` process rows only when `styleProcessId` is already present.
- Note: `processKey` still exists as a local UI/draft row key in several components and as an internal `style-process:{id}` grouping key for progress maps. That is not a relation fallback and is intentionally separate from persisted CT snapshot legacy cleanup.
- Blocked/Note: The Railway URL available in this session connected to an empty/old-schema database (`AssignmentPlan` count 0, only legacy `ctSnapshot` column), so I did not run data cleanup SQL against it. Apply/verify 6-4f against the same populated DB where the previous 41-row CT snapshot backfill was applied.

## 2026-07-13 line-month capacity exact process remaining ST

- Done: Replaced the forecast backlog calculation for active AssignmentPlans with exact per-process remaining ST when snapshot process IDs and ST buckets are available: `sum(max(0, plannedQty - completedQtyForProcess) * process ST(q))`.
- Done: Kept `producedQuantity = min(process quantities)` for garment-completion/status semantics, but stopped using that min-ratio as the primary source for forecast remaining load. A single untouched process should not cause already-completed processes to be counted again.
- Done: `buildLineMonthCapacityRows` and `buildAssignmentPlanProgressRows` now share `calculateRemainingStTotalSecondsFromProcessProgress`; if exact process remaining ST cannot be computed, they fall back to the existing ratio/unknown path instead of guessing.
- Verified against production data before coding: LINE #1's 43 not-completed plans had 5,906.5h total planned ST, the old min-ratio remaining calculation inflated this to 3,549.6h, while exact process remaining ST is 442.2h with 0 missing ST buckets.
- Remaining: after deploy, browser-verify `/assignment` for 2026-07 LINE #1. Planned load should no longer stay pinned at 100%/September when most June work records are already near complete.

## 2026-07-13 assignment CT snapshot styleProcessId legacy backfill

- Superseded: `normalizeAssignmentCtSnapshotProcess` no longer restores `styleProcessId` from legacy `processKey`; persisted CT snapshot rows must carry explicit `styleProcessId`.
- Done: Added `migration_fix.sql` step 6-4e to backfill `AssignmentPlan.assignmentCtSnapshot.processes[].styleProcessId` idempotently. The parsed id must exist as `StyleProcess.id` and belong to the same `AssignmentPlan.styleId`; otherwise the snapshot is left untouched.
- Superseded: AGENTS.md §54 is now the current policy: persisted CT snapshot `processKey` is removed once `styleProcessId` exists; UI/draft row keys are separate.
- Done: Ran the production backfill. It updated 41 AssignmentPlan rows; missing `assignmentCtSnapshot.processes[].styleProcessId` dropped from 947/998 process rows to 0/998.
- Done: Verified L16-4/AJ1972 now has 26 required snapshot processes and all 26 WorkRecord totals equal the plan quantity (170/170 each, total 4,420). The persisted `scheduleStatus` column still contains the old `REVIEW_REQUIRED` value until the normal progress-refresh/snapshot persistence path rewrites it, but the exact-completion inputs are now valid.
- Remaining: browser-verify `/assignment` after reload with authenticated progress API data. No order unlock/relock or assignment cancel/recreate should be needed.

## 2026-07-13 line-month capacity forecast ignored actual progress (assignmentCtSnapshot.styleProcessId gap)

- Done: `buildLineMonthCapacityRows`/`buildAssignmentPlanProgressRows` (backend/src/index.ts) no longer let `producedRatio` collapse to 0 when `assignmentCtSnapshot.processes[].styleProcessId` is null (processCode present, id missing) - it now falls through to `operationalProgressRatio` instead of poisoning `Math.min(producedRatio, operationalProgressRatio)` to zero. See AGENTS.md §51.
- Done: Added `isProgressUnknown` (per-assignment) / `progressUnknownAssignmentCount` (per-line) diagnostics for the genuine "work recorded but neither ratio computable" case - excluded from the backlog sum instead of guessed at.
- Done: Added `capacityOverlapCount`/`capacityOverlapSamples` diagnostics to `/line-month-capacity` for an employee active on two lines the same day. Confirmed the normal LineAssignment write paths already prevent this via `closeActiveLineAssignments` - no write-path change made.
- Done: Frontend (`lineMonthCapacity.js`) now prefers the backend's own `lineRemainingBacklogStSeconds`/`forecastLoadStSeconds`/`carryInStSeconds`/`carryOutStSeconds`/`forecastLoadPercent` per line/month instead of re-simulating from a live per-assignment sum, and removed the silent `plannedStTotalSeconds` fallback when `isProgressUnknown` is true.
- Done: Capped `plannedLoadPercent` at 100 for historical months (was mirroring uncapped `actualOutputPercent`, which can legitimately show >100%).
- Done: `LineMonthCapacityBoard.jsx` shows `progressUnknownAssignmentCount` next to the existing ST-unknown warning, and a "진행률 확인 필요" chip on affected cards.
- Verified against production data: Line #1's 43 not-completed AssignmentPlans now total 546.9h remaining ST (68.4 worker-days / 8 workers ≈ 8.5 calendar days), matching the expected magnitude instead of the ~3.5-month (738.3 worker-day) figure the bug produced.
- Remaining: browser-verify LINE #1 at 2026-10 no longer shows a 10월 backlog, and that the ST-unknown/progress-unknown badges aren't over-firing on other lines.
- Remaining: query `capacityOverlapCount` against production data directly (this session only added the diagnostic, did not check whether it is currently nonzero).
- Superseded: the existing null `assignmentCtSnapshot.processes[].styleProcessId` data gap is now handled by the legacy snapshot backfill section above. Separate save-path monitoring is still useful if future new snapshots ever save with missing explicit ids again.

## 2026-07-13 work-log duplicate check false positive (assignmentPlanId scoping)

- Done: `buildWorkRecordWorkerStyleProcessSignature`(backend/src/index.ts) now scopes duplicate detection by `assignmentPlanId` instead of `styleId`, so the same style used across two different orders no longer false-positives as a duplicate. See AGENTS.md §49.
- Done: `WorkDetail.jsx` manual-entry duplicate detection now uses the same `workerId + assignmentPlanId + styleProcessId` policy as the backend, so frontend validation no longer blocks a backend-valid same-style/different-order row.
- Done: documented that multiple workers may legitimately split the same assignment/process; duplicate detection must include worker identity and must not treat over/under-production as a duplicate-input error.
- Done: `/work-logs/import` now attaches `DUPLICATE_WORK_RECORD` issues to the actual duplicate row(s) when the duplicate helper can identify them, instead of always using the group anchor row.
- Remaining: non-duplicate group-level validations can still report the group anchor row; keep this separate unless it causes operator confusion again.
- Remaining: consider a separate visibility/warning path for order quantity shortfall/overrun if the existing progress/settlement screens are not enough. Do not mix this into duplicate detection.

## 2026-07-13 attendance menu production grouping

- Done: Moved the Attendance menu item from Organization Management to Production Management while keeping the existing `/attendance` routes and `ATTENDANCE` feature key unchanged.
- Done: Adjusted the first-accessible-path priority so attendance follows work history in the production flow.
- Validation: `npm --prefix frontend run build` passed.

## 2026-07-13 style process PT/ST/AT input semantics

- Done: Changed the style process info tab so ST and AT are display-only there. ST remains editable through the purchase price/time matrix tab, and AT remains an output of the training pipeline rather than a manual input.
- Done: PT edits no longer reset ST buckets automatically for existing processes. The PT-change dialog defaults to keeping ST(q), and only the explicit "Update All ST" action writes every ST bucket from the new PT value.
- Done: Added per-process `workRecordCount`/`hasWorkRecords` to style process responses so the frontend can make that decision from the relational `StyleProcess -> WorkRecord` link instead of guessing.
- Done: Added explicit ST write intent for the time matrix path (`stBucketWriteMode: "MANUAL_EDIT"` + `stBucketUpdateQuantities`) so backend style saves only patch the changed bucket(s), not the whole `StyleProcessStandard` set carried in a stale full-process payload.
- Done: Reused the same explicit ST write intent for the PT-change "Update All ST" action, so bulk ST updates are still intentional and auditable instead of being inferred from a PT edit.
- Done: Changed backend style process sync to match existing processes by `StyleProcess.id` before `processCode`, preserve existing ST by default, and block deletion of any process that already has linked `WorkRecord` rows.
- Done: Removed ST bucket comparison from the legacy `Style.processes` self-heal drift check because `StyleProcessStandard` is now the relational source of truth for ST.
- Validation: `npm --prefix frontend run build` and `npm --prefix backend run build` passed after the policy correction.
- Validation: `npm --prefix frontend run build` passed after adding the PT-change "Keep ST / Update All ST" modal flow.

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
