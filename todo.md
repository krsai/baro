# TODO - Style FK migration

기준일: 2026-07-01

## 규칙

- 모든 `xxxId` 컬럼은 정수 FK를 의미한다.
- `uid`는 최종 스키마에서 사용하지 않는다.
- 스타일 업무 코드는 `Style.code`에만 저장한다.
- `WorkRecord`에는 고객명, 스타일명, 공정코드 같은 표시 텍스트를 복사 저장하지 않는다.
- 화면 표시값은 `styleId`, `styleProcessId`, `assignmentPlanId` relation으로 join해서 읽는다.

## 최종 구조

- `Style.id`: 정수 PK.
- `Style.code`: 스타일 업무 코드.
- `StyleProcess.styleId`: `Style.id` FK.
- `StyleProcessStandard.styleProcessId`: `StyleProcess.id` FK.
- `WorkOrderItem.styleId`: `Style.id` FK.
- `AssignmentPlan.styleId`: `Style.id` FK.
- `WorkRecord.styleId`: `Style.id` FK.
- `WorkRecord.styleProcessId`: `StyleProcess.id` FK.
- `AtTrainingBucketProcess.styleId`: `Style.id` FK.
- `AtTrainingBucketProcess.styleProcessId`: `StyleProcess.id` FK.

## 이번 작업에서 반영한 것

- Prisma schema를 `Style.id` / `Style.code` 기준으로 변경.
- 백엔드 저장/조회 로직을 `styleId` FK와 `styleProcessId` FK 중심으로 변경.
- `WorkOrderItem`, `AssignmentPlan`, `WorkRecord`, `AtTrainingBucketProcess`의 스타일 참조를 `Style.id` FK로 정리.
- `migration_fix.sql`에 레거시 `uid`, 문자열 `styleId`, `styleCode` 정규화 블록 추가.
- 임시 컬럼(`styleIdTemp`, `styleCodeLegacy`)과 텍스트 매칭 백필을 제거하고, 충돌/비정상 스키마는 migration에서 예외로 드러나게 변경.
- 런타임에서 스타일 코드/이름으로 `styleId`나 `styleProcessId`를 몰래 찾아 붙이는 fallback 제거.
- 구버전 `styleUid`/WorkRecord 스냅샷 백필 스크립트 제거.
- 시작 시 Prisma client drift 검사에 `Style.id`, `Style.code`, `WorkRecord.styleProcessId` 확인을 추가.

## 아직 확인할 것

- 운영 DB에 migration 적용 후 `/styles`, `/work-logs`, `/assignment-plan-progress`, `/line-month-capacity`, `/payroll` 응답 확인.
- `WorkRecord.styleId`, `WorkRecord.styleProcessId`, `WorkRecord.assignmentPlanId`가 비어 있는 기존 데이터 count 확인.
- `AssignmentCard`, `AssignmentBoardState` JSON 내부의 레거시 스타일 문자열은 별도 단계에서 정리.

## 검증 완료

- `npm --prefix backend run build`
- `npm --prefix backend run prisma:prepare-client`
- `npm --prefix frontend run build`
- `node --check backend/scripts/reset-to-baseline.js`
- `node --check backend/scripts/inspect-workrecord-state.js`
- `node --check backend/scripts/normalize-process-master-names.js`
- `node --check backend/scripts/verify-snapshot-st-backfill.js`
