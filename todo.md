# TODO

## 2026-07-02 F1~F5: 프론트엔드 name/code 기반 클라이언트 매칭(FK 미사용) 제거

### 배경
이전 세션의 "우회/땜질 코딩 패턴 전수조사"에서 서브에이전트가 리포트만 하고 [미검증] 상태로 남겨둔 프론트엔드 항목 F1~F5를 이번 세션에서 직접 코드를 읽어 재검증하고 수정했다. 공통 문제: FK(assignmentPlanId, styleId, customerOrgId 등)가 있거나 있어야 함에도 이름/코드 텍스트 비교, 수량 일치, "옵션이 1개뿐이면 자동 선택" 같은 추측성 fallback으로 대상을 매칭하던 코드. AGENTS.md "정확 계산 원칙"·"26. Meaning Exactness Lock"을 근거로, FK 매칭이 실패하면 다른 대상으로 추측하지 않고 null/미매칭으로 처리하도록 고쳤다.

### Done

**F1 — `frontend/src/pages/App/work/WorkDetail.jsx`, `resolveHydratedAssignmentMatch`**
- WorkLog 재오픈 시 `record.assignmentPlanId`로 매칭 실패하면 orderNo 텍스트 → styleName/label 텍스트 → 공정 코드/이름 → 계획수량=생산수량 일치까지 순차로 완화하며 다른 assignment를 추측 매칭하던 로직 전체 삭제.
- 이제 `assignmentPlanId`가 없거나, 있어도 넘겨받은 assignments 풀에서 `dbId` 일치 항목을 못 찾으면 `null`을 반환한다. 순수 FK 매�터로 축소.
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
