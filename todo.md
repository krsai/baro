# TODO

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
