# TODO

## 2026-07-09 assignment card save response display hydration

- Done: Fixed the save-only unassigned card display break where cards looked correct after reload but changed to `order number none` / numeric style labels immediately after saving. `syncAssignmentCardsForOrg` now returns freshly persisted `AssignmentCard` rows through `loadAssignmentCardsForOrg`, so the PUT response uses the same FK+join display hydration as normal GET responses.
- Data safety: no DB deletion/rebuild change; persisted JSON still excludes duplicate display fields, and response display fields come from real `styleId`/`workOrderId`/`buyerOrgId` joins.
- Validation: `npm --prefix backend run build` passed.

## 2026-07-09 assignment board reload FK repair

- Done: Fixed the reload-only broken assignment display where legacy `AssignmentPlan` rows with missing `workOrderId`/`styleId`/`buyerOrgId` showed internal card ids until the user saved the board. `GET /assignment-board-state` and read-only board responses now fill only missing `AssignmentPlan` FK columns from the linked `AssignmentCard` row's real FK columns via `assignmentCardId`.
- Data safety: no delete/recreate path added; existing non-null FK values are not overwritten, and payload/string/cardId parsing is not used for repair.
- Validation: `npm --prefix backend run build` and `npm run test:regression` passed.
- Remaining: after deploy, reload `/assignment` once and confirm the warning log reports any repaired rows at most once; subsequent reloads should not require pressing Save to restore display fields.

## 2026-07-08 §47 이후 미흡점 점검 및 수정 (72f608e 500 에러 패턴 재검색 + 5개 항목)

- **Claude 리뷰 후속 반영(2026-07-08)**: `resolveAssignmentPlanStyleQueryValues`가 숫자 `styleId`만 반환해 작업기록 import의 `STYLE` 텍스트(code/name) 매칭이 깨질 수 있던 문제를 수정 — `AssignmentPlan.style` relation의 canonical `code/name` 후보를 복구하되 payload/cardId 파싱은 계속 금지. `AssignmentCard.payload` 저장 sanitizer에서 `colorName/gender`도 제거(배정 카드 identity에서 색상/성별 추적 안 함). `toAssignmentPlanWriteData`의 `workOrderId`도 검증된 `AssignmentCard.workOrderId` 우선으로 통일. `loadOrderAssignmentModificationLockMap`은 plan/card `workOrderId` drift를 warning으로 드러내도록 보강. 보드 저장 트랜잭션은 `AssignmentCard` upsert를 plan sync보다 먼저 실행하고, 그 FK 결과로 assignments를 hydrate해 같은 PUT 안의 카드/배정 동시 저장 순서 문제를 막음. Prisma `Employee` back-relation의 어색한 복수형 4쌍도 정정. 검증: `npm --prefix backend run build`, Prisma validate, `npm run test:regression` 통과.
- **2026-07-08 핫픽스: 배정 저장 409(`missing workOrderId FK`)**: 리팩토링 후 `toAssignmentCardFromStoreRow`는 `row.workOrderId/styleId/buyerOrgId`만 응답에 붙이도록 바꿨는데, `loadAssignmentCardsForOrg`의 Prisma select가 scalar FK 컬럼을 빠뜨리고 relation(`workOrder/style/buyerOrg`)만 가져오고 있었다. 그 결과 프론트 카드 객체의 `workOrderId`가 `null`로 내려가고, 새로 라인에 드롭한 assignment payload도 `workOrderId:null`이 되어 `PUT /assignment-board-state`가 409로 실패했다. `loadAssignmentCardsForOrg` select에 FK scalar 3개를 추가하고, 저장 시에도 assignment의 `cardId`로 `AssignmentCard` row를 정확히 조회해 `workOrderId/styleId/buyerOrgId`를 보강하도록 수정했다(문자열 파싱 아님, `AssignmentCard` 실제 FK 컬럼만 사용). 여전히 FK를 못 찾으면 409와 서버 warning log로 cardId/assignmentId를 노출한다. 검증: `npm --prefix backend run build`, `npm run test:regression` 통과.
- **72f608e 패턴(삭제된 AssignmentPlan.orderNo/customer/label/previewUrl을 여전히 select) 재검색**: `backend/src/index.ts` 외 전체(`work-records/`, `factories/`, `lines/`, `payroll/`, `quantity-settlement/`)를 grep. 다른 select/include 블록에서는 발견되지 않음 — 72f608e에서 고친 `WORK_RECORD_WITH_REFS_INCLUDE`와 `loadWorkRecordResponseDisplayContext`가 유일한 발생 지점이었고 둘 다 이미 join 기반으로 정상 수정돼 있었다. `WorkOrder.buyerOrgName` 계열은 이미 이전 작업에서 컬럼 자체가 DROP됐고 startup hasField 게이트로 이중 방어돼 있어 문제 없음. `WorkRecord.styleName/processCode/processName`은 애초에 컬럼으로 존재한 적이 없어(항상 relation) 해당 없음.
- **audit FK relation 추가**: `schema.prisma`의 24개 테이블 + `SystemSetting`에 있는 `createdByEmployeeId`/`updatedByEmployeeId` scalar-only FK에 실제 Prisma `@relation`을 추가(자기참조인 `Employee` 포함, `EmployeeCreatedByEmployee`/`EmployeeUpdatedByEmployee` named relation). `Employee` 모델에 51개의 대응 back-relation 배열 필드가 추가됨(기계적이지만 불가피 — Prisma는 관계 양쪽을 다 요구함). `npx prisma format`/`validate`로 스키마 유효성 확인, `npm run prisma:prepare-client` + `npm --prefix backend run build` 통과. DB 물리 컬럼/FK 제약은 이미 `migration_fix.sql`에 있어 별도 SQL 변경 불필요 — Prisma ORM 레이어만 실제 FK를 인식하도록 보강한 것.
- **startup drift gate 자동화**: `STARTUP_REQUIRED_RUNTIME_COLUMNS`에서 audit FK 관련 8개 하드코딩 항목(Employee/WorkLog/WorkOrder만 커버하던 것)을 제거하고, `Prisma.dmmf.datamodel.models`에서 `createdByEmployeeId`/`updatedByEmployeeId` 필드를 가진 모델을 전부 자동 수집하는 `STARTUP_REQUIRED_RUNTIME_AUDIT_FK_COLUMNS`를 추가해 `findMissingRuntimeSchemaColumns`에서 병합 검사하도록 변경. 결과 51개 컬럼(24개 테이블×2 + SystemSetting×1)이 자동으로 커버됨 — schema.prisma에 새 모델이 audit 필드를 추가해도 하드코딩 리스트를 잊어버려 드리프트를 놓치는 일이 이제 구조적으로 불가능. node 스크립트로 개수/목록 직접 검증 완료(51개, `migration_fix.sql`의 audited_tables와 정확히 일치).
- **AssignmentCard.payload FK 중복 제거**: `stripLegacyAssignmentCardPayload`가 `styleId`/`workOrderId`/`buyerOrgId`도 페이로드에서 제거하도록 확장. `normalizeAssignmentCardsForStore`는 이제 `{payload, styleId, workOrderId, buyerOrgId}` 형태를 반환하고, `syncAssignmentCardsForOrg`는 그 FK 값을 row 컬럼에만 쓰고 JSON에는 안 남긴다. `toAssignmentCardFromStoreRow`는 이제 `row.styleId/workOrderId/buyerOrgId`(join select에 이미 있던 실제 FK 컬럼)만 응답에 넣고, 미백필 row라도 원본 payload에서 FK를 꺼내 쓰지 않는다. 이 과정에서 **부수적으로 실제 버그를 하나 발견해 같이 고침**: `resolveAssignmentPlanStyleMetaById`가 `AssignmentCard.payload.styleId`를 직접 읽고 있었는데, 이 값이 사라지면 그 함수의 폴백 경로가 조용히 깨질 뻔했다 — 이제 `AssignmentPlan.styleId/style` relation만 사용하고, 누락 시 payload/cardId로 추정하지 않는다.
- **AssignmentPlan 문자열/JSON 매칭 제거**: `syncAssignmentPlansForOrderLock`은 `workOrderId`/`assignmentCardId -> AssignmentCard.workOrderId` FK 경로로 대상 plan을 찾되, 직접 `AssignmentPlan.workOrderId` 또는 `styleId`가 비어 있으면 409로 중단한다. `DELETE /orders/:orderId`도 `workOrderId` FK 또는 `assignmentCard` FK 체인으로만 plan을 찾고, 직접 `workOrderId`가 누락된 plan은 삭제를 막는다. `resolveAssignmentPlanStyleQueryValues`(작업기록 엑셀 임포트 매칭 후보)는 `plan.styleId`만 반환하도록 바꿔 `cardId`/`originOrderId` 파싱, snapshot JSON, 스타일명 매칭을 제거했다. `PUT /assignment-board-state` 저장도 `AssignmentCard`를 못 찾거나 카드의 `styleId/workOrderId` FK가 비어 있거나 plan/card의 `workOrderId`가 다르면 409로 실패시킨다.
- **AGENTS.md 갱신**: "DB 설계 원칙" 섹션의 `AssignmentBoardState.cards/assignments — 아직 미착수" 항목과 §37 항목 6(`shouldSyncPlans` 트랜잭션 밖 실행)이 실제 코드와 안 맞음을 확인 — 현재 `PUT /assignment-board-state`는 카드/플랜/보드state 갱신을 전부 하나의 `prisma.$transaction` 안에서 처리하고 `shouldSyncPlans`라는 이름의 블록 자체가 코드에 없음. 둘 다 "완료/해소됨"으로 정정.
- **quantityChangeBoard.mjs 죽은 코드 삭제 결정**: 여러 세션에 걸쳐 "삭제 여부 미결정"으로 남아있던 `frontend/src/utils/quantityChangeBoard.mjs`와 `scripts/quantity-change-regression.test.mjs`를 삭제. 프로덕션 호출부가 없음을 재확인(§39 이후 계속 죽은 코드였음), 실패 중이던 서브테스트(`'PT' !== 'ST'`)도 ST bucket 없이 `pt` 값만으로 status가 `'ST'`가 되길 기대하는, 이 문서의 ST/PT/CT 분리 원칙과 어긋나는 테스트였다. 루트 `package.json`에서 `test:quantity-change` 스크립트와 `test:regression`의 참조 제거, AGENTS.md의 회귀 테스트 섹션도 갱신.
- **검증 결과**: `npm --prefix backend run build` 통과, `npm --prefix frontend run build` 통과, `DIRECT_URL` 더미로 `npx prisma validate` 통과("The schema... is valid"), `npm run test:regression`(`test:access-policy` 10/10, `test:time-date` 6/6) 전부 초록 — 이번 세션에서 `test:quantity-change`를 제거했으므로 더 이상 그 실패가 회귀 스위트에 남아있지 않음.
- **남은 일**:
  - `AssignmentPlan.styleId` 100% NULL이었던 예전 이슈(2026-07-02 기록)는 §44 Phase A 백필로 이미 해소된 것으로 보이나, 운영 DB에 `AssignmentPlan` 실데이터가 다시 쌓인 뒤 직접 카운트로 재확인 필요(§39 사고 이후 아직 0건 상태였을 수 있음 — 이번 세션은 코드만 확인, DB 접속은 안 함).
  - §37에서 미수정으로 남아있던 항목 중 2/4/5/7~11번(동시성 재확인 없는 완료 처리, 프론트 payroll-lock anchor 미반영, updatedAt 타임스탬프 정체, NaN dayIndex 전파 등)은 이번 세션 범위 밖 — 여전히 미수정.
  - `resolveAssignmentDisplayFallback`/`findOrderItemByAssignmentIdentity`(§42에 기록된 문자열 기반 표시 복구 헬퍼)는 이번 커밋 범위 밖. 다음에 이 영역을 만지면 payload/string 추정 없이 FK 기준으로 재설계할 것.
  - 51개 audit FK back-relation을 실제로 조회하는 코드는 아직 없음(순수 audit trail 목적) — 필요해지면 named relation을 그대로 재사용하면 됨.

## 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 재설계 — Phase A
- 사용자가 Railway DB에서 `AssignmentCard.payload` JSON을 직접 보고 FK+join 미사용 문제를 지적(styleCode/styleName/customer/previewUrl 등이 텍스트 중복 저장, `AssignmentPlan.styleId`는 컬럼만 있고 어디서도 안 채움). 조사 에이전트 3개 + 설계 에이전트 1개로 4단계 계획(Phase A~D)을 확정하고 이번 세션에 Phase A만 구현.
- `AssignmentCard`에 `styleId`/`workOrderId`/`buyerOrgId`(→Organization, 사용자 지시대로 `customerId`가 아니라 `WorkOrder`와 동일하게 `buyerOrgId`로 명명) 실제 FK 컬럼 추가. `AssignmentPlan`에는 `buyerOrgId`만 추가(`styleId`는 이미 있었는데 안 채워지고 있었음).
- `migration_fix.sql` Step 0l 추가: 컬럼 + payload/workOrder join 기반 백필 + 인덱스 + FK. `AssignmentPlan` 쪽은 `assignmentCardId`를 통해서만 백필(독립 재추정 금지).
- 시작 시 필수 컬럼 체크에 4개 컬럼 전부 추가(어제 아침 assignmentCardId 누락 사고 재발 방지 원칙 적용). `resolveAssignmentPlanStyleMetaById`의 `payload?.styleUid` 오타(`styleId`가 맞음, 지금까지 항상 매칭 실패)도 같이 수정.
- `npm run build` 통과.

### Remaining (Phase A 시점)
- ~~Phase B/C/D 미구현~~ → 같은 세션에서 이어서 완료함 (아래 새 항목 참고).

## 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 재설계 — Phase B/C/D
- Phase B: `buildAssignmentCardsFromOrders`/`syncAssignmentCardsForOrg`/`syncAssignmentPlanWorkOrderRefs`/`toAssignmentPlanWriteData`가 새 FK(`styleId`/`workOrderId`/`buyerOrgId`)를 실제로 채우도록 연결.
- Phase C: `toAssignmentCardFromStoreRow`/`loadAssignmentCardsForOrg`/`toAssignmentPlanResponse`/`GET /assignment-plans`/`buildAssignmentPlanProgressRows`/`buildAssignmentPlanCloseResponse`/`toWorkLogContextAssignmentResponse`를 join-우선 조회로 전환(응답 JSON 필드명 변경 없음, 프론트 무수정). 깨진 read-time 자가치유 로직(`repairAssignmentPlanDisplayRows` 등) 삭제 — write-time 로직은 별개라 유지.
- Phase D: `AssignmentPlan.colorId/colorName/color/stripeColor/imageUrl/thumbnailUrl` 6개 죽은 컬럼 삭제. `migration_fix.sql` Step 0m 추가(Step 0l보다 위). `syncAssignmentPlanColorRefs`/`resolveAssignmentPlanColorName` 함수 삭제. `assertGeneratedPrismaClientShape`에 6개 "있으면 문제" 체크 추가.
- `npm run prisma:prepare-client` + `npm --prefix backend run build` 통과. 루트 `npm run test:regression` 중 `test:access-policy`/`test:time-date` 통과, `test:quantity-change`의 1개 서브테스트(`'PT' !== 'ST'`)는 실패하지만 `frontend/src/utils/quantityChangeBoard.mjs`의 기존 이슈로 확인(이번 변경과 무관, 이번 세션에서 그 파일은 건드리지 않음).
- 상세는 AGENTS.md §45 참고.

- **운영 DB에 Step 0m 적용 완료**: 사용자 확인 후 `DATABASE_PUBLIC_URL`로 직접 접속해 6개 `ALTER TABLE ... DROP COLUMN`(+FK 제약 DROP)을 실행. 실행 전 `information_schema.columns`/`COUNT(*) WHERE col IS NOT NULL`로 6개 컬럼 모두 존재하되 전부 0건 non-null임을 먼저 확인(`AssignmentPlan` 전체 행 수도 0건 — §39 사고 이후 아직 미복구 상태와 일치). 실행 후 재조회로 6개 컬럼이 실제로 사라졌음을 확인. AssignmentCard/AssignmentPlan FK+join 재설계(Phase A~D) 전체 완료.

## 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 재설계 — Phase E
- 사용자가 §Phase A~D 완료 직후 Railway DB를 다시 확인하고 `AssignmentPlan.orderNo/customer/label/previewUrl`과 `AssignmentCard.payload`의 `styleCode/styleName/previewUrl/customerNameKo/Vi` 등이 여전히 남아있다고 정당하게 지적("결론적으로 시킨거 하나도 반영이 안되어 있어"). 확인 결과 Phase D는 색상 계열 죽은 컬럼만 지웠고, 이 텍스트 중복 필드들은 스킵되어 있었음(착시 아님 — Railway 호스트로 직접 재확인).
- `AssignmentPlan.orderNo/customer/label/previewUrl` 4개 컬럼 완전 삭제. `migration_fix.sql` Step 0n 추가(Step 0m보다 위, 아직 운영 미적용). 쓰기 경로(`toAssignmentPlanWriteData` 등) 전부 제거, 읽기 경로는 join-only로 전환(`?? plan.orderNo` 폴백 제거).
- 이 과정에서 Phase C가 "구현 완료"라고 문서화했던 것과 실제 동작이 달랐던 버그를 발견: `completeAssignmentPlanProduction`/`final-quantity` 완료 트랜잭션의 `findUnique`가 `select`/`include` 없이 스칼라만 가져오고 있어서 join 로직이 한 번도 실행된 적이 없었음 — `ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE`를 추가해 실제로 join이 동작하도록 수정.
- work-logs 엑셀 임포트에서 `orderNo`가 단순 표시값이 아니라 실제 쿼리 매칭 키(WHERE 필터 + 인메모리 매칭)로 쓰이고 있던 것도 발견해 `workOrder.orderNumber` relation 필터/join 값으로 전환. AT 학습 파이프라인, 급여 잠금 검증, 작업기록 표시 컨텍스트(`loadWorkRecordResponseDisplayContext`)의 관련 select도 같이 정리.
- `AssignmentCard.payload`(JSON)에서도 `styleCode/styleName/previewUrl/orderNo/dueDate/customer/customerNameKo/customerNameVi` 저장을 중단(`stripLegacyAssignmentCardPayload` 확장) — 이미 Phase C에서 join-우선으로 읽던 `toAssignmentCardFromStoreRow`가 그대로 응답을 만들어주므로 응답 필드는 무수정. `styleId/workOrderId/buyerOrgId`(실제 FK라 중복 아님)와 `cardQuantity/cardAtTotalSeconds/cardPtTotalSeconds/cardStTotalSeconds/processCount/status`(Style.processes 기반 **집계값**이라 순수 중복이 아님)는 이번 범위에서 명시적으로 제외.
- `cardId`(카드 upsert 유일 키, 122+곳에서 매칭에 쓰임)와 `createdBy`(스키마 전체 26개 테이블 공통 감사 필드 패턴)는 이번 범위 밖으로 확인 후 제외 — 사용자에게 설명하고 동의됨.
- `npm run prisma:prepare-client` + `npm --prefix backend run build` 통과. 루트 `npm run test:regression` 재실행 — `test:quantity-change`의 동일한 1개 서브테스트(`'PT' !== 'ST'`)만 여전히 실패(아래 항목 참고, 무관).
- 상세는 AGENTS.md §46 참고.

- **운영 DB에 Step 0n 적용 완료**: 사용자 확인 후 `DATABASE_PUBLIC_URL`로 직접 접속해 적용 전 4개 컬럼 존재 + 전부 non-null 0건(및 `AssignmentPlan` 전체 0행)을 먼저 확인한 뒤 4개 `ALTER TABLE ... DROP COLUMN`을 실행. 재조회로 4개 컬럼이 실제로 사라졌음을 확인, `AssignmentPlan` 최종 컬럼 목록이 schema.prisma와 정확히 일치함을 확인. AssignmentCard/AssignmentPlan FK+join 재설계(Phase A~E) 전체 완료.

### Remaining
- **quantityChangeBoard.mjs의 `'PT' !== 'ST'` 회귀 테스트 실패**: 이번 작업과 무관해 보이지만 미해결 상태로 남아 있음. 다음에 이 파일을 건드릴 때 우선 조사.
- **AssignmentCard의 집계값(cardAtTotalSeconds 등) 저장 vs recompute-on-read 정책 미결정**: Style.processes가 카드 생성 이후 바뀌면 저장된 값은 그대로 굳어있다 — 이걸 의도된 스냅샷으로 유지할지, 조회 시마다 재계산할지 결정 필요.
- **`cardId` → `assignmentCardId` 전환은 별도 대규모 작업**: 하고 싶다면 122+곳의 매칭 로직을 전부 정수 FK 기준으로 갈아타야 함.

## 2026-07-06 운영 저장 장애(503, missing column: assignmentCardId) 긴급 복구
- 사용자가 배정 보드 저장 실패(503, "server database schema is out of sync ... assignmentCardId")를 보고. 운영 DB를 직접 조회해 `AssignmentPlan` 테이블에 `assignmentCardId` 컬럼이 실제로 없음을 확인 — §43(2026-07-05) FK 마이그레이션(`migration_fix.sql` Step 0k)이 스키마/코드에는 반영됐지만 운영 DB에는 한 번도 적용되지 않은 상태였다.
- 원인: 사용자가 `railway.json`의 `preDeployCommand`(배포마다 `migration_fix.sql`을 자동 적용하는 장치)를 **의도적으로 꺼둔 상태**("안되더라고") — 즉 배포 자동화 파이프라인이 아예 이 마이그레이션을 실행한 적이 없었다. 서버 시작 시 필수 컬럼 누락을 감지하는 자체 안전장치(`backend/src/index.ts` 상단 `hasField` 체크 목록)에도 `assignmentCardId`가 빠져 있어서, 컬럼이 없는데도 서버가 정상 기동돼 문제가 안 걸러졌다.
- 조치: 사용자 명시적 확인 하에 `migration_fix.sql` Step 0k와 동일한 SQL(컬럼 추가 + 백필 + 인덱스 + FK 제약, 전부 멱등)을 운영 DB에 직접 실행 — 컬럼/인덱스/제약 전부 정상 추가 확인. 백필은 0건 영향(현재 `AssignmentPlan` 자체가 0건 — 지난 사고 이후 아직 아무도 라인에 재배정 안 한 상태라 정상).
- 재발 방지로 `hasField("AssignmentPlan", "assignmentCardId")` 체크를 시작 시 필수 컬럼 목록에 추가. `npm run build` 통과.
- **중요, 미해결**: pre-deploy가 왜 "안 됐는지"는 확인 못 함(사용자가 상세 설명 없이 꺼둔 상태) — 지금 상태로는 앞으로 `migration_fix.sql`에 새 단계가 추가돼도 배포 자동화로는 절대 적용 안 되고, 매번 이렇게 운영 DB에 수동으로 SQL을 직접 실행해야 한다. 다음에 반드시: (a) pre-deploy가 왜 실패했는지 Railway Build/Deploy 로그로 원인 확인, (b) 다시 켤지 아니면 이 수동 적용 방식을 공식 절차로 삼을지 결정.


## 2026-07-06 미배정 카드 UI: 고객사를 주문 그룹 헤더로 옮기고 카드 본문은 사진/스타일/수량만 남김
- 미배정 작업 사이드바에서 카드마다 "고객사"가 반복 표시되던 게 거슬린다는 사용자 피드백. 이미 주문 단위로 그룹핑되어 있었으므로(`groupedFilteredCards`), 그룹 헤더를 `주문 {orderNo}`에서 `{고객사} {orderNo}`(예: "더산 L15-2")로 바꾸고, 개별 카드(`UnassignedCardItem`)에서는 고객사 필드를 뺐다.
- `CompactBoardCard`에 `showCustomer` prop 추가(공용 컴포넌트라 다른 사용처의 기본 동작은 안 건드리려고 `showOrderNo`와 같은 패턴으로 추가, 기본값 true). `frontend/src/constants/uiMessages.js`에 `assign.customerWithOrderNumber` 키 추가(ko/en/vi).
- `npm --prefix frontend run build` 통과. 실제 브라우저 확인은 안 함.

## 2026-07-06 주말 작업 검토 + buyer/seller 이중 org 배정 동기화 누락 수정
- 사용자 요청으로 지난 세션(§39~43) 이후 쌓인 AGENTS.md/todo.md 내용을 실제 코드와 대조 검토. `findOrderStyleRemovalBlockers` 삭제, `syncAssignmentPlansForOrderLock` 신규 도입, `rebuildAssignmentCardsForOrg`의 `modificationLockedAt: { not: null }` 필터 등 문서에 적힌 주요 주장은 전부 코드에서 직접 확인해 사실과 일치했다.
- 검토 중 문서에 언급 안 된 버그 발견: `POST /orders/:orderId/modification-lock`의 `locked:true` 처리에서 `syncAssignmentPlansForOrderLock`이 `orgId: organization.id`(요청자 조직) 하나로만 호출되고 있었는데, 바로 다음 줄의 `rebuildAssignmentCardsForOrgIds`는 buyer+seller 양쪽으로 호출된다 — 비대칭이었다.
- 사용자 확인: 배정(AssignmentPlan)은 제조사(seller) 전용 개념이고, 주문은 발주사/제조사 아무나 등록·잠금할 수 있는 공유 개념. 즉 발주사 쪽 사용자가 잠그면 `orgId=buyer.id`로 조회해 제조사 쪽 실제 `AssignmentPlan`은 전혀 안 건드리고 조용히 스킵되는 실제 버그였음을 확정.
- 수정: `affectedOrgIds`(buyer+seller) 각각에 대해 `syncAssignmentPlansForOrderLock`을 돌리도록 변경, `zeroedStyles`는 styleId 기준으로 합침. 배정이 없는 쪽 org는 함수 초입의 `plans.length === 0` early return으로 안전하게 no-op. `npm run build` 통과. 상세는 AGENTS.md §40 "2026-07-06 정정" 참고.
- 문서 자체의 다른 문제는 못 찾음 — §39가 자기 내용 일부(카드 생성 시점)가 §40으로 대체됐다고 스스로 정정해두는 등 앞뒤가 잘 맞았다. `AssignmentPlan.styleId` 100% NULL(2026-07-02 조사, 아직 미해결)과 `quantityChangeBoard.mjs`/그 테스트가 죽은 코드로 남아있는 것(2026-07-03 기록)은 둘 다 여전히 미해결 상태로 정확히 그대로 기록돼 있었다 — 새로 발견한 문제 아님, 재확인만.

### Remaining
- 실제 브라우저 확인은 여전히 안 됨(개발 서버 미기동) — 다음에 발주사 계정으로 주문 잠금 → 제조사 쪽 배정 수량이 실제로 갱신되는지 반드시 확인.
- `AssignmentPlan.styleId` NULL 이슈, `quantityChangeBoard.mjs` 죽은 코드 정리 여부는 여전히 미결정 — 다음 세션에서 우선순위 판단 필요.

## 2026-07-05 AssignmentPlan.assignmentCardId 실제 FK 추가 (1단계)
- `AssignmentCard`/`AssignmentPlan`의 `cardId` 문자열 관례 연결을 실제 FK로 대체하는 작업 착수. 스키마에 `assignmentCardId Int?` 추가, `migration_fix.sql` Step 0k에 백필+제약조건 작성(기존 Step 0i workOrderId FK와 동일 패턴), `toAssignmentPlanWriteData`가 이제 새 FK를 채움(`PUT /assignment-board-state`의 create/update 양쪽).
- 운영 DB에 마이그레이션 직접 실행은 자동 분류기가 차단(정당한 차단) — 다음 배포 때 predeploy가 자동 적용.
- `npm run build` 통과. 상세는 AGENTS.md §43.

### Remaining
- 배포 후 `assignmentCardId` 백필이 정상적으로 채워졌는지 확인 필요.
- 읽기 경로(§42에서 찾은 `loadAssignmentDisplayReferenceMaps`/`findOrderItemByAssignmentIdentity` 등 문자열 기반 헬퍼)를 새 FK로 전환하는 건 아직 안 함 — 다음 phase.
- `cardId` 문자열 컬럼 제거는 읽기 경로 전환 검증 끝난 뒤.

## 2026-07-05 AssignmentCard가 계속 0건이던 진짜 원인 발견 (styleId 타입 불일치)
- 잠금 시점 카드 재생성(§40) 배포 후에도 카드가 안 생겨서 진단 로그로 추적 → `buildAssignmentCardsFromOrders`/`collectStyleQuantityRequirementsFromOrders`가 스타일 조회 맵을 `Style.code`(문자열) 기준으로 만들고, 조회 키는 `item.styleId`(숫자 FK)를 그대로 `resolveOptionalString()`에 넣고 있었음. 이 함수는 문자열이 아니면 무조건 fallback을 반환해서 숫자 styleId가 매번 빈 문자열로 바뀌어 모든 주문 항목이 스킵되고 있었음 — 잠금 여부와 무관하게 카드가 원천적으로 안 만들어지는 구조였음.
- 이게 §39에서 "사고 전부터 AssignmentCard가 이미 0건"이라고 관찰만 하고 원인을 못 찾았던 바로 그 버그. 스타일 조회 맵을 `Style.id`(숫자) 기준으로 고치고, 이제 불필요해진 후보 disambiguation 함수(`resolveStyleCandidateForAssignmentCard`)는 삭제. 같은 패턴이 있던 `refreshUnlinkedAssignmentPlanSnapshotsForOrg`도 같이 고침.
- 운영 DB 실데이터로 재현 검증 완료(E14-4 주문 → 스타일 3개 카드 정상 생성 확인). `npm run build` 통과. 상세는 AGENTS.md §42.
- 같은 버그 패턴이 `loadAssignmentDisplayReferenceMaps`/`findOrderItemByAssignmentIdentity`(표시용 폴백 헬퍼)에도 남아있음 — 카드 생성 경로 아니라 이번엔 안 고침, 다음에 이어서.

### Remaining
- 카드는 실제로 생성 확인됨(운영에서 "미배정 작업 8개", 고객사 "THE SAN" 정상 표시까지 사용자가 스크린샷으로 확인). 발견 당시 "고객사"가 전부 `-`로 비어있는 후속 버그도 같은 세션에서 수정 완료(`customer: order?.customerName ?? order?.customer` → `order?.customerOrg?.name ?? order?.buyerOrg?.name`, `workOrderId` select 누락도 같이 수정). 상세는 AGENTS.md §42 후속 항목.
- 원인 확인 완료 후 디버깅용 `console.error` DIAG 로그 전부 정리함(routine 로그 제거, 실제 에러 시에만 찍는 catch 로그만 유지) — Railway 로그에서 정상 동작인데 빨간 에러로 보이던 문제 해소.
- 다음 세션에서 이어서 할 것: `loadAssignmentDisplayReferenceMaps`/`findOrderItemByAssignmentIdentity`의 같은 클래스 버그(AGENTS.md §42 "남은 것" 참고), 라인에 실제로 카드를 드래그해서 AssignmentPlan이 정상 생성되는지 확인.

## 2026-07-05 "계획 부하" 과거 달 100% 하드코딩 버그 수정
- `frontend/src/pages/App/assign/utils/lineMonthCapacity.js`의 `plannedLoadPercent`가 과거 달에 한해 `capacitySeconds/capacitySeconds`(항상 100%) 항등식이었던 걸 확정 진단 후 수정. 이제 과거 달은 `actualOutputPercent`를 그대로 따름. 백엔드 요약 없는 폴백 분기도 같이 고침(이전엔 달 종류 무관하게 무조건 100%였음).
- `uiMessages.js`의 `assign.capacitySummaryHint` 캡션도 새 동작에 맞게 수정.
- `npm --prefix frontend run build` 통과. 실제 브라우저 확인 필요 — 배정 카드/작업기록이 하나도 없는 라인에서 "계획 부하"가 실제 생산률(0%)과 같이 뜨는지 확인할 것.
- 상세는 AGENTS.md §41 참고.

## 2026-07-05 잠금 시점 카드/배정 동기화 + 0수량 오버플로우 구현 (백엔드 완료, 보드 UI 남음)

### Done
- `backend/src/index.ts`: `syncAssignmentPlansForOrderLock` 신규 함수 추가. `PUT /orders/:orderId`에서 카드/배정 관련 코드(하드 블록, 정리, rebuild) 전부 제거해 순수 `WorkOrderItem` 저장으로 축소. `POST /orders/:orderId/modification-lock`은 `locked:true`로 바뀔 때만 위 함수 + `rebuildAssignmentCardsForOrgIds`를 실행하고 응답에 `zeroedStyles`를 추가. `rebuildAssignmentCardsForOrg`의 주문 조회에 `modificationLockedAt: { not: null }` 필터 추가(안 하면 다른 트리거가 잠기지 않은 주문 카드까지 되살림 — 구현 중 발견). 죽은 함수 `findOrderStyleRemovalBlockers`/`summarizeOrderStyleRemovalIssues` 삭제.
- `frontend/src/pages/App/order/OrderList.jsx`: 잠금 성공 시 `zeroedStyles` 있으면 비차단 토스트 표시(ko/en/vi 문구 추가).
- `npm --prefix backend run build`, `npm --prefix frontend run build` 둘 다 통과.
- 상세 설계/구현 내용은 `AGENTS.md` §40 참고.

- 배정 보드 "확인 필요" 경고 섹션도 마저 구현함: 백엔드 `buildAssignmentPlanProgressRows`에 `isZeroQuantityOverflow`/`isFullyPayrollSettled` 추가, `AssignBoard.jsx`/`lineMonthCapacity.js`/`LineMonthCapacityBoard.jsx`/`uiMessages.js`에 전부 배선. `npm run build` 백엔드/프론트 둘 다 통과. 상세는 AGENTS.md §40 참고.

### Remaining
- 같은 cardId를 공유하는 split 배정의 수량 재분배 정책 미정 — 현재는 그대로 두는 것으로 처리(스킵).
- 실제 브라우저 동작 확인 안 함(개발 서버 미기동, 빌드 통과만 확인) — 다음에 반드시 주문 잠금/해제/스타일 제거/확인 필요 섹션 시나리오를 실제로 클릭해서 확인할 것.

## 2026-07-05 배정 화면 이상 현상 진단 + 카드/잠금 재설계 방향 확정 (코드 미반영, 설계만 확정)

### 진단 (완료, 운영 DB 직접 조회로 검증)
- 사용자가 "배정 카드는 안 보이는데 LINE #1 계획 부하는 100%로 뜬다"고 보고. Railway 운영 DB(`DATABASE_PUBLIC_URL`)에 직접 접속해 확인.
- `AssignmentPlan`, `AssignmentCard` 둘 다 **전체 조직 통틀어 0건**(어제 사고로 삭제된 뒤 아직 아무도 재생성 안 함). `WorkOrder`(8) / `WorkOrderItem`(107) / `Style`(41) / `StyleProcess`(1084)는 살아있음. `WorkLog`/`WorkRecord`도 0건(어제 사고 경위상 사용자가 먼저 지운 것과 일치, 새로운 손실 아님).
- "주문 잠그면 카드가 생기냐"는 질문에 대한 답: **아니다.** `POST /orders/:orderId/modification-lock`은 잠금/해제 어느 쪽이든 `rebuildAssignmentCardsForOrgIds`를 호출하지 않는다(코드 확인). 카드가 재생성되는 유일한 경로는 주문 **저장**(`PUT /orders/:orderId`, `POST /orders`)이었다.
- "6월까지 계획 부하 100%, 7월부터 0%"의 원인도 확정: `frontend/src/pages/App/assign/utils/lineMonthCapacity.js:802-805`에서 과거("historical") 달은 `plannedLoadPercent = capacitySeconds / capacitySeconds`로 **항상 100%가 나오는 항등식**이었다. 실제 AssignmentPlan 데이터와 무관하게 과거 달은 무조건 100%, 미래 달만 진짜 backlog 기반 forecast 공식을 쓴다. AssignmentPlan이 0건인 것과 별개로 존재하던 버그.
- 사용자 지시로 `AssignmentPlan.deleteMany({})` 실행 — 실행 전에도 0건이었으므로 실질적으로는 no-op이었음(확인 목적으로 실행).

### 설계 결정 (AGENTS.md 40번 섹션에 상세 기록, 여기서는 요약만)
- 카드 생성/갱신 시점을 39번(저장 시점 즉시 반영)에서 **잠금 시점**으로 다시 되돌리기로 확정. 해제는 여전히 순수 플래그(카드/배정 안 건드림) — 이건 유지.
- 작업기록이 이미 연결된 배정도 잠금 시점에 `assignmentQuantity`가 최신 주문 수량으로 갱신되도록 허용(현재는 `refreshUnlinkedAssignmentPlanSnapshotsForOrg`가 linked plan을 아예 스킵함 — 이 보호를 완화해야 함). 단, `isCompleted`/급여 잠금된 플랜은 계속 보호.
- 주문에서 스타일이 통째로 빠지고 이미 작업기록이 있어도 저장/잠금을 막지 않음(기존 `findOrderStyleRemovalBlockers` 하드 블록 폐기 예정) — 대신 해당 배정을 삭제하지 않고 수량만 0으로 낮춰서 이미 만든 수량 전부가 `overflowQuantity`로 잡히게 함. 급여/AT 계산 코드는 이미 `assignmentQuantity`가 아니라 `WorkRecord` 기준이라 이 변경에 영향받지 않음(코드로 확인).
- 청구/정산(billing) 기능은 이 저장소에 아직 없음(grep 0건) — 0-수량 오버플로우 배정을 매출에 반영하는 건 사람이 나중에 고객 협의 후 주문을 재수정하는 수동 프로세스로 남기기로 함.

### Remaining (구현 전 필수 확인 사항, AGENTS.md 40번 "미해결 질문"과 동일)
- `buildAssignmentCardsFromOrders`(`backend/src/index.ts:10527`)는 `order.workOrderItems`에 없는 스타일은 순회 자체를 안 함 — "주문엔 없지만 작업기록 연결로 인해 0수량 카드는 남아야 하는" 케이스를 만들 신규 로직이 없음. 잠금 처리 파이프라인에 추가 필요.
- 0-수량 오버플로우 배정을 보드 UI에 어떻게 노출할지(상시 노출 vs 경고 섹션) 미정.
- 하드 블록 제거 시 비차단 안내 토스트를 보여줄지 미정.
- 이번 세션에서는 **코드 변경 없음** — 위 설계와 미해결 질문에 대한 답이 나온 뒤 별도 세션에서 구현.

## 2026-07-03 syncWorkRecordRefs가 attachCanonicalFieldsToWorkRecords보다 먼저 실행돼 processCode를 매번 null로 지우던 버그 수정

### 배경
바로 아래 섹션(resolveAssignmentPlanStyleMetaById 수정)을 배포한 뒤에도 엑셀 임포트가 여전히 "records[N].styleProcessId is required"로 전량 실패했다. styleId 오류는 사라졌으니 그 수정 자체는 맞았는데, styleProcessId만 계속 안 채워짐 — 로컬 시뮬레이션(Node 스크립트로 실제 Railway DB에 직접 질의)으로는 100% 통과했는데 실제 운영에서는 100% 실패하는 모순이 있어서, 임시 진단 로그를 2단계로 추가해 운영 Deploy Logs에서 직접 원인을 확인했다.

### 원인 [검증완료, Railway Deploy Logs로 직접 확인]
- `POST /work-logs/import`, `POST /work-logs`, `PUT /work-logs` 3개 엔드포인트 전부 동일한 순서 버그가 있었다:
  ```
  (기존, 잘못된 순서)
  1. syncWorkRecordRefs(...)              # styleProcessId가 이미 있어야 processCode/processName을 재확인
  2. ...여러 검증...
  3. attachCanonicalFieldsToWorkRecords(...)  # styleId/styleProcessId를 실제로 채우는 단계
  ```
- `syncWorkRecordRefs`(`backend/src/index.ts:5985`)는 `record.styleProcessId`가 **이미 숫자로 채워져 있어야만** 그 값으로 `StyleProcess`를 조회해서 `processCode`/`processName`을 "검증된 값으로 재기록"한다. 입력으로 들어온 `processCode` 텍스트를 그대로 믿고 쓰는 fallback이 의도적으로 없다(AGENTS.md 정확 계산 원칙에 맞는 설계 — FK 없이 텍스트를 신뢰하지 않음).
- 문제는 엑셀 임포트가 생성하는 신규 레코드는 이 시점에 `styleProcessId`가 아직 `null`이라는 것 — 그걸 채우는 게 바로 `attachCanonicalFieldsToWorkRecords`인데, **그 함수가 `syncWorkRecordRefs`보다 나중에 실행됐다.** 그래서 `syncWorkRecordRefs`는 매번 "styleProcessId 없음 → 검증된 processCode 없음"으로 판단해 `processCode`를 `null`로 덮어썼고, 그 뒤에 실행되는 `attachCanonicalFieldsToWorkRecords`는 이미 `null`이 된 `processCode`로는 `StyleProcess`를 조회할 수 없어 `styleProcessId`를 못 채웠다.
- Deploy Logs로 직접 확인: 레코드가 그룹에 쌓이는 시점(수정 전)에는 `matchedProcess.processCode`가 "C07", "TS05" 등으로 전부 정상이었는데, `attachCanonicalFieldsToWorkRecords` 직후에는 `processCode:null`로 찍혔다 — 정확히 두 함수 사이에서 사라진 것을 로그로 특정.

### Done
- 3개 엔드포인트(`/work-logs/import`, `POST /work-logs`, `PUT /work-logs`) 전부에서 `attachCanonicalFieldsToWorkRecords`를 `syncWorkRecordRefs`보다 먼저 실행하도록 순서를 바꿈. 중간에 있던 다른 검증(중복 체크, CT 스냅샷 검증, 급여 잠금 체크, cross-line 경고)은 순서 그대로 유지 — 두 함수의 위치만 맞바꿈.
- 결과적으로 `syncWorkRecordRefs`는 이제 항상 이미 채워진 `styleProcessId`를 검증/재확인하는 원래 의도대로 동작한다(엑셀 임포트뿐 아니라 수동 작업기록 생성/수정에서도 동일하게 적용).
- 진단용으로 추가했던 로그 중 매 행마다 찍히는 `[work-logs/import] row=...` 로그는 제거함(너무 시끄러움). `attachCanonicalFieldsToWorkRecords`가 그래도 styleProcessId를 못 채운 레코드가 있을 때만 찍는 `[attachCanonicalFieldsToWorkRecords] ... still missing` 경고는 낮은 노이즈로 계속 유용해서 남겨둠.

### Verify
- `npm --prefix backend run build` 통과 (3곳 모두).
- **배포 후 사용자가 4월.xlsx(348행) 실제 재업로드해서 성공 확인함 (2026-07-03).**

### Remaining
- 5월.xlsx는 이전에 찾은 9행(L16-1↔L16-2 스타일 7건 + 누락 주문번호 1건)이 아직 안 고쳐진 상태 — 고친 뒤 같은 방식으로 재검증 필요.

---

## 2026-07-02 resolveAssignmentPlanStyleMetaById가 죽은 컬럼만 보고 항상 빈 결과를 내던 버그 수정

### 배경
바로 위 섹션에서 "9행만 고치면 587행 전체 임포트 성공"이라고 결론냈었는데, 그건 매칭 단계(주문+스타일+공정 → AssignmentPlan)까지만 시뮬레이션한 결과였다. 실제로 사용자가 엑셀을 업로드해보니 전혀 다른 오류(`records[N].styleId is required` / `records[N].styleProcessId is required`, 348행 전부, 총 696건)가 떴다 — 앞선 시뮬레이션이 커버 못 한 더 뒷단계(`attachCanonicalFieldsToWorkRecords`)에 있던 버그. 사용자가 "FK+join으로 충분히 찾을 수 있는 데이터인데 제대로 안 한 것 같다"고 정확히 짚어서 확인함.

### 원인 [검증완료]
- `resolveAssignmentPlanStyleMetaById`(`backend/src/index.ts:6106`)가 `AssignmentPlan.styleId`/`AssignmentPlan.style` relation만 읽었는데, 이 컬럼은 어떤 저장 경로에서도 채워진 적이 없어(`toAssignmentPlanWriteData`에 애초에 styleId 필드가 없음) 운영 DB 25건 전부 NULL로 확인됨(직접 조회로 검증). 그 결과 이 함수는 **항상 빈 Map**을 반환했다.
- 이 함수는 `attachCanonicalFieldsToWorkRecords`(작업기록 생성/수정/임포트 3개 경로 공통 사용)가 `WorkRecord.styleId`를 채우는 유일한 서버측 소스였는데, 늘 실패하다 보니 `record.styleId`(호출자가 애초에 보낸 값)로만 폴백했다. 수동 입력 화면(`WorkDetail.jsx`)은 프론트에서 이미 실제 숫자 styleId를 채워서 보내기 때문에 이 버그가 가려져 있었지만, 엑셀 임포트는 서버가 스타일 코드 텍스트(`styleCode`)만 만들고 숫자 `styleId`를 채워 보내지 않아서 버그가 그대로 드러남.
- `AssignmentCard.payload`에는 이미 실제 숫자 Style FK가 `styleUid` 필드로 들어있음(운영 데이터 74/74건 100% 확인) — `AssignmentPlan.cardId`로 카드를 조인하면 바로 얻을 수 있는데 이 조인을 안 하고 있었다.
- 부수 발견: `Style.orgId`는 스타일을 소유한 **브랜드** 조직 ID이고, `AssignmentPlan.orgId`는 그 스타일로 생산하는 **제조사** 조직 ID라 서로 다르다(예: Style.orgId=2, AssignmentPlan.orgId=1). 만약 Style을 다시 조회하는 방식으로 고쳤다면 orgId 스코프를 잘못 걸어서 또 빈 결과가 나올 뻔했다 — `AssignmentCard.payload`에서 직접 읽는 방식으로 가서 이 함정을 피함.
- `styleProcessId`도 같은 이유로 항상 비어 있었다: 임포트 경로가 CT 스냅샷의 process 항목에서 `process?.styleProcessId`를 직접 읽으려 했는데, 저장된 스냅샷 process 객체에는 애초에 그 필드가 없다(§9 CT-only 스냅샷 정책 — ST/FK를 스냅샷에 영구 저장하지 않음).

### Done
- `resolveAssignmentPlanStyleMetaById`: `AssignmentPlan.cardId` → `AssignmentCard.payload.styleUid`/`styleCode`/`styleName`을 조인해서 읽도록 수정. `AssignmentPlan.styleId` 직접 컬럼이 채워져 있으면(향후) 그 값을 우선 사용하고, 없을 때만 카드 조인으로 폴백.
- `attachCanonicalFieldsToWorkRecords`: `styleId` 해결 후, 아직 `styleProcessId`가 없는 레코드에 한해 `(orgId, styleId, processCode)` 기준으로 `StyleProcess`를 배치 조회해서 채우도록 2단계 처리 추가. `StyleProcess`는 조직별 미러 테이블이라(같은 스타일이라도 제조사 org와 브랜드 org가 각자 자기 orgId로 별도 행을 가짐) `attachCanonicalFieldsToWorkRecords`에 전달된 `orgId`(=WorkRecord/AssignmentPlan을 소유한 제조사 org)로 정확히 스코프됨을 실데이터로 확인.
- 이 수정은 `attachCanonicalFieldsToWorkRecords`/`resolveAssignmentPlanStyleMetaById` 공용 함수라 엑셀 임포트뿐 아니라 일반 작업기록 생성/수정(`POST`/`PUT /work-logs`)에도 동일하게 적용됨 — 다만 그쪽은 이미 프론트가 styleId를 채워 보내서 이번 버그의 영향을 받지 않았을 가능성이 높음(별도 확인 안 함).

### Verify
- `npm --prefix backend run prisma:prepare-client && npm --prefix backend run build` 통과.
- 운영 Railway DB에 대해 직접 조회 스크립트로 검증: AssignmentPlan id=200(스타일 AM01622) → styleId=2 정상 해결, processCode=TS02 → styleProcessId=186 정상 해결. AssignmentPlan id=192(스타일 AJ1528) → styleId=21 정상 해결.
- 실제 앱에서 엑셀 재업로드 테스트는 아직 안 함 — 배포 후 4월.xlsx(9행 미수정 상태로도 나머지 339행은 정상 진행되는지, canonical ref 오류가 사라졌는지) 확인 필요.

### Remaining
- 사용자가 4월.xlsx/5월.xlsx의 9행(바로 아래 섹션 참고: L16-1↔L16-2 스타일 7건 + ORDER# 누락 1건)을 고친 뒤 재업로드 예정.
- 이번에 고친 canonical ref 버그가 매칭 단계보다 뒤에 있었으므로, 9행 수정 + 이번 백엔드 수정을 같이 배포한 뒤에도 혹시 또 다른 뒷단계(급여 잠금, CT 스냅샷 검증, 중복 검사 등) 오류가 새로 나올 수 있음 — 재업로드 결과를 다시 확인해야 함.

---

## 2026-07-02 작업기록 엑셀 파일 등록(work-logs/import) 실패 원인 진단 + 오류 상세 Dialog 추가

### 배경
사용자가 작업 기록 화면의 "파일 등록"(엑셀 업로드 → 작업기록 일괄 생성) 기능이 최근 FK+join 매칭 강화 작업 때문에 깨진 게 아닌지 의심함(4월.xlsx/5월.xlsx, 총 587행). 에러 토스트가 이유를 정확히 안 보여줘서 원인을 알 수 없다고 함.

### 진단 결과 — FK/코드 문제 아님, 원본 엑셀 데이터 9행의 실제 불일치였음
- `POST /work-logs/import`(`backend/src/index.ts:21558`)의 실제 매칭 로직(직원코드→이름대조, 라인 해석, 주문+스타일+공정→AssignmentPlan 매칭)을 그대로 복제한 시뮬레이션 스크립트를 만들어 운영 Railway DB 실데이터에 대고 587행 전부를 검증함(스크립트는 세션 종료 시 삭제, 레포에 안 남음).
- 결과: 578/587행(98.5%) 정상 매칭. FK 기반 매칭 로직 자체는 문제 없음.
- 실패한 9행 중 8행은 `ASSIGNMENT_MATCH_FAILED` — 엑셀의 ORDER#가 실제 배정 카드와 다름:
  - 스타일 AJ1527/AJ2102/AJ2016은 운영 DB에 order=L16-2 배정 카드로 등록돼 있는데 엑셀에는 order=L16-1로 적혀 있음(5월 26, 45, 46, 125, 126, 127, 128행).
  - 반대로 스타일 AM01160은 L16-1 배정 카드인데 엑셀 5월 97행은 order=L16-2로 적혀 있음.
- 나머지 1행(5월 118행)은 `MISSING_ORDER_NO` — ORDER# 셀이 비어 있음.
- `/work-logs/import`는 전체-또는-전무(all-or-nothing) 검증이라, 587행 중 이 9행만 잘못돼도 전체가 거부되고 있었음 — 사용자가 "아예 안 된다"고 느낀 이유.
- 결론: 엑셀 원본 9행을 사용자가 직접 수정하기로 함(코드 변경 아님). 부분 임포트(잘못된 행만 스킵하고 나머지는 자동 저장) 기능 추가는 이번엔 보류하고 필요시 별도 작업으로 진행하기로 함.

### Done — 오류 상세 확인 UX 개선
- `frontend/src/pages/App/work/workLogImport.js`: `extractWorkLogImportIssueRows(error, languageCode)` 신규 export. 기존 `formatWorkLogImportError`는 최대 5건까지만 압축해서 하나의 문자열로 합치던 반면, 이 함수는 전체 이슈를 `{ location, detail, code }` 배열로 반환.
- `frontend/src/pages/App/work/WorkList.jsx`:
  - 파일 등록 실패 시, 백엔드가 구조화된 `error.details.issues`를 내려주면(=데이터 검증 오류) 토스트는 "데이터 오류로 저장하지 못했습니다. 상세 내용을 확인해 주세요." 정도로 짧게만 띄우고, 동시에 전체 오류 목록을 표로 보여주는 MUI `Dialog`를 자동으로 연다(행 위치 | 오류 사유 2열, 스크롤 가능, 헤더에 총 건수 Chip 표시).
  - `issues`가 없는 일반 오류(파일에 필수 열이 없음, 가져올 행 자체가 없음 등)는 기존처럼 `formatWorkLogImportError` 기반 토스트만 그대로 유지(다이얼로그 안 뜸).
  - 기존 "작업 시작일 이전 날짜 포함" 체크(`findImportRowsBeforeOperationStart`)는 손대지 않음 — 이미 대표 행 1개+건수로 비교적 짧게 요약되는 별개의 검증이라 범위 밖으로 둠.

### Verify
- `npm --prefix frontend run build` 통과.
- 실제 브라우저에서 다이얼로그 렌더링/스크롤은 확인 안 함 — 다음에 작업기록 화면에서 일부러 잘못된 엑셀을 올려서 다이얼로그가 뜨는지, 행별 사유가 올바르게 표시되는지 육안 확인 필요.

### Remaining
- 사용자가 4월.xlsx/5월.xlsx의 9행(L16-1↔L16-2 스타일 7건 + ORDER# 누락 1건)을 직접 수정한 뒤 재업로드 예정.
- 부분 임포트(잘못된 행만 skip) 기능은 이번에 안 함 — 필요해지면 `/work-logs/import`의 단계별 `if (issues.length > 0) return respondWithIssues();` 전체-거부 구조를 "유효한 행/그룹만 계속 진행" 방식으로 리팩터링해야 하며, 급여 잠금·CT 스냅샷 검증·중복 검사 등 이후 단계와의 상호작용을 신중히 재검토해야 함(데이터 쓰기 경로라 리스크 있음).

---

## 2026-07-02 운영 DB(Railway) 전체 테이블 NULL 전수조사 — 코드 미수정, 조사만 완료

### 배경
사용자 요청으로 운영 Railway Postgres(`mainline.proxy.rlwy.net:31661/railway`, public proxy URL로 접속)에 직접 연결해 전체 테이블의 nullable 컬럼을 스캔했다. 참고: 이 저장소의 `backend/.env`에 있는 `DATABASE_URL`은 Supabase Postgres를 가리키고 있어 실제 운영 데이터가 아니다(전 테이블 0건 확인됨) — 다음에 이 DB를 조사할 때는 반드시 Railway 콘솔 > Postgres 서비스 > Variables에서 `DATABASE_PUBLIC_URL`을 받아서 써야 한다. 조사에 쓴 스크립트는 임시 파일이었고 세션 종료 시 삭제함(레포에 남지 않음).

### 확인 필요 (다음 작업 후보, 우선순위순)

**1. `AssignmentPlan.styleId` 컬럼이 100% NULL(25/25건) — 단순 미입력이 아니라 죽은 컬럼/미완성 배선**
- `toAssignmentPlanWriteData()`(`backend/src/index.ts:12470`)의 board 저장 payload에 애초에 `styleId` 필드가 없음 — 이 컬럼에 값을 쓰는 코드 경로 자체가 없다.
- 화면에는 styleId가 정상적으로 보이는데, 이건 `/assignment-plans` 응답이 이 컬럼을 안 읽고 `AssignmentCard.payload.styleId`를 조인해서 보여주기 때문(`index.ts:17371`, `matchedCard?.styleId`).
- 더 넓은 영향: `resolveAssignmentPlanStyleMetaById()`(`index.ts:6106`)가 `AssignmentPlan.style` FK relation으로 styleId를 조회하는 함수인데, 기반 컬럼이 항상 NULL이라 실제로는 항상 빈 Map만 반환한다. 이 함수는 `syncWorkRecordRefs` 포함 5곳(`index.ts:2759, 5998, 6165, 6247, 8478`)에서 쓰인다. `syncWorkRecordRefs`에는 `record?.styleId` 폴백이 있어서(`index.ts:6009`) 당장 저장이 깨지진 않지만, 원래 의도였던 "FK 기준 서버측 재검증"은 사실상 항상 no-op이고 클라이언트가 보낸 값을 그냥 신뢰하는 상태다.
- 조치 방향(미정): (a) 애초에 `AssignmentPlan.styleId`를 채우도록 저장 경로를 고치거나, (b) 이 컬럼이 정말 불필요하면 스키마에서 제거하고 `resolveAssignmentPlanStyleMetaById`도 카드 기반 조회로 바꾸는 두 방향 중 결정 필요.

**2. Factory "THAI BINH"(id=2) — `targetMonthlyWage`, `wagePerSecond` 둘 다 NULL, 급여 계산 기준 단가 자체가 없음**
- HANOI(id=1)는 8,000,000 / 10.68로 정상 세팅. `Organization` 레벨 3개 조직도 전부 NULL이라 fallback도 없음.
- AGENTS.md 급여 공식(`CT × 수량 × 초당공임`) 기준으로, THAI BINH 소속 작업기록 급여 계산이 지금 0 또는 실패로 나올 가능성이 큼.
- 조치: THAI BINH 공장 설정 화면에서 목표월급/초당공임 직접 입력하면 해결(코드 문제 아님, 데이터 입력 누락으로 보임).

**3. `WorkOrder` 7건 중 6건 `dueDate` NULL** (1건만 있음: `order-1776226898799-wlrze5`)
- 생산계획/스케줄러 화면에서 납기 기준 정렬·경고가 이 6건에서는 동작 안 할 것으로 보임. 데이터 입력 누락으로 추정.

**4. `Employee` 19명 전원 `phone`, `bankName`, `bankAccountNumber` NULL**
- 은행 이체 기반 급여 지급이나 연락처 기능을 실제로 쓴다면 지금 데이터로는 전원 불가능. 그 기능 자체를 아직 안 쓰는 거면 무시 가능 — 사용자 확인 필요.

**5. `Employee` 중 재직 중인데 `roleId`, `lineId` 둘 다 NULL인 직원 3명** (id=55 Phạm Phương Anh, id=50 Trương Yến Ly, id=1 정동원)
- 관리자/사무직이라 의도된 걸 수도 있지만, `roleId`까지 없는 건 등록 시 직무 입력 누락일 가능성도 있음.

**6. `AssignmentPlan.actualProducedCompletedAt` / `forecastCompletedAt` — 완료 여부와 무관하게 25건 전부 NULL** (완료된 3건 포함)
- `closedAt`/`completedAt`/`productionCompletedAt`은 완료 3건에 정상적으로 채워지는데 이 두 필드만 항상 비어있음. forecast/actual 완료일 관련 기능이 있다면 DB에 저장이 안 되고 있거나, 컬럼만 만들고 구현이 안 끝난 상태로 보임 — 코드에서 이 필드를 쓰는 곳이 있는지 확인 필요(이번 조사에서는 안 함).

### 의도된 것으로 확인됨 (코드/AGENTS.md 규칙과 대조 완료, 문제 아님 — 재조사 불필요)
- `OrgMembership.email` NULL 15건 — 전부 `role=WORKER`(ADMIN/OPERATOR/ACCOUNTANT는 15건 전원 email 있음 — role별 집계로 직접 확인). AGENTS.md "WORKER는 이메일 선택"과 정확히 일치.
- `AttendanceEntry.clockOut`/`workedSeconds` NULL 18건 — 아직 퇴근 안 찍은 진행 중 출근 기록.
- `LineAssignment.endAt` NULL 8건 — 현재 진행 중인 라인 배치(종료일 없는 게 정상).
- `AssignmentPlan`의 `finalQuantity`/`completedAt`/`closedQty`/`closedBy`/`closeMode`/`productionCompletedAt` 88%(22/25) NULL — 완료 3건과 정확히 일치, 미완료 카드는 당연히 비어있어야 함.
- `Style.designer`/`season`/`bomNotes`/`revenueMemo`, `Organization.phone`, `OrgRelationship.memo` 등 — 전부 선택 입력 메타 필드, 아직 그 기능을 안 쓰는 것으로 보임(급하지 않음).
- `OrganizationSubscription.trialStartedAt`/`trialEndsAt` — 3개 조직 다 `status=ACTIVE`로 바로 시작해서 트라이얼 단계를 거치지 않음, 정상. `activeEndsAt` NULL은 "만료일 없음(수동 관리)"로 보이는데 의도인지는 미확인 — 접근 제어 로직이 이 값 존재를 가정하면 문제될 수 있음(이번 조사에서는 코드 확인 안 함).

### Remaining
- 위 6개 중 어느 것부터 처리할지 결정 필요. 1번(AssignmentPlan.styleId)과 2번(THAI BINH 급여 단가)이 체감 영향 가장 큼.
- 이번 조사는 스캔 + 코드 대조까지만 했고 실제 수정은 하나도 안 함.

---

## 2026-07-02 F1~F5: 프론트엔드 name/code 기반 클라이언트 매칭(FK 미사용) 제거

### 배경
이전 세션의 "우회/땜질 코딩 패턴 전수조사"에서 서브에이전트가 리포트만 하고 [미검증] 상태로 남겨둔 프론트엔드 항목 F1~F5를 이번 세션에서 직접 코드를 읽어 재검증하고 수정했다. 공통 문제: FK(assignmentPlanId, styleId, customerOrgId 등)가 있거나 있어야 함에도 이름/코드 텍스트 비교, 수량 일치, "옵션이 1개뿐이면 자동 선택" 같은 추측성 fallback으로 대상을 매칭하던 코드. AGENTS.md "정확 계산 원칙"·"26. Meaning Exactness Lock"을 근거로, FK 매칭이 실패하면 다른 대상으로 추측하지 않고 null/미매칭으로 처리하도록 고쳤다.

### Done

**F1 — `frontend/src/pages/App/work/WorkDetail.jsx`, `resolveHydratedAssignmentMatch`**
- WorkLog 재오픈 시 `record.assignmentPlanId`로 매칭 실패하면 orderNo 텍스트 → styleName/label 텍스트 → 공정 코드/이름 → 계획수량=생산수량 일치까지 순차로 완화하며 다른 assignment를 추측 매칭하던 로직 전체 삭제.
- 이제 `assignmentPlanId`가 없거나, 있어도 넘겨받은 assignments 풀에서 `dbId` 일치 항목을 못 찾으면 `null`을 반환한다. 순수 FK 매처로 축소.
- `null` 반환 시 호출부(`buildHydratedRows`)가 원래부터 갖고 있던 `buildLegacyAssignment(record, index)` 폴백으로 자연스럽게 넘어간다 — 이 폴백은 다른 assignment를 추측하지 않고 그 레코드 자신의 저장된 필드(`record.assignmentPlanId`를 dbId로 그대로 보존, `record.styleCode/styleName/processCode` 등)만으로 표시용 객체를 만들기 때문에 완료되어 풀에서 제외된 assignment(§31)에 연결된 기존 기록을 재오픈해도 FK 값 자체는 왜곡되지 않는다.
- 더 이상 쓰이지 않게 된 `collectAssignmentStyleKeys`, `buildRecordProcessHint` 헬퍼 삭제. `equalsText`/`hasMatchingProcessCode`/`hasMatchingProcessName`/`formatAssignmentLabel`/`resolveBaselineQuantity`는 다른 곳에서 계속 쓰여 유지.

**F2 — `frontend/src/pages/App/production/ProductionPlanBoard.jsx`, `findMatchingAssignmentsForDelta`**
- 델타(수량 증감) 카드를 기존 assignment에 흡수/차감할 후보를 찾을 때 `card?.styleId === deltaCard.styleId || a.label === deltaCard.label`로 스타일 FK 일치 또는 라벨 텍스트 일치를 OR로 받아주던 것을, `card?.styleId === deltaCard.styleId` FK 일치만 남기고 라벨 텍스트 fallback 제거.
- 델타 카드는 항상 실제 주문/스타일에서 파생되어 `styleId`가 신뢰 가능한 FK로 채워져 있음을 확인(`handleDeltaAssignConfirm`에서 `styleId: deltaCard.styleId`를 그대로 실제 assignment 생성에 사용하는 것으로 재확인). 이 화면은 후보 목록을 드롭다운으로 사용자에게 보여주고 직접 선택하게 하는 구조(2995행 부근 `Select`)라 즉시 데이터 오염으로 이어지진 않지만, 후보 목록 자체가 FK와 무관한 텍스트로 부풀려지는 문제라 근본 수정.

**F3 — `frontend/src/pages/App/QcReview.jsx` (3곳)**
1. `buildQcDetailFromOrders`의 `matchesStyle` — `itemStyleCode === targetStyleId`(스타일 코드 필드를 스타일 ID 값과 비교하는 타입 불일치 비교) 라인 제거. `itemStyleId===targetStyleId`(id-id), `itemStyleCode===targetStyleCode`(code-code) 두 개의 동일 도메인 비교만 남김.
2. 같은 함수의 `variants.length === 0` 분기 — 매칭된 주문 항목이 있는데도 사이즈별 variant를 하나도 못 만들면 `plannedQuantity` 기준 "미지정" 가짜 행을 만들어 보여주던 로직을 제거하고, 다른 매칭 실패 케이스들과 동일하게 `matched:false` + 에러 메시지를 반환하도록 변경. (현재 로직상 `matchedItems.length>0`이면 항상 최소 1개 variant가 생기므로 사실상 도달 불가능한 방어 코드였지만, 남겨두면 향후 코드 변경 시 조용히 되살아날 수 있어 원칙대로 고침.)
3. `loadRows` 안 `qcPassedTotal` 계산 — 실제 QC 합격 이력(`progress.qcPassedTotal`/`plan.qcPassedTotal`)이 없을 때 완료 상태(`isCompleted`)면 `finalQuantity`(생산완료 확정 수량, 별개 개념)로 대체하던 것을 제거하고 `?? 0`만 남김. 화면에는 어차피 `latestQcDate`가 없으면 "이력 없음" 캡션이 같이 뜨므로, 실제 이력이 없는데 큰 숫자가 함께 보이던 모순을 없앰.

**F4 — `frontend/src/pages/App/order/OrderList.jsx`**
- 바이어/셀러 옵션 로드 후 `formData`를 채우는 `useEffect`(1589행 부근)에서 `option.name === prev.buyerOrgName`(및 sellerOrgName) 텍스트 매칭을 제거하고 FK id 매칭만 남김.
- "옵션이 1개뿐이면 자동 선택" 폴백은 완전히 없애지 않고, `prev.buyerOrgId`/`prev.sellerOrgId`가 비어 있을 때(신규 주문 등 아직 아무 값도 없는 경우)에만 적용되도록 조건을 좁힘. 기존 주문 편집처럼 이미 FK가 채워져 있는데 옵션 목록에서 그 FK를 못 찾는 경우, 예전엔 이름 매칭이나 "옵션 1개뿐" 로직으로 조용히 다른 조직으로 덮어썼는데 이제는 건드리지 않고 그대로 둔다.

**F5 — `frontend/src/pages/App/style/styleDetail/StyleInfo.jsx`**
- 스타일 편집 화면의 고객사 Autocomplete가 현재 선택값을 찾을 때 `name`/`nameKo`/`nameVi` 로컬라이즈 텍스트 비교를 `customerOrgId` FK 비교보다 먼저 시도하던 순서를 뒤집음. `resolvedCustomerOrgId`(FK)가 있으면 그 매칭을 최우선으로 쓰고, FK가 없는 레거시 자유 텍스트 스타일에 한해서만 이름 매칭으로 폴백.

### Verify
- `npm --prefix frontend run build` 통과 확인.
- 백엔드 변경 없음 (프론트엔드 전용 수정) — `backend` 빌드는 별도로 돌리지 않음.
- UI 수동 확인은 하지 않음 (개발 서버 미기동 상태에서 코드 리뷰 기반 수정). 배포 전 아래 화면에서 육안 확인 권장:
  - WorkDetail: 완료된 assignment에 연결된 과거 WorkLog를 재오픈해서 CT/공정 표시가 깨지지 않는지.
  - QcReview: "검수 누적"이 실제 검수 이력 없는 완료 배치에서 0으로 뜨는지, "이력 없음" 캡션과 일치하는지.
  - OrderList: 기존 주문 편집 시 바이어/셀러가 저장된 값 그대로 유지되는지, 신규 주문에서 옵션이 1개뿐일 때는 여전히 자동 선택되는지.
  - StyleInfo: customerOrgId가 설정된 스타일에서 고객사 선택란이 올바른 조직으로 뜨는지.

### Remaining
- 위 5개 파일 모두 실제 브라우저 조작 검증은 아직 안 함 — 다음 작업자(코덱스 검토 포함)가 위 Verify 체크리스트를 실제 화면에서 확인할 것.
- F2(ProductionPlanBoard)는 메뉴가 비활성화(`/production-plan`, AGENTS.md "기능 상태" 표 참고) 상태라 실사용 경로는 아니지만 코드 자체는 남아 있어 함께 수정함.
- 이번 수정은 "FK 매칭 실패 시 추측하지 않고 null/미매칭 처리"까지만 했고, F1에서 언급된 "완료된 assignment에 연결된 레코드를 재오픈할 때 그 특정 assignment를 직접 FK로 재조회해서 완전한 정보(공정 목록 등)를 보여주는" 개선은 범위 밖으로 남겨둠(현재는 `buildLegacyAssignment`가 레코드 자체 필드만으로 최소 표시).

---

## 2026-07-03 주문 잠금-배정카드 동기화 재설계 (사고 대응 + 근본 수정)

### 배경: 실제 발생한 운영 데이터 삭제 사고
주문 잠금 해제(`POST /orders/:orderId/modification-lock`, `locked:false`)가 그 주문에 연결된 `AssignmentPlan`/`AssignmentCard`를 무조건 전부 삭제하도록 되어 있었다(작업기록 있으면 해제 자체를 막는 가드는 있었지만, 그 가드를 무력화한 뒤 해제하면 삭제를 막을 방법이 없었음). 사용자가 작업기록을 먼저 삭제한 뒤 주문 잠금을 전부 해제하면서 이 경로를 그대로 타, 운영 DB의 `AssignmentPlan` 25건과 `WorkRecord` 전체가 삭제됐다. Railway Postgres에 백업(PITR/volume backup)이 꺼져 있어 복구 불가 확인함(`Backups` 탭에서 직접 확인). 사용자는 복구 대신 재설계를 요청했고, 이 세션에서 설계→구현→커밋까지 전량 수행했다(사용자가 자리를 비우면서 확인 요청 없이 진행 + todo.md 기록 + 커밋/푸시까지 요청).

이 사고를 운영 DB에 직접 접속해 조사하면서 확인한 사실(참고용, AGENTS.md 파일 최상단 "DB 접속 전 필독" 절차대로 `DATABASE_PUBLIC_URL`로 접속): `AssignmentCard`는 사고 전부터 이미 0건이었다(별도의, 더 오래된 버그 — 아래 "부수적으로 같이 고친 것" 참고). `AssignmentPlan`은 사고로 25건→0건이 됐다. `WorkOrder`(8건)/`WorkOrderItem`(107건)은 살아있고 JSON 백업 필드와 정확히 일치해 정상이었다.

### 재설계 방향 (사용자 확정 사항)
- 주문 항목(스타일/수량)이 바뀌면 배정카드도 그 저장 시점에 즉시 정확히 반영되어야 한다 — 다음 잠금 때까지 미루는 설계는 사용자가 명시적으로 반려함("카드의 수량도 당연히 업데이트 되어야지").
- 이미 작업기록이 연결된 스타일의 카드는 주문에서 제거될 수 없다 — 제거하려는 저장 시도는 토스트+모달로 막고 저장 전체를 실패 처리한다(작업기록 엑셀 임포트 실패 모달과 동일 패턴 재사용).
- 잠금 해제는 카드/배정을 전혀 건드리지 않고 "다시 편집 가능" 상태로만 전환한다.
- 이중 저장 경로나 애매한 안전장치를 만들지 않고 한 가지 방식으로만 정확하게 만든다.

### 구현 내용

**백엔드 (`backend/src/index.ts`)**
- 신규 헬퍼 `findOrderStyleRemovalBlockers`(옛 `loadOrderAssignmentReleaseSummary`/`releaseOrderAssignmentsForUnlock` 자리, 둘 다 아무 데서도 호출되지 않던 죽은 코드라 삭제하고 그 자리에 작성): 주문에서 빠지는 스타일들의 `cardId`(`${orderId}::${styleId}` 정확 일치, prefix 아님)로 `AssignmentPlan`을 찾고, 이미 검증된 `loadLinkedWorkRecordPlanIds`를 재사용해 작업기록 연결 여부를 확인한다. 걸리면 작업기록 엑셀 임포트와 같은 모양(`{ ok:false, error, issues:[{styleId,styleCode,styleName,code,message}] }`)의 409를 반환한다.
- `PUT /orders/:orderId`: `WorkOrderItem` 교체 트랜잭션을 열기 **전에** 위 가드를 먼저 돌려서, 걸리면 아무것도 쓰지 않고 409로 막는다. 안전하면 같은 트랜잭션 안에서 `WorkOrderItem` 교체 + 제거 확정된 `AssignmentCard` 삭제 + `detachWorkRecordsAndDeleteAssignmentPlans`(기존 함수 재사용, 내부적으로 작업기록 연결을 트랜잭션 안에서 한 번 더 재검증하므로 가드 체크~커밋 사이의 레이스도 막힘)로 해당 `AssignmentPlan` 정리까지 원자적으로 처리한다. 새로 생기거나 수량만 바뀐 스타일은 트랜잭션 커밋 후 기존 `rebuildAssignmentCardsForOrgIds`(변경 없음, 원래도 정상 동작하던 경로)가 그대로 처리한다.
- `POST /orders/:orderId/modification-lock`: 잠금/해제 양쪽 모두 `modificationLockedAt/By` 토글 외에 아무 것도 하지 않도록 단순화. 기존에 있던 "해제 시 작업기록 있으면 차단" 가드와 "해제 시 카드/배정 전체 삭제" 로직을 통째로 제거(이게 사고 원인이었음).
- `DELETE /orders/:orderId`: 새 가드 추가. 잠금 해제가 더 이상 카드/배정을 미리 정리해주지 않으므로, 주문 삭제(=그 주문의 모든 스타일 카드가 한꺼번에 없어지는 것과 동치) 앞에도 같은 작업기록 가드가 없으면 똑같은 유형의 사고가 삭제 경로로 재발할 수 있었음. `assignmentPlan.findMany`(cardId prefix, 주문 전체 삭제라 prefix가 정확) → `loadLinkedWorkRecordPlanIds` → 걸리면 409, 안전하면 트랜잭션 안에서 주문 삭제 + `detachWorkRecordsAndDeleteAssignmentPlans`.
- 미사용 에러 상수 3개(`ORDER_MODIFICATION_LOCK_STATE_CHANGE_ERROR`, `ORDER_MODIFICATION_UNLOCK_ASSIGNMENT_RELEASE_REQUIRED_ERROR`, `ORDER_MODIFICATION_UNLOCK_PAST_ASSIGNMENT_CONFIRMATION_REQUIRED_ERROR`) 삭제.

**부수적으로 같이 고친 것**: `rebuildAssignmentCardsForOrg`가 `syncAssignmentCardsForOrg`를 호출하는 부분(기존에 `db=prisma` 기본값, 트랜잭션 없이 "org 전체 카드 delete → 하나씩 upsert" 순서로 동작)이 원자적이지 않았다. delete는 이미 커밋됐는데 upsert 루프 중간에 실패하면 카드 테이블이 텅 빈 채로 영구히 남는다 — 이번 사고와는 별개로, `AssignmentCard`가 사고 전부터 이미 0건이었던 것도 이 비원자성이 원인일 가능성이 높다고 판단해 `prisma.$transaction`으로 감쌌다. (`PUT /assignment-board-state`가 같은 함수를 호출하는 다른 자리는 원래부터 `db: tx`를 넘기고 있어 이미 안전했음 — 그쪽은 손대지 않음.)

**프론트엔드**
- `frontend/src/pages/App/order/OrderList.jsx`의 `handleSave`: 주문 저장 성공 후 `/assignment-board-view`를 다시 불러와 `reconcileBoardStateForQuantityChanges`로 카드를 재계산하고 `PUT /assignment-board-state`를 또 한 번 직접 호출하던 별도 경로를 통째로 제거했다. 이 경로는 실패해도 `catch (_boardUpdateErr) { /* 조용히 무시 */ }`로 삼켜져 "저장은 성공했는데 보드는 어긋난" 상태를 만들 수 있었다. 이제 카드/배정 동기화는 백엔드 `PUT /orders/:orderId` 트랜잭션 하나가 책임지므로 프론트가 다시 동기화할 이유가 없다.
- `handleSave`/`handleDeleteOrder`의 `catch`에 새 로직 추가: 백엔드가 `error.details.issues` 배열을 내려주면(스타일 제거 차단) 작업기록 엑셀 임포트 실패와 동일한 패턴(짧은 토스트 + 스타일/사유 표를 보여주는 MUI `Dialog`)으로 표시. 새 함수 `extractOrderSaveIssueRows`, 새 상태 `saveIssueRows`/`saveIssueDialogOpen`.
- 이제 아무 데서도 호출되지 않는 `reconcileBoardStateForQuantityChanges` 호출부와 그 준비용으로만 쓰이던 `buildOrderVariantMapForBoard`/`resolveOrderItemQuantityForBoard`/`buildAssignmentOriginCardId`/`styleProcessSummaryById`(및 그 때문에만 쓰이던 `normalizeProcesses` import) 삭제. 잠금 관련 미사용 안내문구/확인문구 4개(`lockUnlockReleaseAssignmentsConfirm`, `lockUnlockPastAssignmentsConfirm`, `lockReleaseSummaryInfo`, `lockReleaseSummaryWithDetachedInfo`)와 백엔드가 더 이상 보내지 않는 에러에 대응하던 문구 2개(`lockUnlockReleaseRequired`, `lockUnlockPastReleaseConfirmRequired`) 삭제, `resolveOrderModificationLockToggleErrorMessage` 단순화.
- `frontend/src/utils/orderApi.js`의 `toggleOrderModificationLock`: 백엔드가 이제 전혀 읽지 않는 `releaseAssignments`/`confirmPastAssignmentRelease` 파라미터 제거.

### 검토: FK/Join 리스크 (사용자가 명시적으로 요청한 검토 항목)

**정상적으로 잘 되어 있는 부분**
- `WorkOrderItem.styleId → Style.id`는 실제 FK이고, 이번에 추가한 가드(`existing.workOrderItems`에서 제거될 스타일을 찾는 부분)는 `WORK_ORDER_ITEM_WITH_COLOR_INCLUDE`가 이미 `style` relation을 `include`한 결과(`item.style.id`)를 우선 사용하도록 되어 있는 기존 `resolveWorkOrderItemStyleId`를 그대로 재사용했다 — JSON이나 이름 재매칭이 아니라 진짜 FK+JOIN 결과를 읽는다.
- `AssignmentPlan → WorkRecord`도 실제 FK(`WorkRecord.assignmentPlanId`, `onDelete: SetNull`)이고, 이번 가드/정리 로직은 전부 기존에 검증되어 실사용 중이던 `loadLinkedWorkRecordPlanIds`/`assertAssignmentPlansCanBeDetached`/`detachWorkRecordsAndDeleteAssignmentPlans`(원래 `PUT /assignment-board-state`가 쓰던 함수)를 그대로 재사용했다. 새로 재구현하지 않았기 때문에 이 부분에서 새로운 FK 버그가 들어갈 여지는 작다.
- 가드 체크(트랜잭션 밖, 읽기)와 실제 삭제(트랜잭션 안) 사이에 시간차가 있어 이론적으로 레이스가 있을 수 있는데, 삭제를 실제로 수행하는 `detachWorkRecordsAndDeleteAssignmentPlans`가 내부에서 `assertAssignmentPlansCanBeDetached`로 삭제 직전에 한 번 더 재검증한다. 그 사이에 새 작업기록이 생겼다면 트랜잭션 안에서 예외가 던져지고 `$transaction`이 통째로 롤백되므로, 최악의 경우도 "저장 실패"이지 "일부만 반영된 손상 상태"가 아니다.

**구조적으로 남아있는 진짜 문제 (FK 자체가 없음 — 이번 범위에서 고치지 않음, 후속 과제로 남김)**
- `AssignmentCard.cardId`(String)와 `AssignmentPlan.cardId`/`originOrderId`(둘 다 String?)는 DB 레벨 FK나 relation이 전혀 아니고, `${orderId}::${styleId}` 형식 문자열이 우연히 같은 값이라는 애플리케이션 레벨 관례로만 연결되어 있다(`backend/prisma/schema.prisma` 확인: `AssignmentCard`는 `organization` 외에 relation 없음, `AssignmentPlan`도 `cardId`/`originOrderId`에 `@relation` 없음). 이번 사고의 근본 원인도 결국 이 지점이다 — DB가 관계를 몰라서 삭제할 때 알아서 막아주는 게 없고, 애플리케이션 코드가 매번 직접 조회해서 지켜야 한다. 이번엔 그 "직접 지키는 코드"를 저장 경로에 제대로 박아 넣은 것이지, FK 자체를 놓은 건 아니다. 진짜 근본 해결은 `AssignmentPlan.cardId`를 `AssignmentCard`에 대한 실제 FK로 바꾸는 스키마 마이그레이션인데, 이건 이번 사고 대응 범위를 크게 넘어서고(카드 재생성/캐시 성격이 강한 `AssignmentCard` 테이블 자체의 존재 이유와 부딪힘 — 카드가 지워졌다 다시 만들어질 때마다 FK가 끊기는 문제를 별도로 설계해야 함) 신중한 별도 설계가 필요해 이번엔 손대지 않았다.
- 위와 직접 연결된 성능 관찰: `AssignmentPlan.cardId`/`originOrderId`에는 인덱스가 전혀 없다(`@@index`는 `[orgId, lineId]`, `workOrderId`, `styleId`, `colorId`뿐). 이번에 추가한 가드가 주문을 저장할 때마다 `cardId`로 `AssignmentPlan`을 조회하므로, 지금은(전체 25건 수준) 문제없지만 데이터가 커지면 이 조회가 순차 스캔이 된다. `@@index([orgId, cardId])` 추가를 후속 마이그레이션 후보로 남긴다.
- `AssignmentPlan.styleId`는 실제 FK+인덱스가 있는데도 이번 가드에서는 쓰지 않고 문자열 `cardId` 매칭을 썼다. 기존 카드 생성 로직(`buildAssignmentCardsFromOrders`)이 처음부터 `cardId`를 정체성의 기준으로 삼고 있어서 일관성을 위해 맞춘 것이지만, 만약 `AssignmentPlan.styleId`가 항상 정확히 채워진다는 게 보장된다면(2026-07-02 조사 노트에 `AssignmentPlan.styleId`가 100% NULL이라는 별도 미해결 이슈가 todo.md에 남아있음 — 이번 조사에선 관련 없어 보였지만 완전히 배제는 못 함) 그쪽이 더 견고한 FK 매칭이 될 수 있다. 이번엔 기존 관례를 유지하는 쪽을 택했다.

### 검증
- `npm --prefix backend run build`, `npm --prefix frontend run build` 둘 다 통과.
- `npm run test:regression` 실행: `test:access-policy`(10/10 통과), `test:time-date`(6/6, 단독 실행으로 확인) 정상. `test:quantity-change`는 이번 세션 시작 전부터 이미 실패 중이던 테스트 1건(`scripts/quantity-change-regression.test.mjs`, "PT" !== "ST")이 있음 — `git diff`로 확인 결과 이 세션에서 그 파일도 그 파일이 테스트하는 `frontend/src/utils/quantityChangeBoard.mjs`도 전혀 건드리지 않았으므로 이번 변경과 무관한 기존 실패다. 다만 `reconcileBoardStateForQuantityChanges`(테스트 대상 함수)를 프로덕션 호출부에서 완전히 제거했으므로, 이 유틸리티와 그 전용 테스트는 이제 죽은 코드를 테스트하는 상태다 — 지우거나 유지할지는 별도 판단 필요(지우려면 `package.json`의 `test:quantity-change`/`test:regression` 스크립트 구성과 AGENTS.md 갱신까지 같이 해야 해서 이번 범위에는 포함 안 함).
- 실제 브라우저로 "스타일 제거 후 저장 시 토스트+모달이 뜨는지", "잠금/해제가 카드에 영향 안 주는지"는 개발 서버 미기동 상태에서 코드 리뷰 기반으로만 작성했고 육안 확인은 못 함 — 다음 작업자가 실제로 눌러서 확인 필요.

### Remaining
- **운영 DB 복구 조치 필요**: 배포 후 기존 8개 주문을 각각 한 번씩 저장(또는 잠금 토글)하면 살아있는 `WorkOrderItem`을 기준으로 `AssignmentCard`가 다시 채워진다. `AssignmentPlan`(실제 라인 배정)은 자동 복구 안 됨 — 배정판에서 카드를 라인에 다시 드래그해야 한다(사용자가 이미 인지하고 승인함, 복구 대상 아님).
- `AssignmentPlan.cardId`/`originOrderId`를 진짜 FK로 바꾸는 스키마 마이그레이션(위 FK/Join 검토 항목) — 설계 필요, 이번 범위 아님.
- `AssignmentPlan.cardId`에 인덱스 추가 — 위 검토 항목, 이번 범위 아님.
- `frontend/src/utils/quantityChangeBoard.mjs`와 `scripts/quantity-change-regression.test.mjs`는 이제 프로덕션 호출부가 없는 죽은 코드/테스트 — 삭제 여부 결정 필요.
- 실제 브라우저 조작 검증(스타일 제거 차단 토스트+모달, 잠금/해제 무영향, 신규 스타일 추가 시 카드 즉시 생성) 안 함 — 다음 작업자가 확인.
## 2026-07-07 OrgMembership -> Employee canonical account 통합

### Done
- `Employee`를 조직 계정의 canonical table로 확장했다: `email`, `orgRole`, `status`, `requestedAt/requestedName`, `approvedAt/approvedBy`를 추가하고 `orgMembershipId`는 nullable compatibility link로 낮췄다.
- `migration_fix.sql` Step 0o를 추가했다: 기존 `OrgMembership` 값을 `Employee`로 백필하고, `OrgMembership`만 있던 BRAND/신규 조직 ADMIN 계정도 `Employee` row로 만든다.
- 기존 `createdBy`/`updatedBy` 문자열 snapshot은 유지하면서, auditable table에 `createdByEmployeeId`/`updatedByEmployeeId` nullable 컬럼과 FK를 추가했다. 요청 중 Employee를 찾으면 `db.ts` Prisma extension이 저장 경로별 수정 없이 자동 주입한다.
- 인증/인가(`middleware/access.ts`), 로그인 프로필(`/auth/profile`), 온보딩 승인, 직원/라인/급여/작업기록 context의 주요 read path를 `Employee.email/orgRole/status` 우선으로 전환했다.
- `OrgMembership`은 아직 물리 삭제하지 않고 `/org-memberships` 호환 API와 shadow write 대상으로 유지했다. 새 write path는 같은 트랜잭션 또는 직후 sync로 `Employee`를 함께 맞춘다.

### Verify
- `npm run prisma:prepare-client` 통과.
- `npm run build` 통과.
- 운영 DB에는 `.env`를 쓰지 말고 Railway `DATABASE_PUBLIC_URL`로 `migration_fix.sql` Step 0o 적용 여부를 직접 확인해야 한다. 특히 `Employee.email/orgRole/status`, `Employee_orgId_email_key`, audit FK 컬럼 생성 여부 확인.

### Remaining
- `OrgMembership` table/drop은 아직 하지 않는다. 한 배포 이상 Employee-only read 상태로 운영한 뒤, `rg "orgMembership"`과 운영 DB 백필 검증이 0건일 때 별도 작업으로 제거한다.
- 프론트는 기존 `orgMembershipId` compatibility 응답을 계속 받도록 둔 상태다. 다음 단계에서 Employee id 중심으로 화면 payload를 정리할 수 있다.
## 2026-07-07 OrgMembership physical removal

### Done
- Removed the Prisma `OrgMembership` model and removed `Employee.orgMembershipId` from the Prisma schema.
- Reworked org-account routes so the existing `/org-memberships` API URLs are compatibility wrappers backed by `Employee.id`.
- Updated auth, payroll, organization representative, line, factory, onboarding, and maintenance scripts to read/write Employee account fields directly.
- Updated `migration_fix.sql` Step 0o to copy any remaining OrgMembership rows into Employee, drop `Employee.orgMembershipId`, and drop the `OrgMembership` table.
- Added startup drift checks so `OrgMembership` table or `Employee.orgMembershipId` column still present triggers `migration_fix.sql`.

### Verify
- `npm run prisma:prepare-client` passed in `backend`.
- `npm run build` passed in `backend`.
- `npm run build` passed in `frontend`.

### Remaining
- After Railway deploy/startup migration, verify production DB no longer has `OrgMembership` table and `Employee.orgMembershipId` column.
- Frontend/API naming still has compatibility names like `/org-memberships` and `orgMembershipId`; these now mean Employee account id and can be renamed in a later UI/API cleanup without another DB migration.

## 2026-07-07 OrgMembership production drop verification

### Done
- Applied `backend/migration_fix.sql` directly to Railway Postgres using the session-only public DB URL.
- Verified `information_schema.tables` has no `OrgMembership` table.
- Verified `information_schema.columns` has no `Employee.orgMembershipId` column.
- Verified `Employee` still has account columns: `email`, `orgRole`, `status`, `requestedName`, `approvedAt`.

### Verify
- Production Employee row count after migration: 20.
