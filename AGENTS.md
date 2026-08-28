# BARO 프로젝트 컨텍스트

## 2026-08-28 급여 체계 버전 변경의 연계 기능 갱신

- 급여 체계를 저장해 새 `SalarySystemVersion`을 만들거나 버전 적용 구간을 변경하면 프론트가 `SALARY_SYSTEM_SETTINGS` workspace 데이터 변경 이벤트를 발행한다.
- 급여/생산수당 계산 화면은 이 이벤트를 구독해 열려 있으면 즉시 다시 조회하고, 다른 탭에 있으면 변경 표시 후 진입 시 갱신한다. 현재 생산수당 계산값 자체에는 급여 항목을 섞지 않으며, 향후 월 급여 계산 Phase 3도 같은 이벤트를 구독한다.

## 2026-08-28 급여 체계 기준 통화

- 급여 체계는 조직별 기준 통화를 하나 저장하며 기본값은 `VND`다. 사용자는 `VND`, `USD`, `KRW` 중 선택할 수 있다. 통화는 별도 문자열 필드로 중복 관리하지 않고 고객 단가와 동일한 `Currency` 마스터의 FK를 사용한다.
- 기준 통화는 직급별 단가, 금액 상한, 계산식의 금액 파라미터 단위에 공통 적용하고 급여 체계 버전 스냅샷에도 함께 기록한다. 통화 변경은 기존 숫자를 환산하지 않으며 새 버전으로 확정된다.
- 프론트의 지원 통화 순서·기호는 `frontend/src/constants/currencies.js`, 백엔드의 통화 코드 정규화는 `backend/src/currency.ts`를 공용 소스로 사용한다. 고객 단가와 급여 체계에서 각자 통화 배열·기호를 다시 선언하지 않는다.
- 금액 입력 컴포넌트는 고객 단가 화면과 동일하게 선택 통화의 심벌(`₫`, `$`, `₩`)을 입력란 왼쪽 내부에 표시한다. 급여 체계의 직급별 단가와 상한값 입력도 이 패턴을 따른다.

## 2026-08-28 급여 체계 변경 감지 정규화

- 저장 버튼의 변경 감지는 화면 state 객체를 그대로 문자열 비교하지 않고 서버 저장 의미에 맞춘 정규화 서명을 비교한다. 쉼표 유무, 숫자/문자열 표현 차이, 미등록 단가와 명시적 `0`은 같은 값으로 취급한다.
- 사용자가 값을 바꿨다가 최초 값으로 되돌리면 저장 버튼은 다시 비활성화되어야 한다. 적용되지 않는 급여 타입의 단가는 변경 감지와 저장 payload 양쪽에서 제외한다.

## 2026-08-28 급여 항목 지급 월 설정

- `정산 주기`는 간격만 저장해서는 실제 지급 월을 결정할 수 없으므로 각 급여 항목에 `paymentMonths`를 함께 저장한다. 월간은 12개 월, 분기는 4개 월, 반기는 2개 월, 연간은 1개 월을 정확히 지정한다.
- 기본 지급 월은 월간 `1~12월`, 분기 `3·6·9·12월`, 반기 `6·12월`, 연간 `12월`이다. 근속수당처럼 모든 대상 직원에게 6월과 12월 지급하려면 `6개월`과 `6월·12월`을 함께 저장한다.
- 지급 월은 급여 체계 버전 스냅샷의 항목 데이터에 포함된다. 실제 급여 실행 단계에서는 정산 대상 월이 항목의 `paymentMonths`에 포함될 때만 해당 항목을 계산해야 한다.

## 2026-08-28 급여 항목별 적용 급여 타입 선택

- 기본급·수당 항목은 `GENERAL`(일반), `OUTPUT`(생산) 적용 여부를 급여 체계 화면의 칩으로 직접 선택한다. 최소 한 타입은 반드시 선택해야 하며, 성과급은 기존 원칙대로 `OUTPUT` 전용 고정 항목이다.
- 선택하지 않은 급여 타입의 직급별 단가 입력은 화면에서 비활성화하며, 타입을 해제하는 즉시 해당 항목·타입의 기존 단가를 화면 상태에서도 삭제한다. 저장 요청과 버전 스냅샷 및 후속 계산으로 비활성 단가가 전달되어서는 안 된다. 서버도 항목의 `payTypes`를 강제로 양쪽 타입으로 덮어쓰지 않고 검증 후 그대로 보존한다.
- 라벨은 한 색으로 통일하지 않는다. `frontend/src/theme/labelPalette.js`의 저채도 파스텔 5색(blue/green/orange/purple/red)을 공용 기준으로 쓰며, 급여 화면은 기본급·일반=blue, 수당=green, 생산·성과급=orange로 의미를 구분한다. 비활성 상태만 중립 회색을 사용한다.

## 2026-08-27 공장별 생산수당 단가 버전 관리 방향 확정

- 공장의 생산수당 초당 단가는 앞으로 단일 최신값과 `적용 시작 월`을 직접 덮어쓰는 방식이 아니라, **공장별 버전**으로 관리한다. 급여 체계의 버전 관리를 기준 UI·동작으로 삼는다.
- 공장 상세에서 생산수당 단가를 저장하면 해당 공장의 새 버전(`Ver.1`, `Ver.2`, ...)을 등록한다. 새 버전은 버전 관리에서 적용 시작 월을 배정하기 전까지 계산에 사용하지 않는다.
- 버전 관리 화면은 왼쪽에 버전 등록 날짜와 버전 번호를 표시하고, 오른쪽에는 해당 공장의 관리 시작 월부터 현재 월까지의 적용 타임라인을 표시한다. 적용 월 배정과 구간 변경은 버전 관리 화면에서만 수행한다.
- 기존 `FactoryProductionAllowanceRate` 월별 이력은 버전 전환 시 보존·이관하며 임의 삭제하거나 최신 한 건으로 접지 않는다. 모든 조회와 급여 계산은 대상 공장·대상 월에 적용되는 확정 버전을 선택해야 한다.
- 버전 적용 구간이 바뀌면 `PRODUCTION_ALLOWANCE_SETTINGS` 연결 이벤트를 발행해 열려 있는 생산수당 페이지를 다시 조회하고, 기존 스냅샷과 적용 단가가 달라진 월은 재계산 대상으로 표시한다.

## 기본 작업 완료 정책: 자동 커밋 및 푸시

- 코드·설정·문서 변경 작업은 구현과 필요한 검증이 끝나면 사용자가 매번 별도로 요청하지 않아도 현재 브랜치에 커밋하고 해당 원격 브랜치로 푸시한다.
- 커밋 전 `git status`, `git diff --check`, 관련 빌드·테스트를 확인하고, 사용자 소유의 무관한 변경은 커밋에 포함하지 않는다.
- 푸시 전 원격 최신 상태를 fetch하여 충돌이나 분기 여부를 확인한다. 안전한 fast-forward가 불가능하거나 다른 작업과 충돌하면 임의로 덮어쓰지 말고 사용자에게 알린다.
- 사용자가 명시적으로 커밋·푸시를 원하지 않거나, 요청이 조회·설명·진단만을 목적으로 하는 경우에는 자동 커밋·푸시하지 않는다.

## 2026-08-26 급여 체계 백엔드 Phase 1·2 구현

- `EmployeeCompensationPolicy`의 단가 축을 `orgRole + gradeId`에서 canonical `payType(GENERAL/OUTPUT) + gradeId`로 전환했다. 레거시 역할별 행을 접을 때 같은 급여 타입·직급의 금액이 다르면 마이그레이션은 임의 선택하지 않고 명시적으로 실패한다.
- 급여 항목은 `SalaryItem`, 항목별 단가는 `SalaryItemRate`, 확정 버전은 `SalarySystemVersion`으로 저장한다. 첫 조회 시 레거시 정책을 기본급·수당·성과급 항목으로 백필하고, `1900-01`부터 적용되는 Ver.1 스냅샷을 자동 생성해 과거 월에 버전 공백이 없게 한다.
- 계산식은 `backend/src/employees/salaryFormula.ts`의 제한형 파서/인터프리터만 사용한다. 허용된 9개 파라미터, `+ - × ÷ ( )`, `CONST:n` 외에는 거부하며 `eval`/`Function`을 사용하지 않는다. 비성과급 항목은 반드시 `GRADE_RATE`로 시작한다.
- `/salary-system` GET/PUT과 `/salary-system/versions` POST는 기존 `requireSalarySystemManager` 권한을 공유한다. 프론트 `SalarySystem.jsx`는 이 API에서 항목·단가·버전을 읽고 저장 버튼에서 현재 전체 상태를 저장한 뒤 새 버전을 확정한다.
- 실제 월 급여 실행 및 `PayrollSnapshot` 연동은 정책 결정이 필요한 Phase 3로 남겼다. 현재 생산수당 계산 로직은 변경하지 않았다.

## 2026-08-26 급여 체계 UI 시안: "적용 이력" 탭 제거 → 공정 버전 관리 스타일 "버전 관리" 다이얼로그로 대체

- **탭 구조 제거**: "급여 항목 및 단가"/"적용 이력" 2탭 구조를 없애고 화면에는 급여 항목 목록+상세 패널 하나만 남겼다. `tab` state와 `Tabs`/`Tab` 사용을 전부 제거했다.
- **"버전 관리" 다이얼로그로 대체**: 스타일 상세의 "공정 버전 관리"(`ProcessVersionManager.jsx`, Ver.1/Ver.2 목록 + 클릭 시 상세) 패턴을 참고하되, 급여는 "이미 배정된 작업 각각에 버전을 드래그로 지정"하는 공정 버전 관리의 핵심 메커니즘이 필요 없다(급여 버전은 배정 단위가 아니라 "이 달부터 이 기준" 식의 단순 타임라인이기 때문). 그래서 드래그 배정 없이 **버전 목록(왼쪽) + 클릭한 버전의 항목 스냅샷을 읽기 전용으로 보여주는 상세(오른쪽)** 구조로 가볍게 구현했다. 사용자 표현대로 "찾아보기"가 아니라 "볼 수 있게" 수준 — 검색/필터는 없다.
- **"저장" = 버전 확정**: 이 화면에 별도의 "버전 확정" 액션을 새로 만들지 않고, 기존 "저장" 버튼 클릭 시점에 `{versionNumber, effectiveMonth, items, rates, confirmedAt}` 스냅샷을 `versions` 배열에 추가하는 것으로 버전 확정을 겸하게 했다. 여전히 UI 시안이라 이 버전 목록도 브라우저 세션에만 존재하고 서버에 저장되지 않는다(§2026-08-23 "SalarySystem.jsx는 UI 시안").
- **아직 버전이 하나도 없는 초기 상태**: 공정 버전 관리처럼 처음부터 Ver.1을 가짜로 만들어두지 않고, "저장"을 한 번도 안 누른 상태에선 버전 관리 다이얼로그에 "아직 확정된 버전이 없습니다. 저장하면 새 버전으로 기록됩니다."라고 안내한다 — 실제로 확정된 적 없는데 이력이 있는 것처럼 보이지 않게 하기 위함.

## 2026-08-26 급여 체계 UI 시안: 상단 헤더/탭 정리 (부제목·중복 설정 버튼 제거, 탭 박스 해제)

- **부제목 제거**: "급여 체계" 제목 아래 있던 설명 문장("급여 항목, 복합 계산 단위, 적용 대상별 단가와 변경 이력을 관리합니다.")을 없앴다.
- **우측 정렬 헤더를 단일 flex row로 단순화**: 제목 Box와 버튼 Stack을 감싸던 중첩 구조를, `justifyContent: 'space-between'`을 쓰는 단일 `Stack`으로 평평하게 폈다(`ml:'auto'`가 걸린 자식 Stack을 부모 Stack 안에 한 겹 더 두던 구조 제거). 이 화면의 다른 행(급여 항목/상세 패널을 담은 `Stack`)이 이미 페이지 폭 전체를 정상적으로 쓰고 있는 것으로 볼 때, 상위 레이아웃(`AppPageContainer`) 자체는 폭 문제가 없다 — 우측 정렬이 안 되는 것처럼 보였다면 이전 커밋(`59d2e89e`)의 `width:'100%'` 수정이 아직 배포에 반영되지 않았을 가능성이 높다. 이번 커밋으로 구조 자체를 더 단순하고 검증하기 쉬운 형태로 바꿨다.
- **중복 "설정" 버튼 제거**: "지급 설정" 칩 목록 옆에 있던 "설정" 버튼과, 계산식 미리보기 박스의 "수정" 버튼이 둘 다 정확히 같은 동작(`openFormulaDialog`)이었다. "설정" 버튼을 제거하고 "수정" 버튼 하나만 남겼다.
- **탭 바가 박스에 갇혀 보이던 문제 수정**: "급여 항목 및 단가"/"적용 이력" 탭을 감싸던 `Paper variant="outlined"`(사방 테두리 박스)를 제거하고, 하단 구분선(`borderBottom`)만 있는 `Box`로 바꿔 일반적인 탭 바 형태로 정리했다.

## 2026-08-26 급여 체계 UI 시안: 계산식 다이얼로그 3차 개선 (커서 삽입, 색상, 정산 주기 단순화)

- **정산 주기 단순화**: `PAY_CYCLES`를 `매월/3개월마다/6개월마다/매년/1회 지급` 5종에서 `1개월/3개월/6개월/12개월` 4종으로 통일했다(`ONCE` 제거, "매년"→"12개월"로 표현 통일). 한/영/베 번역도 새 값으로 맞췄다.
- **계산식에 커서(삽입 위치) 도입**: 이전에는 파라미터/연산자 버튼을 누르면 무조건 계산식 맨 끝에만 추가됐다. 이제 계산식 칩 사이사이에 클릭 가능한 삽입 위치(`FormulaCursorSlot`, 커서는 파란 막대로 표시)가 있어 중간에 토큰을 끼워 넣을 수 있다. `cursorIndex` state가 "다음 토큰이 끼워질 위치"를 들고 있고, 버튼 클릭은 `insertFormulaToken`으로 그 위치에 삽입한 뒤 커서를 한 칸 전진시킨다(끝에 있으면 기존처럼 이어붙이는 것과 동일하게 동작). 문법 검사(`canAppendOperand`/`canAppendOperatorToken`)도 커서 좌우 양쪽 토큰과의 정합성을 함께 확인하는 `canInsertTokenAt`로 확장해, 중간에 끼워 넣어도 "피연산자-연산자" 교대 규칙이 깨지지 않게 했다. 칩을 삭제하면 커서 위치도 함께 보정한다.
- **"전체 지우기" → "초기화"**: 아이콘 버튼의 동작 자체는 그대로(직급별 단가 고정 항목은 `['GRADE_RATE']`로, 아니면 빈 배열로 되돌림)이지만, 이름과 아이콘을 "초기화"/`RestartAltIcon`으로 바꿔 실제 동작(완전히 비우는 게 아니라 기본 상태로 되돌리는 것)에 더 맞게 표현했다.
- **피연산자 칩 색상 완화**: 파라미터/상수 칩이 진한 파란색 단색 채움이라 "촌스럽다"는 피드백에 따라, `alpha(theme.palette.primary.main, 0.12)`로 만든 옅은 배경 + `primary.dark` 텍스트로 바꿔 톤을 낮췄다. 연산자 칩은 기존 회색 텍스트/흰 배경을 유지한다.
- **상단 안내 Alert 제거**: 계산식 다이얼로그 맨 위의 "모든 지급 방식은 아래 모듈의 조합으로 만듭니다..." 안내문을 없앴다.

## 2026-08-26 급여 체계 UI 시안: 상단 툴바 정리 (저장 버튼 우측 정렬, 항목 추가를 본문으로 이동)

- **저장 버튼이 우측에 붙지 않던 버그 수정**: 제목(`급여 체계`)과 버튼 그룹을 담은 최상단 `Stack`에 `width: '100%'`가 없어서, 버튼 그룹의 `ml: 'auto'`가 밀어낼 여유 공간 자체가 생기지 않고 제목 옆에 바로 붙어버렸다(플렉스 컨테이너가 콘텐츠 너비만큼만 줄어들어 있었음). `width: '100%'`를 추가해 컨테이너가 실제 가용 폭을 다 차지하게 하니 `저장` 버튼이 정상적으로 오른쪽 끝에 붙는다.
- **상단 "UI 시안입니다" 안내 배너 제거**: 항상 떠 있던 `Alert severity="info"` 배너를 없앴다. 액션 직후 뜨는 개별 안내 메시지(항목 추가 성공, 저장 클릭 시 "아직 서버 연결 안 됨" 안내)는 이번 범위에서 건드리지 않고 그대로 뒀다 — 사용자가 명시적으로 지목한 건 상시 노출 배너였다.
- **"적용 이력" 버튼 제거**: 툴바의 "적용 이력" 버튼은 바로 아래 탭바의 "적용 이력" 탭과 완전히 같은 동작(`setTab(1)`)이라 중복이었다. 탭은 유지하고 버튼만 없앴다.
- **"항목 추가"를 본문으로 이동**: 툴바에 있던 "항목 추가" 버튼을 없애고, 왼쪽 "급여 항목" 목록 패널의 헤더(제목+설명) 오른쪽에 작은 `+` 아이콘 버튼으로 옮겼다 — 항목을 추가하는 동작이 그 항목 목록과 같은 위치에서 이루어지도록.
- **"적용 시작월" 처리 방식은 아직 미정**: 사용자가 "공정 버전 관리처럼(Ver.1/Ver.2 확정 + 이력 관리) 쓰면 어떨까"라는 아이디어를 제안했지만 확정된 결정은 아니다. 구현 전 별도로 논의·확정해야 한다 — 지금의 단일 날짜 입력 방식을 그대로 둘지, 버전 확정 방식으로 바꿀지 아직 결정되지 않았다.

## 2026-08-26 급여 체계 UI 시안: 계산식 문법 강제 + 레이아웃 재배치 (계산식 다이얼로그 2차 개선)

- **모든 계산식은 직급별 단가로 시작**: 급여는 결국 직급별 단가에서 출발한다는 원칙에 따라, `INCENTIVE`(생산수당류) 카테고리가 아닌 모든 항목은 계산식의 첫 토큰이 항상 `GRADE_RATE`(직급별 단가)로 고정된다. `ensureFormulaStartsWithGradeRate(formula, category)`가 다이얼로그를 열 때 앞에 없으면 채워 넣고, 계산식 작업 영역의 첫 칩은 삭제 버튼이 없어 지울 수 없다. `INCENTIVE` 항목(생산 목표 초과 달성 성과급 등)은 예외다 — 생산수당은 급여 체계 UI가 단가를 관리하지 않는 외부 계산 결과를 그대로 지급하는 항목이라(§2026-08-23) 직급별 단가를 강제로 곱하면 의미가 깨진다. "전체 지우기"도 잠긴 항목은 빈 배열이 아니라 `['GRADE_RATE']`로 초기화된다. 기존 `만근수당` 기본 계산식도 `FULL_ATTENDANCE_FACTOR × GRADE_RATE`에서 `GRADE_RATE × FULL_ATTENDANCE_FACTOR`로 순서를 맞췄다(곱셈 교환법칙이라 값은 동일).
- **계산식 문법 강제(파라미터/상수 ↔ 연산자 교대)**: 예전에는 파라미터 버튼을 아무 순서로나 눌러 "실제근무일수 기준근무일수"처럼 연산자 없이 피연산자가 연달아 붙는 무의미한 식을 만들 수 있었다. `isOperandToken`/`canAppendOperand`/`canAppendOperatorToken` 헬퍼로 "피연산자(파라미터 또는 상수) → 연산자 → 피연산자 → 연산자 ..." 순서만 허용하도록 각 버튼의 `disabled`를 계산한다. 상수는 파라미터와 동일하게 피연산자로 취급되어 서로의 자리를 대신할 수 있다. `(`는 피연산자를 기대하는 자리에서만, `)`/사칙연산자는 피연산자나 `)` 뒤에서만 눌린다(괄호 짝 맞춤까지는 검증하지 않는 가벼운 문법 체크다).
- **다이얼로그 레이아웃 재배치**: 안내 Alert → 계산식 작업 영역(맨 위, 전체 폭) → 2단 그리드(왼쪽 파라미터 모듈 / 오른쪽 연산자+숫자상수, 그 아래 정산 주기·상한값) 순서로 바꿨다. 기존에 위에 있던 "지급 설정"(정산 주기+상한값) Paper는 연산자 패널 밑으로 옮겼다.
- **시각적 정리**: 계산식 작업 영역을 점선 테두리 박스로 구분하고 함수 아이콘+"계산식" 제목을 달았다. 피연산자 칩은 채워진 파란색(primary filled), 연산자 칩은 옅은 회색 텍스트(outlined, 배경 대비)로 구분해 눈으로 식을 더 잘 읽을 수 있게 했다. "전체 지우기"는 텍스트 버튼 대신 작은 아이콘 버튼(빗자루 아이콘, 툴팁)으로 바꿔 덜 두드러지게 했다. "상수 추가" 버튼은 좁은 오른쪽 컬럼에서 텍스트가 줄바꿈되던 문제를 텍스트필드+버튼을 `fullWidth`로 세로 스택해서 해결했다.

## 2026-08-26 급여 체계 UI 시안: 항목별 "적용 급여 타입" 선택 제거 + 저장 버튼 추가

- **급여 타입과 항목 적용 대상의 관계 확정**: `일반(GENERAL)`과 `수당(OUTPUT)` 급여 타입의 유일한 차이는 생산수당(생산 목표 초과 달성 성과급 등 `INCENTIVE` 카테고리) 유무다(§2026-08-23 급여 구성 정의와 동일). 따라서 급여 항목별로 "이 항목이 일반/수당 중 어디에 적용되는지"를 계산식 설정 화면에서 사람이 매번 고르게 하는 건 불필요한 입력이다 — `BASE`/`ALLOWANCE` 카테고리 항목은 항상 일반·수당 양쪽에 적용되고, `INCENTIVE` 카테고리 항목만 수당 전용이다.
- **UI 변경**: `SalarySystem.jsx`의 "계산 방식 설정" 다이얼로그와 "급여 항목 추가" 다이얼로그가 공유하던 `calculationFields()`에서 "적용 급여 타입" 다중 선택 콘트롤을 제거했다. `payTypes`는 이제 `defaultPayTypesForCategory(category)`(카테고리가 `INCENTIVE`면 `['OUTPUT']`, 아니면 `['GENERAL','OUTPUT']`)로 항목 생성 시점에 자동 결정되며 사용자가 직접 편집할 수 없다. 기존에 표시용으로 쓰이던 급여 타입 칩(사이드바 항목 목록, 지급 설정 요약, 직급별 단가표 필터)은 그대로 유지되며 값의 출처만 자동 계산으로 바뀌었다.
- **저장 버튼 추가 + 변경 감지**: 이 화면은 여전히 UI 시안이라 실제 서버 저장 API가 없다(§2026-08-23 "SalarySystem.jsx는 이 구조를 먼저 보여주는 UI 시안"). 상단 툴바에 공용 `SaveButton` 컴포넌트로 "저장" 버튼을 추가했고, 클릭하면 기존 "항목 추가" 성공 메시지와 같은 패턴으로 "아직 서버 저장에 연결되지 않았다"는 안내를 보여준다 — 실제 저장 성공처럼 보이게 하지 않는다. 데이터 로딩 직후(또는 마지막 저장 시점)의 `{items, rates, effectiveMonth}` 스냅샷을 `savedSnapshot`으로 들고 있다가 현재 상태와 문자열 비교해 `isDirty`를 계산하고, 변경이 없으면 저장 버튼을 비활성화한다. 기존 "항목 추가" 버튼은 `contained`에서 `outlined`로 낮춰 저장 버튼이 툴바의 유일한 주 강조 버튼이 되도록 정리했다.
- **"단가 기준" 선택도 제거**: 사용자가 "단가 기준은 정산 주기와 동일한 개념"이라고 판단해 `RATE_BASES`(VND/월, VND/근무일 등)와 그 선택 콘트롤을 통째로 제거했다. 실제로 이 화면의 계산 방식은 파라미터 조합형 계산식(§2026-08-23 "계산 방식 UI 시안")으로 이미 표현되므로, 별도의 "단가 기준" 라벨은 계산식과 중복이었다. 항목 목록/지급 설정 요약의 단가 기준 칩과 직급별 단가표의 "계산 기준" 열도 함께 제거했으며, 항목 헤더 부제(`calculationLabel`)는 정산 주기만 표시한다.
- **계산식 설정 다이얼로그 단순화**: (1) 파라미터 모듈 9개를 평면 나열 대신 `단가·근속`/`근무일수`/`근무시간`/`조건·외부 계산값` 4개 그룹으로 묶어 보여주고, `근무시간`(정규/연장/특근 3개가 섞여 헷갈리던 라벨)을 `정규 근무시간`으로, `특근시간`을 `휴일 특근시간`으로, 관련 툴팁 문구도 더 명확하게 다시 썼다. (2) 계산식 하단의 "완성된 식" 미리보기 박스를 제거했다(계산식 작업 영역의 칩 목록으로 이미 충분히 보임). (3) 다이얼로그의 "취소" 버튼을 제거했다 — `Dialog`의 `onClose`(배경 클릭/Esc)로 여전히 저장 없이 닫을 수 있다. (4) 연산자 목록에서 `MIN`/`MAX`를 빼고(복잡해 보인다는 지적), 그 자리에 있던 "숫자 상수" 입력을 연산자 패널로 옮겨 합쳤다. "전체 지우기"는 계산식 작업 영역 제목 옆으로 옮겨 지우는 대상 바로 옆에 두었다.

## 2026-08-26 레거시 스타일의 배정 저장이 "공정 버전 미확정"으로 막히던 문제 근본 수정

- **증상**: 이미 오래전에 배정(`AssignmentPlan`)이 생성된 스타일(공정 버전 관리 기능이 생기기 전, 혹은 그 화면을 한 번도 열어본 적 없는 스타일)에서, 그 배정을 구조적으로 바꾸는 저장(라인 이동/수량 변경/날짜 변경 등)을 하면 `"style {styleId} has no confirmed process version; confirm Ver.1 before assignment"` 409 에러로 저장 자체가 막혔다.
- **근본 원인**: `PUT /assignment-board-state` 안에는 스타일의 "확정된 공정 버전"(`StyleProcessVersion`)을 조회하는 코드가 세 갈래로 나뉘어 있었다.
  1. `createPlanRows`(카드를 라인에 처음 드래그해 **신규** `AssignmentPlan`을 만드는 경로) — `ensureInitialStyleProcessVersion()`을 호출해서, 버전이 하나도 없으면 **현재 살아있는 공정 구성으로 Ver.1을 그 자리에서 자동 생성**하고, `styleProcessVersionId=null`인 기존 레거시 배정도 함께 그 Ver.1로 백필한다.
  2. `refreshIncomingAssignmentCtSnapshotsFromStyles`/`prepareAssignmentBoardStTotalsForSave`(**이미 존재하는** 배정의 구조 변경을 재계산하는 두 경로) — 이 둘은 `db.styleProcessVersion.findFirst(...)`로 **조회만** 하고, 없으면 그냥 409를 던졌다. 자동 생성 로직이 없었다.
  - 즉 "신규 배정 생성"에는 자동 백필이 있었지만 "기존 배정 구조 변경"에는 없었다 — 정확히 사용자가 지적한 "배정이 먼저 생기고 버전 개념이 나중에 도입된" 레거시 스타일이 이 갭에 걸린다. 그런 스타일은 애초에 `createPlanRows` 경로(신규 배정 생성)를 다시 탈 일이 없으니 자동 생성 기회 자체가 없고, 배정을 만질 때마다 영원히 409에 막힌다.
- **수정**: 위 2번 두 경로도 `db.styleProcessVersion.findFirst`(조회만) 대신 `ensureInitialStyleProcessVersion()`(조회 없으면 자동 생성+레거시 배정 백필)을 쓰도록 통일했다(`backend/src/index.ts`, `refreshIncomingAssignmentCtSnapshotsFromStyles`/`prepareAssignmentBoardStTotalsForSave` 내부). 이제 세 경로 모두 "버전이 없으면 현재 공정 구성으로 Ver.1을 자동 확정하고 그것을 기본값으로 쓴다"는 동일한 규칙을 따른다 — 사용자가 수동으로 스타일 상세 화면에 들어가 "공정 버전 관리"에서 Ver.1을 눌러 확정할 필요가 없어졌다(원한다면 여전히 그 화면에서 버전을 새로 확정/재확정할 수 있고, 그렇게 만든 버전이 있으면 자동 생성 로직은 그 최신 버전을 그대로 쓴다).
- **영향받지 않는 것**: 이미 `styleProcessVersionId`가 있는 배정, 완료된 배정, 급여 잠금된 배정은 이번 변경 이전과 동일하게 자동 재계산 대상에서 제외된다. `ensureInitialStyleProcessVersion`은 `createPlanRows` 경로에서 이미 검증되어 쓰이던 기존 함수를 그대로 재사용한 것이라 신규 로직을 추가하지 않았다.

## 2026-08-26 사이드바 "조직 관리"/"설정" 메뉴 그룹 재배치

- `조직 관리`(ADMIN) 그룹 순서를 `직원 → 휴일 → (구독 관리, 시스템 관리자 전용) → 직원 체계 → 급여 체계 → 사업체`로 확정했다. `급여 체계`(`/salary-system`)와 `직원 체계`(`/employee-system`)는 기존에 `설정`(SETTINGS) 그룹 소속이었으나 `조직 관리` 그룹으로 옮겼다.
- `설정` 그룹에는 이제 `개인 설정`(`/personal-settings`)만 남는다.
- `접근 권한`(`/system-setting/access-policy`) 화면은 실제 사이드바 메뉴 구성(`window.__BARO_MENU_BLUEPRINT__`)을 그대로 미러링하는 자동 생성 화면이라 별도 데이터 수정 없이 이 메뉴 구조 변경만으로 자동 반영된다. `개인 설정`은 `FEATURE_KEYS.PROFILE`이 `NON_EDITABLE_FEATURE_KEYS`에 있어 원래도 이 화면에 노출되지 않는다(권한과 무관하게 항상 접근 가능한 "기본 제공" 메뉴이기 때문) — 그룹 이동과 무관하게 변하지 않는 동작이다.
- `급여 체계`/`직원 체계`의 접근 권한 feature key(`SALARY_SYSTEM`/`EMPLOYEE_SYSTEM`)는 경로 기준으로 결정되며 사이드바 그룹 소속과 무관하다. 이번 이동으로 역할별 기존 접근 권한 저장값(ROLE_ACCESS_POLICY)에는 영향이 없다.

## 2026-08-26 AT 갱신 버튼이 갱신 성공 후에도 계속 활성 상태로 남던 버그 수정

- 증상: 스타일 화면에서 `AT 갱신`을 눌러 "AT 갱신 완료" 알림까지 받았는데도, 버튼이 다시 비활성화되지 않고 계속 눌러지는 상태로 남아있었다.
- 원인: `GET /at-sync/status`의 `needsUpdate` 판정(`buildAtSyncStatusForOrg`)은 대상월(직전월)까지의 **모든 과거 월**을 검사해서, 그중 하나라도 "소스 데이터(WorkLog/WorkRecord/AttendanceEntry)의 최신 `updatedAt`이 그 달 `AtTrainingBucket.updatedAt`보다 최신"이면 전체를 `needsUpdate: true`로 판정한다. 반면 `AT 갱신` 버튼이 호출하는 실제 동기화(`syncStyleProcessActualTimesFromWorkRecords`)는 (1) 대상월 자체만 무조건 재계산하고, (2) 과거 월은 `ensureHistoricalAtTrainingBucketsForOrg`가 **버킷이 아예 없는(완전히 missing) 달만** 백필했다. 즉 "버킷은 이미 있지만 그 이후 원본 데이터가 수정/추가되어 낡아진(stale) 과거 달"은 두 로직 어디에서도 다시 계산되지 않아, 이런 달이 하나라도 있으면 대상월 갱신이 몇 번을 성공해도 `needsUpdate`가 영원히 `true`로 남았다.
- 수정: `ensureHistoricalAtTrainingBucketsForOrg`가 "버킷 자체가 없는 달"뿐 아니라 "버킷은 있지만 소스 데이터가 버킷보다 최신인 달"도 함께 찾아 재동기화하도록 확장했다(`collectStaleStoredAtTrainingMonthKeysForOrg` 신규 — `buildAtSyncStatusForOrg`의 staleness 판정 SQL과 동일한 정의: 월별 WorkLog/WorkRecord/AttendanceEntry 최신 `updatedAt` vs 해당 월 `AtTrainingBucket` 최신 `updatedAt` 비교). 이제 "missing 달 ∪ stale 달"을 합쳐 전부 `syncAtTrainingBucketsForMonth`로 재계산한다 — 상태 판정과 실제 재계산의 대상 범위가 동일해졌으므로, 재계산이 끝나면 `needsUpdate`도 정확히 `false`로 떨어진다.
- 영향 범위: `AT 갱신` 버튼 클릭 시 과거 stale 월이 있으면 이전보다 더 많은 달을 재계산하므로 실행 시간이 늘어날 수 있다. 기존에 stale 과거 월이 있던 조직은 다음 `AT 갱신` 클릭 때 그 달들의 `StyleProcessAtObservation`/`AtTrainingBucket`이 최신 데이터 기준으로 다시 계산된다(정상적으로 기대되는 동작이며, 과거 값을 임의로 덮어쓰는 게 아니라 실제로 더 최신인 원본 데이터를 반영하는 것).

## 2026-08-23 급여 타입 정비 + 직원 기본급 제거 + 급여 체계 UI 기준 변경

- **급여 타입 최종 용어/저장값**: 직원 급여 타입의 canonical 저장값은 `GENERAL`/`OUTPUT`이다. 화면의 짧은 표기는 한국어 `일반`/`수당`, 영어 `General`/`Output`, 베트남어 `Thường`/`Sản lượng`을 쓴다. 과거 `FIXED`/`CT` 입력은 정규화 계층에서 각각 `GENERAL`/`OUTPUT`으로만 호환하고 신규 저장에는 쓰지 않는다.
- **급여 구성**: `GENERAL`은 기본급+고정수당+변동수당, `OUTPUT`은 기본급+고정수당+변동수당+생산수당이다. 생산수당은 기존 작업 실적 기반 계산 시스템에서 별도로 계산하며 급여 체계 UI가 단가를 직접 관리하지 않는다.
- **감독 예외**: `WORKER_SUPERVISOR`는 생산 현장 직무지만 생산수당 대상이 아니므로 항상 `GENERAL`이다. 관리자/운영자/회계사도 `GENERAL`, 감독을 제외한 생산 작업자는 기본적으로 `OUTPUT`이다. 감독 여부의 경계를 넘는 직무 변경에서만 급여 타입을 자동 재설정하고, 비감독 직무끼리 변경할 때는 사용자가 명시한 급여 타입을 보존한다. 읽기 시점 급여 계산도 감독이면 저장값과 무관하게 `GENERAL`로 판정한다.
- **직원별 기본급 제거**: `Employee.fixedSalary`는 Prisma 모델, 직원 API, 직원 관리 UI에서 제거됐다. 배포 시 `20260823170000_remove_employee_fixed_salary`와 `migration_fix.sql`이 컬럼을 삭제하며, `STARTUP_FORBIDDEN_RUNTIME_COLUMNS`가 잔존 컬럼을 감지한다. 직원 관리에서는 급여 타입만 지정하고 기본급은 입력하거나 표시하지 않는다.
- **급여 체계의 단가 축**: 급여 항목 단가는 더 이상 권한(`orgRole`)이나 직무별로 나누지 않고 **급여 타입(`GENERAL`/`OUTPUT`) + 직급(`gradeId`)** 조합으로 관리하는 것이 최종 방향이다. 관리자·운영자·회계사·생산 감독처럼 권한/직무가 달라도 같은 급여 타입과 직급이면 같은 단가를 쓴다. 2026-08-23 현재 `SalarySystem.jsx`는 이 구조를 먼저 보여주는 UI 시안이며, 기존 `EmployeeCompensationPolicy.orgRole + gradeId` 서버 스키마/API를 `payType + gradeId`로 바꾸는 작업은 아직 미구현이다.
- **UI 시안 주의**: 서버 구조가 전환되기 전까지 급여 체계 화면은 기존 정책 응답을 임시로 `WORKER→OUTPUT`, 그 외 권한→`GENERAL`로 접어 초기값을 표시한다. 중복된 일반 정책은 첫 값을 임시 사용한다. 이 매핑은 데이터 모델이 아니라 전환 전 미리보기 호환 로직이므로 백엔드 구현 시 제거해야 한다.
- **계산 방식 UI 시안**: 급여 항목의 계산 방식 종류를 별도 유형으로 나누지 않고 하나의 제한형 계산식으로 통일한다. 자유 텍스트 수식이 아니라 사전 정의된 파라미터(직급별 단가, 실제/기준 근무일수, 근무·연장·특근시간, 근속연수, 만근 충족값, 생산수당 계산 결과 등), 제한된 연산자, 숫자 상수를 모달에서 순서대로 조립한다. 정액은 `직급별 단가`, 조건부 지급은 `만근 충족값(1/0) × 직급별 단가`, 외부 계산은 `생산수당 계산 결과`처럼 같은 구조로 표현한다. 이 계산식은 2026-08-23 현재 UI 시안이며 아직 서버 저장이나 급여 계산에는 연결되지 않았다.
- **월 근무일수 원칙**: `기준 근무일수`는 26일·24일 같은 공통 상수가 아니다. 적용 대상 월의 실제 달력에서 회사의 근무요일을 구한 뒤 등록 공휴일을 제외해 서버가 계산해야 한다. `실제 근무일수`는 해당 직원의 실제 출근 결과이며, 월 일할 계산의 예시는 `직급별 단가 × 실제 근무일수 ÷ 기준 근무일수`다.

## 2026-08-21 BusinessPartner→Organization 병합 후속: migration_fix.sql이 매 배포마다 크래시루프에 빠진 버그 수정

- **증상**: 8/20 병합(바로 아래 §"2026-08-20 BusinessPartner를 Organization에 흡수") 배포는 정상 완료됐는데, 그 이후 커밋(예: `AssignmentPlan.completionAdjustmentHistory` 컬럼 추가처럼 새 스키마 drift를 유발하는 아무 변경이든)을 배포할 때마다 컨테이너가 healthcheck를 통과하지 못하고 재시작 루프에 빠졌다. 런타임 로그: `[startup] Runtime DB schema drift detected (AssignmentPlan.completionAdjustmentHistory). Applying migration_fix.sql...` 직후 `Error: insert or update on table "OutsourcedWorkRecord" violates foreign key constraint "OutsourcedWorkRecord_outsourcingPartnerId_fkey"`.
- **원인**: `migration_fix.sql`의 "Step 0s" 블록이 예전(병합 이전) 스키마를 되살리는 죽은 코드로 남아 있었다 — 실행될 때마다 `CREATE TABLE IF NOT EXISTS "BusinessPartner"`로 **빈 테이블을 다시 만들고**, `OutsourcedWorkRecord.outsourcingPartnerId → BusinessPartner(id)` FK를 `IF NOT EXISTS(제약명)`로 다시 추가하려 시도했다. 그런데 운영 DB는 이미 8/20 병합(`ensureBusinessPartnerMergedIntoOrganization`)이 성공해서 `BusinessPartner` 테이블은 삭제됐고 `outsourcingPartnerId`는 `Organization`의 id를 가리키는 상태였다. 아무 이유로든(새 컬럼 추가 등) `migration_fix.sql`이 다시 실행되면, 방금 새로 만들어진 빈 `BusinessPartner` 테이블에 대해 이미 `Organization` id로 채워진 `outsourcingPartnerId` 값 기준 FK 추가를 시도하다 참조 무결성 위반으로 실패했다. `migration_fix.sql` 전체가 사실상 한 트랜잭션으로 실행되는 구조라 이 실패가 파일 앞쪽의 `completionAdjustmentHistory` 컬럼 추가까지 통째로 롤백시켰고, 그래서 재부팅해도 "drift 있음" 판정이 계속 반복되며 무한 재시작 루프가 됐다.
- **수정**: `migration_fix.sql`에서 죽은 "Step 0s" `BusinessPartner` 재생성 블록(enum·테이블·인덱스·FK)을 완전히 제거했다. `OutsourcedWorkRecord.outsourcingPartnerId`의 FK는 이제 `schema.prisma`의 현재 소스오브트루스와 동일하게 처음부터 `Organization(id)`을 직접 참조하도록(`OutsourcedWorkRecord_outsourcingPartnerId_org_fkey`, `ON DELETE RESTRICT`) 바꿨고, 혹시 옛 제약명이 남아있는 환경을 위해 `DROP CONSTRAINT IF EXISTS`로 구 FK를 먼저 안전하게 제거한다. `ensureBusinessPartnerMergedIntoOrganization`(TS 함수, `BusinessPartner` 테이블 존재 여부를 직접 조회해 없으면 no-op)은 그대로 뒀다 — 아직 병합 전인 다른 환경(로컬/스테이징)이 있다면 여전히 정상 동작한다.
- **의미**: 운영 DB(이미 병합 완료)에서는 이 블록이 그냥 통과(no-op)되어 재시작 루프가 해소된다. 신규/개발 DB에서는 예전처럼 `BusinessPartner`를 만들었다가 곧바로 지우는 우회 없이 최종 스키마(Organization FK)로 바로 생성된다 — 결과는 동일하고 불필요한 단계만 없앤 것.
- **교훈**: 레거시 컬럼/테이블 제거 원칙(§"레거시 컬럼/JSON key는 백필→신규 저장 차단→운영 조회 참조 제거→검증→DB DROP 순서로만 제거")은 `migration_fix.sql` 자체의 DDL 블록에도 똑같이 적용해야 한다 — 앱 코드(TS)에서 한 테이블을 완전히 병합/제거했다면, `migration_fix.sql`이 그 테이블을 다시 만들어내는 옛 블록도 같은 커밋 또는 후속 커밋에서 반드시 같이 정리해야 한다. 그렇지 않으면 "스키마 drift 재감지 → migration_fix.sql 전체 재실행"이라는 이 프로젝트 고유의 기동 경로 때문에, 이미 끝난 마이그레이션이 매 배포마다 되살아나 충돌할 수 있다.

## 2026-08-20 BusinessPartner를 Organization에 흡수 (거래처 엔티티 통합) + "거래처 관리" 메뉴 신설

- **배경**: 바로 아래 §"2026-08-19 후속5"가 확정했던 "테넌트(Organization) vs 비테넌트(BusinessPartner) 2계층 분리" 설계를 사용자가 명시적으로 뒤집었다. AI는 멀티테넌시 보안 경계(인증/구독/`OrgRelationship`)를 건드리는 위험을 근거로 반대 의견을 냈으나, 사용자는 "처음부터 제대로 만들자, Organization 자체가 무거운 게 아니다"라는 판단으로 통합을 명시적으로 강행 결정했다. 이 섹션은 그 반전 이후의 최종 설계이며, 바로 아래 §후속5의 옛 문구는 이 섹션으로 대체된 것으로 본다(§후속5는 이력 참고용으로만 남긴다).
- **최종 스키마**: `BusinessPartner` 테이블/`BusinessPartnerType` enum은 삭제됐다. `OrganizationType`에 `PROCESS_OUTSOURCING`/`MATERIAL_SUPPLIER` 두 값이 추가됐고, 거래처는 이제 `Organization` 행이다. `Organization`에 `ownerOrgId Int?`(자기참조 FK, 이 거래처를 등록한 제조사 — `BusinessPartner.orgId`의 대체)와 `isActive Boolean @default(true)`(실 테넌트는 항상 `true`로 무시, 거래처 행만 의미 있음)를 추가했다. `contactName`/`contactPhone`은 별도 컬럼을 새로 만들지 않고 이미 있던 `Organization.representative`/`Organization.phone`을 재사용한다. `Organization.code`는 원래 `String? @unique`(nullable)라 거래처 행은 `code: null`로 남긴다.
- **유니크 제약**: `@@unique([ownerOrgId, type, name])`(§47 OrgMembership→Employee 통합과 동일 원리로 non-partial unique로 충분 — Postgres UNIQUE는 NULL끼리 충돌하지 않으므로 실 테넌트(`ownerOrgId=NULL`)는 서로 영향받지 않는다). `OutsourcedWorkRecord.outsourcingPartnerId`는 컬럼명 그대로, FK 대상만 `BusinessPartner`→`Organization`으로 전환했다(`onDelete: Restrict` 유지). `Organization`이 이미 이 레코드에 `orgId` FK로 연결돼 있어 신규 FK는 명시적 relation 이름(`"OutsourcedWorkRecordVendor"`)이 필수였다 — `WorkOrder.buyerOrg`/`sellerOrg` 등 기존 named-relation 패턴과 동일.
- **마이그레이션 (2단계로 분리, Postgres 제약 때문)**: `ALTER TYPE ... ADD VALUE`는 같은 트랜잭션에서 추가한 값을 즉시 쓸 수 없다 — 이 저장소가 `WorkOrderStatus.EDITING` 추가 때 이미 겪은 문제(`ensureWorkOrderStatusSchemaReady()`)와 동일하다. 그래서 `migration_fix.sql`(Step 0t)에는 enum 값 추가 + `Organization.ownerOrgId`/`isActive` 컬럼·FK·인덱스 DDL만 넣었고, 실제 데이터 이동(`BusinessPartner` 행 → `Organization` INSERT, `OutsourcedWorkRecord.outsourcingPartnerId` 리매핑, `BusinessPartner` 테이블/enum DROP)은 백엔드 시작 시 별도 함수 `ensureBusinessPartnerMergedIntoOrganization()`(`backend/src/index.ts`, `ensureWorkOrderStatusSchemaReady()` 바로 아래, `bootstrapApplicationServices()`에서 호출)이 자기 트랜잭션으로 수행한다. `BusinessPartner` 테이블이 이미 없으면 즉시 return하는 멱등 함수다.
- **시작 시 스키마 드리프트 게이트**: `STARTUP_REQUIRED_RUNTIME_COLUMNS`에서 `BusinessPartner.contactName`/`contactPhone` 항목을 제거하고 `Organization.ownerOrgId`/`isActive`를 추가했다(이 두 컬럼은 `migration_fix.sql`이 매 배포 DDL로 만드므로 첫 부팅부터 안전). **`STARTUP_FORBIDDEN_RUNTIME_TABLES`에는 아직 `"BusinessPartner"`를 추가하지 않았다** — `ensureRuntimeSchemaReady()`가 `bootstrapApplicationServices()`(실제 DROP이 일어나는 곳)보다 먼저 실행되므로, 지금 추가하면 첫 배포에서 DROP이 일어나기도 전에 크래시루프에 빠진다. 운영 배포 로그에서 `ensureBusinessPartnerMergedIntoOrganization()` 성공 로그를 확인한 뒤 별도 후속 커밋에서 추가해야 한다.
- **인증/테넌시 안전장치 (거래처 Organization이 실 테넌트 권한을 얻지 못하게)**: `GET /organizations`(`backend/src/organizations/organization.routes.ts`)에 `type: { in: ['MANUFACTURER','BRAND'] }` 필터를 추가했다 — 이게 없으면 이 엔드포인트가 거래처 Organization도 반환하면서 `attachOrganizationSubscription`을 통해 자동으로 구독 레코드를 만들어버린다(가장 시급했던 구멍). `ensureOrganizationSubscription`(`access.ts`)에도 `organization.type`이 MANUFACTURER/BRAND가 아니면 조기 반환하는 방어 가드를 추가했다. `getPrimaryOrganization`(`access.ts`, 타입 필터 없던 `findFirst` fallback)에도 같은 타입 필터를 추가했다. 온보딩 승인 경로(Employee 생성 지점)에도 `organizationType`이 MANUFACTURER/BRAND가 아니면 400을 던지는 명시적 fail-closed assertion을 추가했다(구조적으로는 원래도 그 값만 나올 수 있었지만, 향후 실수 방지용). 기존 `type: { in: ['MANUFACTURER','BRAND'] }` 필터가 이미 있던 전역 속성 복제/AT-sync 팬아웃 지점들은 거래처 타입을 그 목록에 추가하지 않는 것 자체가 가드다.
- **API 하위호환**: `/business-partners*` REST 경로와 응답 DTO(`{id, name, type, contactName, contactPhone, isActive, createdAt, createdBy, updatedAt}`)는 그대로 유지한다. 내부적으로만 `prisma.organization`을 `ownerOrgId`+`type`으로 쿼리하고, `contactName`↔`representative`/`contactPhone`↔`phone` 매핑을 공유 헬퍼 `toBusinessPartnerResponse()`가 담당한다. 이 덕분에 `BusinessPartnerDialog.jsx`(이미 `initialType`/`lockType` prop을 지원하고 있었음)와 `WorkDetail.jsx`의 외주 업체 인라인 등록 플로우는 무수정으로 계속 동작한다.
- **"거래처 관리" 메뉴 그룹 신설**: 기존에는 고객(`/customer`)과 거래처(`/business-partner`, PROCESS_OUTSOURCING/MATERIAL_SUPPLIER 두 타입이 한 화면에 섞여 표시)가 이미 같은 "영업 관리" 그룹 안에 있었다(사용자가 "다른 그룹에 있다"고 가정했던 것과 달리 원래도 한 그룹이었음, 코드 확인됨). 이제 별도 "거래처 관리" 그룹(`MENU_GROUP_KEYS.PARTNERS`)을 신설해 고객사(`/customer`, 라벨 "고객"→"고객사"로 변경), 외주 업체(`/outsourcing-partner`, `BusinessPartners.jsx`를 `type="PROCESS_OUTSOURCING"`으로 마운트), 공급 업체(`/material-supplier`, 같은 컴포넌트를 `type="MATERIAL_SUPPLIER"`로 마운트) 세 메뉴를 담는다. `BusinessPartners.jsx`는 `type` prop이 있으면 목록을 그 타입으로 필터하고 Type 컬럼을 숨기며 페이지 타이틀을 "외주 업체"/"공급 업체"로 바꾼다. 구 `/business-partner` 경로는 `/outsourcing-partner`로의 `<Navigate replace>` 리다이렉트로 남겨 북마크 호환을 유지한다.
- **접근 권한 신규 feature key**: 구 `/business-partner`는 전용 feature key 없이 `FEATURE_KEYS.ORDER`를 재사용했다. 분리된 두 메뉴는 `AccessPolicyBoard.jsx`에서 독립적으로 토글 가능해야 하므로(같은 경로+쿼리파라미터만 다른 방식이면 `buildMenuTree`의 경로 기반 feature-key 파생이 충돌한다는 걸 사전 조사로 확인) `OUTSOURCING_PARTNER`/`MATERIAL_SUPPLIER` 두 개의 독립 feature key를 신설했다(`accessControl.js`, `roleAccessPolicyCore.mjs`). `ROLE_ACCESS_POLICY_SCHEMA_VERSION`을 8→9로 올리고, 기존에 `ORDER`를 가진 역할(제조사 ADMIN/OPERATOR, 브랜드 ADMIN/OPERATOR — 이전에 `/business-partner`에 실제로 접근 가능했던 범위와 동일)에 두 신규 키를 기본값으로 백필하는 `applyLegacyBusinessPartnerSplitDefault()`를 `OUTSOURCING_RECORD` 추가 때와 같은 패턴으로 추가했다.
- **사후 검증 (구현 시점에 아직 운영 DB에 반영/확인 전)**: 운영 DB의 기존 `BusinessPartner`(외주 업체 "Nga" 포함) 행 수·`OutsourcedWorkRecord` 연결 건수를 마이그레이션 전후로 대조해 데이터 손실이 없는지 확인해야 한다. 확인 항목: `Organization.ownerOrgId IS NOT NULL` 행 수가 마이그레이션 전 `BusinessPartner` 행 수와 정확히 일치, "Nga"의 `representative/phone/isActive`가 이전 값과 동일, 새 `Organization.id`로 연결된 `OutsourcedWorkRecord` 건수가 이전과 동일, 거래처 Organization에 `OrganizationSubscription`/`Employee` 행이 전혀 생기지 않았는지(위 가드들의 회귀 테스트). `backend/scripts/verify-relational-integrity.js`도 `BusinessPartner` JOIN을 `Organization`(+`ownerOrgId`)로 갱신했다.
- **후속 커밋 (이번 범위 아님)**: 운영 배포 성공 확인 후 `STARTUP_FORBIDDEN_RUNTIME_TABLES`에 `"BusinessPartner"` 추가 + DMMF 기반 역검사(`modelByName.has("BusinessPartner")`) 추가.

## 2026-08-20 "수량 확인" 드로어를 배정 보드/보고서 공용 컴포넌트로 분리

- 배정 보드(`AssignBoard.jsx`)의 우클릭 → `수량 확인` 드로어는 `frontend/src/components/QuantityReviewDrawer.jsx`로 추출됐다. `externalId`(AssignmentPlan.externalId), `orgId`, `languageCode`와 드로어 헤더에 즉시 보여줄 표시용 fallback(`headerOrderNo`/`headerStyleLabel`/`headerQuantity`)만 props로 받고, 나머지는 컴포넌트 내부에서 `/assignment-plans/:externalId/quantity-review`를 직접 조회한다. `externalId`가 falsy면 드로어는 닫힌 상태를 유지한다.
- 고객 보고서(`CustomerProductionReport.jsx`)도 같은 컴포넌트를 재사용해 우클릭 → `수량 확인` → 드로어 열림을 배정 보드와 동일하게 지원한다. 보고서 한 행(스타일)은 여러 `AssignmentPlan`(라인 분할 등)에 걸칠 수 있으므로, 백엔드 `GET /customer-production-reports` 응답에 스타일 행별 `assignmentPlanExternalIds` 배열을 추가했다. 프론트는 이 배열 길이가 정확히 1일 때만 우클릭 메뉴의 `수량 확인` 항목을 활성화한다 — 0건(미배정) 또는 2건 이상(어느 배정을 열지 모호)이면 비활성화하고 임의로 첫 번째 값을 열지 않는다.
- 보고서에서는 다중 스타일 주문의 상위(주문 단위 합산) 행에는 우클릭 메뉴를 연결하지 않는다. 실제 `AssignmentPlan`과 1:1로 대응 가능한 개별 스타일 행(단일 스타일 주문의 대표 행, 또는 펼친 스타일별 하위 행)에만 연결한다.
- 새 기능/페이지가 같은 드로어를 다시 열어야 하면 이 공용 컴포넌트를 재사용한다. AssignBoard 전용 상태(`quantityReviewData`/`Loading`/`Error`, 라우트 변화 감지로 드로어를 닫던 ref)는 이 추출 과정에서 전부 컴포넌트 내부로 흡수됐으므로 AssignBoard.jsx에는 더 이상 존재하지 않는다.

## 2026-08-19 후속5: 업체 엔티티 구조 (2026-08-20 대체됨 — 이력 참고용)

- **이 섹션은 더 이상 유효하지 않다.** 여기서 확정했던 "테넌트(Organization) vs 비테넌트(BusinessPartner) 2계층 분리"는 사용자가 2026-08-20 명시적으로 뒤집었다. 현재 설계는 바로 위 §"2026-08-20 BusinessPartner를 Organization에 흡수"를 따른다 — `BusinessPartner` 테이블은 삭제됐고, 외주업체/공급업체는 `Organization.type`(`PROCESS_OUTSOURCING`/`MATERIAL_SUPPLIER`) + `ownerOrgId`로 표현된다.
- 아래는 폐기된 옛 판단 근거를 이력으로만 남긴 것이다: 당시엔 로그인 필요 여부로 두 계층을 나누는 것이 멀티테넌시 보안 경계상 안전하다고 판단했었다(`Organization`=로그인/구독/직원 가능한 테넌트, `BusinessPartner`=로그인 없는 경량 테이블). `Factory`/고객처럼 로그인이 필요한 실체는 계속 `Organization`에 남아있다 — 이번 통합에서도 `Factory`/고객 자체의 위치는 바뀌지 않았고, 바뀐 것은 외주업체·공급업체가 있던 자리(`BusinessPartner`)뿐이다.

## 2026-08-19 후속4: bucketQuantity 존재 여부로 실제 생산률·남은 계획 부하 계산을 게이트하지 않는다

- `assignmentStSnapshot`은 두 가지 서로 다른 최상위 shape로 저장될 수 있다. `buildAssignmentStSnapshot`(수량 버킷 경로)은 `bucketQuantity`/`quantityBucketEntryId`/`quantityBucketSetVersionId`를 최상위에 남기지만, `PUT /styles/:styleId/process-version-boundaries`(공정 버전 재확정 경로)가 마지막으로 다시 쓴 배정은 `revision`/`confirmedDate`/`styleProcessVersionId` shape를 쓰고 최상위 `bucketQuantity`가 없다. 두 shape 모두 `processes[].styleProcessId/stSeconds/applicableQuantity`는 정상적으로 채워져 있다.
- `resolveWorkRecordStSecondsForLineMonthCapacity`(라인-월 실제 생산 ST)와 `calculateRemainingStTotalSecondsFromProcessProgress`(§51/53의 남은 계획 부하 핵심 함수) 둘 다 `processes[]`만 읽고 최상위 `bucketQuantity`는 전혀 읽지 않는다. 그런데도 두 호출부가 각각 `assignmentStSnapshot.bucketQuantity != null`을 게이트로 썼었다:
  - `buildLineMonthCapacityRows`의 실제 생산 집계 루프(`plans.forEach`)는 `bucketQuantity === null`이면 그 plan을 통째로 `return`해서, 실제 존재하는 `WorkRecord`의 ST를 그 라인의 월별 실제 생산 ST 합계(`lineMonthlyActualOutputStSeconds`, "실제 생산률"의 분자)에서 전부 누락시켰다.
  - `buildAssignmentPlanProgressRows`의 `exactRemainingStTotalSeconds` 계산은 `bucketQuantity != null`일 때만 호출되고, 아니면 `null`로 떨어져 더 거친 비율 기반 `ratioProgressForRemainingRatio`로 폴백했다 — 이 폴백은 §51/53이 "공정 하나의 최소 완성수량으로 전체 ST를 다시 넣는" 과대추정 문제를 고치려고 넣은 정확 계산 자체를 우회시킨다.
- 두 게이트 모두 제거하고(`bucketQuantity`는 진단용으로만 nullable로 남김), snapshot shape와 무관하게 `processes[]`만으로 항상 계산하도록 고쳤다.
- 2026-08-19 운영 DB로 재현: LINE #1(66개 배정 중 14개, TKD 바람막이 포함)과 조직 전체 미완료 배정(33개 중 12개, 36%)이 이 shape였다. TKD 바람막이 배정 하나만 해도 8월 `WorkRecord` 136건·약 805시간 ST가 "실제 생산률" 분자에서 통째로 빠지고 있었고, 같은 원인으로 "계획 부하"도 비율 폴백 탓에 100%로 과대추정되고 있었다.
- `process-version-boundaries` 쓰기 경로 자체(왜 다른 shape를 쓰는지, 두 shape를 하나로 통일할지)는 이번 범위에서 건드리지 않았다 — 순수 소비자 쪽 게이트만 제거해 두 shape 모두 정상 계산되게 한 안전한 최소 수정이다.

## 2026-08-19 공정 성별 적용 대상 → 배정 ST/CT/진행률 계산 반영

- 성별 전용 공정이 있는 스타일의 배정 ST/CT 총합은 주문 항목(`WorkOrderItem.gender` M/W/U + 수량)에서 남성/여성 수량을 집계해 반영한다. `MALE_ONLY` 공정은 그 주문·스타일의 남성 수량만, `FEMALE_ONLY`는 여성 수량만 곱하고, `UNISEX`(기본값) 공정은 기존처럼 전체 수량을 곱한다. ST 버킷 조회 자체는 여전히 전체 수량 기준 버킷을 재사용한다(성별 하위 수량으로 별도 버킷을 다시 찾지 않음) — 정확도보다 구현 복잡도·위험을 낮추기 위한 의도적 단순화이며, "남성 전용 공정을 여성 100% 주문에서 완전히 0으로 배제"처럼 사용자가 요청한 핵심 효과는 그대로 달성한다.
- 성별 수량 집계는 `resolveOrderStyleGenderQuantityMap`(order 객체 기반, `syncAssignmentPlansForOrderLock`용)과 `loadStyleGenderQuantityMapForWorkOrderIds`(workOrderId로 직접 `WorkOrderItem` 조회, board-save용) 두 헬퍼로 한다. 성별이 비어있는(blank) 또는 `U`인 행은 남성/여성 어느 쪽으로도 추정하지 않고 `unspecified`로 별도 집계한다 — `workOrderItemToItemShape`가 표시용으로 쓰는 "빈 값→M 기본" 규칙과 다르다(표시는 추정해도 되지만 계산은 추정하면 안 된다).
- 스타일에 `MALE_ONLY`/`FEMALE_ONLY` 공정이 하나도 없으면(현재 운영 데이터 전부 해당) 이 계산 경로 자체를 타지 않는다 — 성별 수량 조회조차 하지 않고 기존 로직과 수학적으로 동일한 결과를 낸다. 성별 전용 공정이 있는데 그 스타일의 주문 항목에 `unspecified` 수량이 하나라도 섞여 있으면 배정 저장을 409로 거부한다(어느 쪽에 얼마나 배분해야 할지 알 수 없는 값을 임의로 나누지 않는다 — 정확 계산 원칙) — "이 스타일의 모든 주문 항목에 성별을 지정해 주세요" 취지의 에러다.
- **ST/CT 총합을 gender-aware하게 고친 지점 (`AssignmentPlan`의 영구 저장값을 만드는 지점 전부)**: (1) `syncAssignmentPlansForOrderLock`의 재계산 루프(주문 잠금 후 수량이 바뀐 기존 배정을 갱신), (2) `PUT /assignment-board-state`의 `createPlanRows` 블록(카드를 라인에 처음 드래그해 신규 `AssignmentPlan`을 만드는 경로), (3) `PUT /assignment-board-state`의 `prepareAssignmentBoardStTotalsForSave`(이미 만들어진 배정의 수량·스타일이 바뀌는 구조 변경 재계산 — 확정 버전 스냅샷 기반/라이브 공정 기반 두 분기 모두). `calculateAssignmentStTotalSecondsFromStyleRows`/`calculateAssignmentStTotalSecondsFromSnapshotProcesses`/`buildAssignmentStSnapshot`/`buildEditableAssignmentCtSnapshotFromLiveStyle`는 전부 `genderQuantities` 옵션 인자를 받는다. 생략(`null`)하면 이전과 수학적으로 동일하게 동작한다.
- **진행률·완료 판정도 gender-aware하게 고쳤다.** `assignmentCtSnapshot.processes[]`에 저장한 `applicableQuantity`(그 공정에 실제 적용된 수량 — UNISEX면 전체 수량과 같음)를 `resolveAssignmentPlanRequiredProcessApplicableQuantities(plan)`로 읽어, "완제품 수량 = 공정별 누적의 최소값" 계산(`resolveAssignmentProcessGroupTotals`/`resolveProducedQtyFromProcessKeyTotals`)에서 각 공정의 완료 수량을 `Math.round((completedQuantity / applicableQuantity) * plannedQuantity)`로 정규화한 뒤 min을 취한다. 즉 남성 전용 공정이 자기 목표치(예: 300)에 도달하면 전체 배정 수량(예: 500) 기준으로 "다 채운 것"으로 정규화되어, 다른 공용 공정과 동등하게 비교된다 — 남성 전용 공정이 300에서 영원히 멈춰 있는 것처럼 취급되어 진행률이 낮게 잡히거나 `REVIEW_REQUIRED`에서 못 벗어나는 문제를 막는다. 정규화는 1로 클램프하지 않는다(초과생산 비율도 그대로 보존해야 `hasExactProcessCompletion`의 "공정끼리 정확히 같은 수량으로 끝났는가" 짜투리 감지가 계속 작동한다). 이 변경은 `resolveProducedQtyFromProcessKeyTotals`의 모든 호출부(진행률 API, 라인-월 capacity, 스케줄 완료일 추정, 완료 조정 등 6곳)에 적용했다.
- `calculateRemainingStTotalSecondsFromProcessProgress`(§51/53의 "남은 계획 부하" 핵심 함수)는 사실 이 기능 이전부터 `assignmentStSnapshot.processes[].applicableQuantity` 필드를 이미 읽도록 준비되어 있었다(어떤 writer도 채운 적 없는 죽은 필드였을 뿐). `buildAssignmentStSnapshot`/`createPlanRows`가 이제 이 필드를 채우므로 이 함수는 추가 수정 없이 자동으로 gender-aware해졌다.
- `StyleProcessVersion.processSnapshot`(공정 버전 확정 시점 스냅샷)은 `loadStyleProcessMirrorMapForStyleIds`(→`buildStyleProcessMirrorFromRows`, 이미 `genderScope`를 포함)로 만들어지므로 신규/재확정 버전 모두 `genderScope`를 그대로 보존한다. 과거(이 기능 이전) 확정 버전은 `genderScope`가 없을 수 있는데, 이 경우 `normalizeProcessGenderScope`가 안전하게 `UNISEX`로 기본 처리한다(과거 데이터에 영향 없음).
- AT 추정(`AtTrainingBucket`/`StyleProcessAtObservation` 회귀)은 이 문제와 무관하다 — `WorkRecord.quantity`(실제 기록된 생산량)만 입력으로 쓰고 `AssignmentPlan.assignmentQuantity`(계획 수량)를 전혀 참조하지 않으므로, 성별 전용 공정도 처음부터 실제 관측치만으로 정확히 학습된다.
- 배정 상세 드로어(`AssignBoard.jsx`)는 그 배정에 남성 전용/여성 전용 공정이 하나라도 있으면 "성별 ST 내역" 박스를 추가로 보여준다(둘 다 없으면 박스 자체를 렌더링하지 않음). 남성 전용/여성 전용/공용 ST 합계를 각각 표시하며, 값은 프론트에서 다시 계산하지 않고 저장된 `assignmentStSnapshot.processes[]`의 `stSeconds × applicableQuantity`를 공정별 `genderScope`로 나눠 합산한 것이다 — CT 편집 테이블(`detailProcessRows`, 라이브 스타일 기준 재계산)과는 별도 경로다.
- **이번에도 의도적으로 손대지 않은 것 (알려진 미해결 범위, 훨씬 좁아짐)**:
  1. **미배정 카드(pool card)의 ST/PT/AT 미리보기**(`buildAssignmentCardsFromOrders`)와 **프론트 board-save 미리보기**(`AssignBoard.jsx`)는 여전히 전체 수량 기준이다. "assignmentStTotalSeconds의 최종 계산 책임은 백엔드 저장 시점에 둔다"는 기존 원칙에 따라 참고용 미리보기로만 취급하고, 실제 저장 시점(배정 생성·구조 변경)에는 위에서 고친 경로가 정확한 값을 만든다.
  2. `PUT /assignment-board-state`에서 이미 확정 버전이 연결된(`styleProcessVersionId` not null) 기존 배정은, 수량이 바뀌는 구조 변경이어도 `assignmentCtSnapshot` 자체는 재생성하지 않고 기존 값을 그대로 보존한다(§9 "저장 시점의 공정/표준 구성을 고정한다" 원칙에 따른 기존 동작 — 이번에 새로 만든 제약이 아니다). `assignmentStSnapshot`/`assignmentStTotalSeconds`는 이 경우에도 이번에 고친 대로 최신 성별 수량으로 재계산된다. 따라서 CT 스냅샷의 `applicableQuantity`가 원래 배정 생성 시점 수량 기준으로 약간 오래된 상태로 남을 수 있다 — 이 CT 스냅샷 고정 자체는 성별 기능과 무관한 기존 아키텍처 특성이라 이번 범위에서 바꾸지 않았다.

## 2026-08-19 후속: 공정 버전 재확정(`process-version-boundaries`)이 놓친 4번째 gender-aware 지점 + 버전 경계 규칙 완화

- 위 항목에서 "AssignmentPlan의 영구 저장값을 만드는 지점 전부"라고 적었던 목록이 실제로는 하나 빠져 있었다: `PUT /styles/:styleId/process-version-boundaries`(공정 버전 관리 화면에서 특정 버전을 특정 배정부터 적용하도록 재확정하는 엔드포인트)도 `buildEditableAssignmentCtSnapshotFromLiveStyle` 호출과 `assignmentStSnapshot`/`assignmentStTotalSeconds`를 직접 재계산하는 별도 인라인 로직을 갖고 있었는데, 여기엔 `genderQuantities`가 전혀 전달되지 않고 있었다. 그 결과 이미 배정을 마친 뒤(성별 구분 이전) 새 버전(성별 전용 공정 포함)을 그 배정에 적용하면, `applicableQuantity`가 여전히 전체 배정수량(예: 510)으로 저장되어 남성 전용 공정이 실제 목표(225)를 다 채워도 진행률이 낮게 계산되는 문제가 있었다. `syncAssignmentPlansForOrderLock`/`createPlanRows`/`prepareAssignmentBoardStTotalsForSave`와 동일한 패턴(스타일당이 아니라 플랜당 — 같은 스타일이라도 플랜마다 다른 주문의 성별 비율일 수 있으므로 `workOrderId`별로 조회)으로 이 엔드포인트도 gender-aware하게 고쳤다.
- **이미 이 버그를 겪은 기존 배정의 데이터는 코드 배포만으로 자동 복구되지 않는다.** 이 엔드포인트는 `plan.styleProcessVersionId === version.id && ...` 조건이 이미 참이면(버전이 이미 그 배정에 적용된 상태로 보이면) 재계산을 건너뛴다(성능 최적화). 그래서 이미 잘못된 `applicableQuantity`로 저장된 배정은, 공정 버전 관리 화면에서 그 버전을 다른 배정으로 옮겼다가 다시 원래 배정으로 되돌리는 식으로 "실제 버전 전환"을 한 번 더 발생시켜야 고쳐진 로직이 실행된다.
- **버전 경계 규칙도 완화했다.** 기존에는 "Ver.1은 반드시 가장 오래된 배정부터 적용되어야 한다"를 하드코딩으로 강제했는데, 이 때문에 나중에 만든 버전(성별 전용 공정 등 실질적으로 더 정확한 정의를 담은 버전)을 가장 오래된 배정까지 소급 적용하는 것 자체가 불가능했다(Ver.1을 항상 포함해야 하고 Ver.1은 반드시 index 0이어야 하므로, 다른 버전이 index 0을 가질 수 없었다). 이제는 "Ver.1이어야 한다"가 아니라 "적용 구간 중 가장 이른 것이 가장 오래된 배정이어야 한다"로 일반화했다 — 어떤 버전이든 상관없이 가장 이른 구간이 index 0을 커버하기만 하면 된다. 프론트(`ProcessVersionManager.jsx`)도 이제 나중 버전을 가장 오래된 배정에 드롭하면 그 자리를 차지하던 이전 버전의 구간 지정을 자동으로 해제한다(막지 않는다). 단, 이 자동 해제로 인해 가장 오래된 배정이 아무 버전도 안 덮게 되는 경우(해제된 버전이 유일하게 index 0을 커버하고 있었는데 드롭된 버전은 index 0이 아닌 경우)는 여전히 막고 안내 메시지를 띄운다.

## 2026-08-19 후속2: 배정 상세의 "수량 확인"/`REVIEW_REQUIRED` 공정별 표에도 gender-aware 목표 수량 반영

- 위 두 항목이 고친 `applicableQuantity`는 배정의 진행률·완료 판정 계산에는 반영됐지만, 사람이 직접 보는 두 화면(배정 상세 드로어의 `REVIEW_REQUIRED` 경고 표, 우클릭 "수량 확인" drawer의 `QuantityReviewProcessTable`)은 여전히 모든 공정의 "차이"를 배정 전체의 블렌디드 수량(예: 510) 하나에 대해서만 계산하고 있었다 — 성별 전용 공정의 실제 목표(예: 남성 전용 225, 여성 전용 285)가 화면에 전혀 노출되지 않았다.
- 백엔드 `buildAssignmentPlanProgressRows`의 `reviewProcessTotals`(그리고 이걸 담는 `reviewReason.processTotals`/`quantityReview.processTotals`)를 공정별로 `genderScope`와 `applicableQuantity`를 포함하도록 확장했다. `quantity` 필드는 내부 진행률 계산에 쓰는 정규화된(블렌디드 환산) 값이 아니라, 사람이 검토할 수 있도록 **그 공정에 실제 기록된 raw 수량**(`stats.processTotalsByKey`에서 직접 계산)으로 바꿨다 — 정규화된 값을 보여주면 "225 목표에 510 기록됨(성별 구분 이전 과거 기록)" 같은 실제 상황이 감춰진다.
- 프론트 두 표(`AssignBoard.jsx`의 인라인 `REVIEW_REQUIRED` 표, `QuantityReviewProcessTable`) 모두 "목표 수량" 열을 새로 추가해 공정별 `applicableQuantity`(없으면 기존처럼 배정 전체 수량)를 보여주고, "차이"는 그 공정 자신의 목표 대비로 계산한다.
- 이 표는 의도적으로 "성별 구분 이전에 기록된 과거 작업기록"을 자동으로 고치거나 숨기지 않는다 — 예를 들어 남성 전용 공정이 과거에 (성별 구분 없이) 510개로 기록됐다면, 목표 225 대비 +285 초과로 정확히 드러난다. 이 초과분이 실제로 문제인지(과거 데이터가 원래 남녀 구분 없이 기록됐던 것인지)는 업무적으로 사람이 판단할 문제이며, 시스템이 임의로 재배분하거나 숨기지 않는다(정확 계산 원칙).
- **주의**: 이 원칙을 세울 때 예로 든 "TS10이 510개로 기록되어 있다"는 실제로는 잘못된 관찰이었다(§ 아래 후속3에서 확인) — raw 수량 표로 고치기 전 화면에 보이던 "510"은 이미 성별 정규화(블렌디드 환산)를 거친 값이었는데 이를 raw 기록으로 착각한 것이었다. 실제 운영 DB를 직접 조회해 검증한 결과 TS10은 정확히 225건(목표와 일치)만 기록되어 있었다. 성별 관련 수치를 사용자에게 설명할 때는 화면에 보이는 숫자를 근거로 추측하지 말고, 의심스러우면 운영 DB에서 `WorkRecord`를 직접 조회해 확인한다.

## 2026-08-19 후속3: `operationalProgressRatio`(진행률 %)의 분모도 gender-aware하게 반영

- 후속2까지 고친 `producedQuantity`/`resolveProducedQtyFromProcessKeyTotals` 계열은 "완제품 수량"(공정별 최소값) 계산에는 적용됐지만, **화면에 보이는 진행률 퍼센트 자체**(`operationalProgressRatio` → `progressPercent`)는 별도의 분모 `totalExpected = plannedQuantity(블렌디드) × processCount`를 그대로 쓰고 있었다. 성별 전용 공정이 있으면 이 분모가 항상 과대평가된다 — 예: 67개 공정 중 5개가 성별 전용(225~285)인데 분모는 67개 전부 510으로 계산하므로, 모든 공정이 각자의 정확한 목표치에 도달해도(짜투리 0) `totalDone`(실제 합)이 `totalExpected`(부풀려진 합)에 못 미쳐 진행률이 100%에 도달하지 못하고 90%대에 멈춘다. 실제로 AM02062/L15-1에서 공정별 수량 확인 표는 전부 차이 0으로 정확히 일치하는데도 진행률 카드에는 94%로 표시되는 것으로 재현·확인했다.
- `resolveTotalExpectedQuantityForRequiredProcesses` 헬퍼를 새로 만들어 `totalExpected = Σ(각 필수 공정의 applicableQuantity)`로 계산하도록 고쳤다(성별 전용 공정은 자기 목표치만, UNISEX는 기존처럼 전체 수량). 성별 구분 데이터가 없는 스타일(대부분의 기존 데이터)은 기존 `plannedQuantity × processCount` 공식으로 그대로 폴백한다 — 수학적으로 동일한 결과. `buildLineMonthCapacityRows`와 `buildAssignmentPlanProgressRows` 양쪽의 `totalExpected` 계산에 모두 적용했다.

## 2026-08-19 공정 성별 적용 대상 (genderScope)

- 공정은 남성 전용/여성 전용/공용 세 가지 적용 대상 중 하나를 가진다. `StyleProcess.genderScope`(`ProcessGenderScope` enum: `UNISEX`/`MALE_ONLY`/`FEMALE_ONLY`, 기본값 `UNISEX`)가 소스오브트루스다. 기존 공정 1,276건은 전부 `UNISEX`로 백필됐다.
- 공정 정보 등록/수정 화면(`StyleProcess.jsx`)은 "작업 종류" 선택 옆에 "남성"/"여성" 체크박스 두 개를 둔다. 둘 다 체크 = 공용, 하나만 체크 = 그 성별 전용이며, 마지막 남은 체크는 해제할 수 없게 막아 항상 최소 하나는 선택된 상태를 유지한다(공용이 기본값). 공정 목록에도 별도 "적용 대상" 열로 항상 표시한다.
- 이번 구현은 등록/저장/조회(메타데이터)까지만이다. 배정(`AssignmentPlan`)은 "주문 × 스타일" 단위로 색상·사이즈·성별을 구분하지 않는다는 기존 원칙(`WorkRecord`/배정 실제 생산 계산은 성별을 구분하지 않는다, 이 문서의 "정확 계산 원칙" 참고)은 이번에 바꾸지 않았다 — ST/CT 총합·진행률·AT 학습 계산에 `genderScope`를 아직 반영하지 않는다. 특정 성별 전용 공정이 있는 스타일의 배정 총 ST/CT를 주문의 성별별 실제 수량과 교차해 계산하는 기능은 향후 별도로 설계·확정한 뒤 구현한다(예: `WorkOrderItem.gender`(M/W/U)와 연결).
- `syncStyleProcessStorageForStyle`(공정 목록 저장), `buildStyleProcessMirrorFromRows`(응답 mirror)가 `genderScope`를 읽고 쓴다. `genderScope` 변경은 작업기록 연결 여부와 무관하게 항상 허용한다(작업 종류(`productionStage`)와 달리 과거 계산 근거를 바꾸지 않는 순수 표시/분류 메타데이터이기 때문).

## 2026-08-19 StyleProcess 비활성화(삭제 대체) 정책

- 작업기록(`WorkRecord`/`OutsourcedWorkRecord`)이 하나라도 연결된 `StyleProcess`는 앱에서도 DB에서도 진짜로 삭제할 수 없다. `WorkRecord.styleProcessId`는 `onDelete: Restrict` FK라 삭제 자체가 DB에서 거부되며, 강제로 허용하면 과거 작업기록·AT 학습·급여 근거가 고아 데이터가 된다. 더 이상 쓰지 않는 공정은 삭제 대신 `StyleProcess.isActive=false`로 비활성화한다.
- 스타일 공정 목록 저장(`syncStyleProcessStorageForStyle`)에서 화면 draft에 없어진 기존 공정을 처리할 때: 그 공정에 연결된 작업기록이 0건이면 기존처럼 진짜로 삭제하고, 1건이라도 있으면 `isActive=false`로만 바꾼다(더 이상 409로 저장 자체를 막지 않는다). draft에 다시 포함되면(같은 `processCode`로 재등록 포함) 저장 시 `isActive=true`로 복원된다.
- `isActive=false`가 되어도 그 행 자체와 연결된 `StyleProcessStandard`/`StyleProcessAtObservation`/`AtTrainingBucketProcess`/`WorkRecord`/`OutsourcedWorkRecord`는 전혀 건드리지 않는다. 이미 확정된 배정의 `assignmentCtSnapshot`/`assignmentStSnapshot`도 저장 시점에 동결된 값이라 영향받지 않는다.
- 비활성 공정은 다음에서 제외한다: (1) 스타일 상세의 편집 가능한 공정 목록(`loadStyleProcessRowsByStyleId`가 반환하는 "live" 미러 — `ensureStyleProcessStorageForStyles`/`GET /styles/:styleId`가 이를 사용), (2) AT (재)학습 후보 선정(`loadAtTrainingDataFromBuckets`) — 새 작업기록이 더 들어올 수 없는 공정을 계속 재학습하지 않되 마지막 유효 `atParams`와 과거 `AtTrainingBucket`/관측 데이터는 그대로 보존, (3) Excel 작업기록 업로드에서 `(styleId, processCode)`로 신규 행의 `styleProcessId`를 역추론하는 백필 조회 — 비활성 공정 코드로는 새 작업기록이 매칭되지 않고 명시적 오류로 드러난다(정확 계산 원칙에 따른 fail-closed).
- ProcessMasterOption 이름 동기화, `processComposition` 참조 스캔, 이미 알려진 `styleProcessId`(작업기록·AT 관측·배정 스냅샷에서 확정된 값)로 개별 공정을 조회하는 경로들은 `isActive` 필터를 적용하지 않는다 — 과거 기록이 항상 정확히 표시되고 계산돼야 하기 때문이다.
- 프론트(`StyleProcess.jsx`)는 작업기록이 있는 공정도 더 이상 삭제 버튼을 막지 않는다. 삭제를 누르면(저장 전 draft 단계) 실제로는 비활성화됨을 설명하는 확인창을 띄운다. 비활성 공정을 다시 보거나 복원하는 전용 UI(예: "비활성 공정 포함" 토글)는 아직 없다 — 지금은 같은 공정코드로 다시 추가한 뒤 저장하면 복원되는 방식만 지원한다.


## 2026-08-18 작업 기록과 외주 내역 메뉴·테이블 분리

- 직원 작업기록과 외주 생산기록은 별도 메뉴와 별도 테이블로 완전히 분리한다. "작업 기록"(`/work-history`) 메뉴는 직원 전용이며 외주 입력 경로가 없다. "외주 내역"(`/outsourcing-record`) 메뉴는 신규이며 외주만 입력한다. 두 메뉴 모두 같은 `WorkDetail.jsx`/`WorkList.jsx`/`WorkEntry.jsx` 컴포넌트를 `recordKind`(`'EMPLOYEE'` | `'OUTSOURCING'`) prop으로 재사용하며, 화면 구성(기간 입력, 라인 선택, 공정/수량 입력)은 동일하다.
- DB는 `WorkRecord`(직원 전용: `workerId`, `ctSeconds` 등, 성과급=CT×생산량)와 `OutsourcedWorkRecord`(외주 전용: `outsourcingPartnerId`(필수 FK)·`outsourceVendorName`·`outsourceUnitPrice`, 정산=단가×생산량) 두 테이블로 완전히 나뉜다. `WorkRecord`에는 더 이상 `isOutsourced`/`outsourceVendorName`/`outsourceUnitPrice`/`outsourcingPartnerId` 컬럼이 없다. 공유 헤더 `WorkLog`는 그대로 두되 `WorkLog.recordKind` enum으로 어느 자식 테이블에 행이 있는지 표시하며, 한 WorkLog의 자식 행은 항상 한쪽 테이블에만 존재한다.
- 거래처 타입은 수가 적고 타입별 업무 동작이 고정되어 있으므로 별도 시스템 관리 마스터 테이블을 만들지 않고 `OrganizationType`의 거래처 값(`PROCESS_OUTSOURCING`(제작 외주), `MATERIAL_SUPPLIER`(구매처))을 소스오브트루스로 사용한다(2026-08-20부터 — 이전엔 별도 `BusinessPartnerType` enum이었으나 `BusinessPartner`가 `Organization`에 흡수되며 함께 이전됨, 위 §"2026-08-20 BusinessPartner를 Organization에 흡수" 참고). 표시명은 한국어·영어·베트남어 UI 번역으로 관리한다.
- 외주 작업은 `OutsourcedWorkRecord.outsourcingPartnerId`로 거래처에 필수 연결하면서(과거처럼 거래처 FK 없이 자유 텍스트 업체명만으로 저장하는 경로는 없다) 업체명과 개당 단가는 작업 당시 스냅샷을 보존한다. 거래처 화면은 이 외주 작업 이력을 `GET /business-partners/:id/history`로 보여주며, 이 API는 `OutsourcedWorkRecord`를 조회한다. 향후 구매 기능은 구매 원장과 거래처 FK로 연결해 같은 거래 내역 화면에 유형별 섹션으로 확장한다.
- 작업기록에서 외주 업체를 새로 등록할 때 브라우저 `prompt`/`alert` 입력을 사용하지 않고 거래처 메뉴와 동일한 거래처 등록 다이얼로그를 재사용한다.
- 배정 진행률·완료 판정(`buildAssignmentPlanProgressRows`, `buildLineMonthCapacityRows` 등)은 반드시 `WorkRecord`와 `OutsourcedWorkRecord` 두 테이블의 수량을 `assignmentPlanId`×`styleProcessId` 기준으로 합산한다. 이 합산은 `loadAssignmentPlanProgressWorkRows`(`backend/src/index.ts`) 한 곳에서 이루어지며, 이 함수가 반환하는 배열에는 `isOutsourced`/`outsourceVendorName`이 채워진 정규화된 행만 담긴다 — 다른 배정 관련 계산은 이 함수를 거치거나 동일한 합산 패턴을 따라야 하며 `WorkRecord` 한 테이블만 조회하면 안 된다.
- 생산수당·AT 학습은 `WorkRecord` 테이블만 사용하며 별도 `isOutsourced` 필터가 필요 없다 — 외주는 애초에 그 테이블에 존재하지 않으므로 구조적으로 제외된다.

### 2026-08-19 후속: 이관된 외주 행이 "외주 내역" 목록에서 안 보이던 문제

- `backend/scripts/migrate-outsourced-work-records.js`(과거 `isOutsourced=true` `WorkRecord`를 `OutsourcedWorkRecord`로 옮기는 1회성 스크립트)가 처음 배포 때 실행된 뒤, 옮겨진 행이 거래처 상세(`GET /business-partners/:id/history`, `OutsourcedWorkRecord`를 직접 조회)에는 정상적으로 보이는데 "외주 내역" 목록 화면(`WorkList.jsx` recordKind=OUTSOURCING, `WorkLog.recordKind=OUTSOURCING`으로 필터링)에는 안 보이는 문제가 있었다.
- 원인: 스크립트가 `OutsourcedWorkRecord` 행을 만들 때 `workLogId`를 원본 `WorkRecord.workLogId` 그대로 복사했다. 외주 분리 이전에는 한 `WorkLog`(월간 배치 헤더) 안에 직원 작업기록과 `isOutsourced=true` 행이 섞여 있을 수 있었는데, 이런 "혼합 WorkLog"는 이관 후에도 여전히 `recordKind='EMPLOYEE'`로 남아 있었다(실제 직원 `WorkRecord`가 그대로 있으니 맞는 상태). 그 결과 `EMPLOYEE`인 WorkLog에 `OutsourcedWorkRecord` 자식이 붙어있는 상태가 되어, "한 WorkLog의 자식 행은 항상 한쪽 테이블에만 존재한다"는 불변식이 깨졌고 `recordKind` 필터링 목록에서 빠졌다.
- 2026-08-19 운영 DB에서 실제로 WorkLog#21(2026-04, 직원 348건 포함 혼합 배치)에 이관된 외주 4건이 이 상태였다. 전용 `recordKind='OUTSOURCING'` WorkLog(#35)를 새로 만들어 이 4건의 `workLogId`만 옮기고, WorkLog#21의 직원 348건은 그대로 두는 방식으로 직접 수정했다.
- `migrate-outsourced-work-records.js`를 이 상황을 자동으로 처리하도록 고쳤다: 이관 대상 행의 원본 `workLogId`마다 그 WorkLog에 (이관 대상이 아닌) 진짜 직원 `WorkRecord`가 남아있는지 확인해서, 없으면 원본 WorkLog를 `OUTSOURCING`으로 그 자리에서 전환하고, 남아있으면(혼합 배치) 같은 기간·공장 정보로 전용 `OUTSOURCING` WorkLog를 새로 만들어 이관 행만 그쪽으로 옮긴다. 이 스크립트를 다른 조직/환경에서 다시 실행해도 같은 문제가 재발하지 않는다.

## 2026-08-14 보고서·배정 예측 계산 분리

- 고객 보고서의 예상 완료일과 배정 화면의 계획 시간·라인 부하는 서로 다른 업무 계산이다. 보고서는 주문×스타일별 실제 최초 작업일과 해당 배정의 저장된 계획 기간을 사용하고, 배정은 공정별 잔여 수량×저장 ST와 라인 소속 인원의 근무 가능시간, 일요일·조직 휴일, 배정 순서를 사용한다.
- 보고서 구현을 위해 `buildAssignmentPlanProgressRows`의 배정 계획 기간이나 배정 reflow 계산식을 변경하지 않는다. 보고서에 필요한 기간은 `/customer-production-reports` 내부에서 `AssignmentPlan.startIndex/endIndex`로 별도 계산한다.
- 배정의 남은 부하는 `Σ max(0, 배정수량 - 공정별 작업기록수량) × assignmentStSnapshot.processes[].stSeconds`가 우선 근거다. 공정 하나의 최소 완성수량으로 전체 ST를 다시 넣거나 보고서용 완료일 공식을 사용하지 않는다.

## 2026-08-14 외주 작업기록 스키마 오류 처리 원칙 (여전히 유효)

- 외주 컬럼·인덱스·FK 제약은 Prisma migration만이 아니라 Railway 운영 스키마의 소스오브트루스인 `backend/migration_fix.sql`에도 멱등하게 포함한다. 새 필수 컬럼·제약을 추가할 때는 시작 시 runtime schema drift 검사 목록도 함께 갱신한다. `OutsourcedWorkRecord` 분리(2026-08-18) 이후에도 이 원칙은 그대로 적용된다 — 새 테이블의 필수 컬럼도 `STARTUP_REQUIRED_RUNTIME_COLUMNS`에, 삭제된 `WorkRecord` 외주 컬럼은 `STARTUP_FORBIDDEN_RUNTIME_COLUMNS`에 등록되어 있다.
- 운영 DB 스키마가 코드보다 뒤처졌을 때 구 컬럼 projection이나 레거시 쿼리로 우회하지 않는다. 누락을 명확한 스키마 오류로 드러내고 정식 migration 경로로 고친다. 특히 P2022를 잡아 필드를 빼고 재조회하는 fallback은 금지한다.
- `WorkRecord`의 레거시 외주 컬럼(`isOutsourced`/`outsourceVendorName`/`outsourceUnitPrice`/`outsourcingPartnerId`)을 실제로 DROP하기 전에는 `backend/scripts/migrate-outsourced-work-records.js --apply`로 기존 외주 행을 `OutsourcedWorkRecord`로 먼저 이관해야 한다. `migration_fix.sql`의 컬럼 DROP 블록은 이관되지 않은 행이 남아있으면 스스로 건너뛰므로, 이관 스크립트를 먼저 실행하지 않으면 컬럼이 계속 남아있는 것으로 드러난다(조용히 실패하지 않음).

## 2026-08-14 배정 완료 상태 단순화

- `READY_TO_COMPLETE`는 더 이상 사용하지 않는 레거시 상태다. 신규 저장·응답·화면 그룹에서 생성하거나 해석하지 않는다.
- 현재 상태는 `IN_PROGRESS`, `REVIEW_REQUIRED`, `PRODUCTION_COMPLETED`이며 최종 완료의 소스오브트루스는 `AssignmentPlan.isCompleted=true`다. 과거 `READY_TO_COMPLETE` 행은 migration에서 `PRODUCTION_COMPLETED`와 완료 플래그로 정규화한다.
- 수량 불일치로 `REVIEW_REQUIRED`인 카드는 수량 확인 drawer에서 공정별 수량과 원천 작업기록을 검토한 뒤 완료 조정을 수행한다. 별도의 중간 “작업 완료” 그룹을 다시 만들지 않는다.

## 2026-08-08 고객 판매단가 진입 경로

- 좌측 영업 관리 메뉴에는 독립 `단가` 항목을 표시하지 않는다. 고객별 판매단가는 고객 메뉴의 기존 단가 동작을 통해 `/customer-pricing?customerId=...`로 진입한다.
- `/customer-pricing` 라우트와 기능, 고객별 단가 탭은 유지하며 직접 메뉴 항목만 제거한다.

## 2026-08-08 단가 화면 스크롤

- 단가 관리의 매출 단가 버킷·단가 입력 표는 내부 세로 스크롤 영역을 만들지 않고 페이지 전체 세로 스크롤을 사용한다. 수량 버킷 열이 화면 너비를 넘을 때 필요한 표의 가로 스크롤은 유지한다.

## 2026-08-08 직원·라인 메뉴 기본 권한

- 제조사 `OPERATOR`와 `ACCOUNTANT`는 모두 `EMPLOYEE`와 `LINE` 메뉴에 접근한다. 관리자는 기존처럼 전체 접근한다.
- 신규 활성 봉제 직원 저장 후 라인 배정 확인과 동일 공장 라인 화면 이동이 역할 때문에 끊기지 않아야 한다.
- 권한 정책 schema v5는 과거 정책의 제조사 운영자에게 `EMPLOYEE`, 회계사에게 `LINE`을 보완한다.

## 2026-08-07 연계 데이터 변경과 열린 탭 갱신 원칙

- 한 메뉴의 저장이 다른 메뉴의 조회 결과나 후속 업무를 바꾸면 저장 주체는 조직 범위와 변경 주제, 가능한 경우 변경된 관계 ID를 공통 워크스페이스 데이터 변경 이벤트로 발행한다. 연계 화면은 화면별 임의 이벤트를 새로 만들지 않고 이 공통 이벤트를 구독한다.
- 연계 화면 탭이 활성 상태이고 저장 중인 로컬 변경이 없으면 즉시 다시 조회한다. 비활성 열린 탭이거나 저장 전 변경 때문에 자동 갱신할 수 없으면 데이터를 덮어쓰지 않고 탭에 변경 표시를 남기며, 사용자가 그 탭을 열고 안전하게 다시 조회한 뒤 표시를 해제한다.
- 직원의 현장 직무가 `봉제(WORKER_SEWING)`이고 공장에 재직 중이면 라인 소속 관리 대상이다. 신규 저장 또는 비봉제에서 봉제로 직무 변경 후 현재 라인이 없으면 직원 저장은 허용하되 `라인 배정 필요` 후속 업무로 드러내고 라인 메뉴에서 바로 배정할 수 있어야 한다. 다림질·검수·포장 직원은 라인 미배정 경고와 건수에서 제외한다.
- 현재 구현된 공통 변경 주제는 `STYLES`, `ORDERS`, `ASSIGNMENT_BOARD`, `EMPLOYEES`다. `useWorkspaceRefreshOnEvent`와 `AppContext.hasExternalChanges`로 활성 탭 자동 갱신 및 비활성 탭 변경점 표시의 공통 기반이 구현되어 있다. 스타일 목록·주문 목록/상세·배정·생산계획·QC·대시보드 일부와 직원 변경에 대한 라인 화면이 이를 사용한다.
- 신규 활성 봉제 직원을 저장하면 직원 화면에서 라인 배정 여부를 바로 묻고, 사용자가 동의하면 공통 워크스페이스 이동으로 `/line` 탭을 열거나 기존 탭으로 이동한다. 저장 직후 `EMPLOYEES`와 호환용 `baro:org-memberships-updated`를 함께 발행하여 열린 라인 탭의 갱신/변경 표시와 좌측 라인 미배정 건수를 갱신한다. 다림질·검수·포장 및 퇴사 상태 직원에게는 이 후속 안내를 띄우지 않는다.
- 라인 저장은 현재 `baro:line-assignments-updated`라는 같은 브라우저 창 전용 이벤트로 좌측 봉제 라인 미배정 건수만 갱신한다. 배정·작업기록·생산수당 등 연계 탭의 자동 갱신 또는 탭 변경 표시는 아직 공통 체계에 연결되지 않았다.
- 현재 공통 이벤트도 `window.dispatchEvent` 기반이라 동일한 BARO 워크스페이스 창 안에서만 전달된다. 별도 브라우저 탭·창 사이 전파는 구현되지 않았으므로, 이를 지원하기 전에는 구현 완료로 간주하지 않는다. 향후 `BroadcastChannel` 또는 동등한 교차 문서 전달 수단을 조직 범위로 적용하되 저장 전 로컬 입력을 자동으로 덮어쓰지 않는다.
- 연계 현황과 미구현 목록은 `todo.md`의 `연계 페이지·열린 탭 갱신 지도`에서 체크 상태로 관리한다. 신규 메뉴나 저장 기능을 만들 때는 데이터 저장 자체뿐 아니라 발행 주제, 구독 화면, 활성/비활성/수정 중 탭 동작을 같은 기능 범위에서 갱신한다.

## 2026-08-07 작업 종류별 라인 소속 기준

- `봉제(SEWING)` 작업자만 생산 라인 소속으로 관리한다. 봉제 작업기록·배정·생산능력과 AT 노동시간 풀은 해당 작업일/기간의 라인 소속 이력을 기준으로 연결한다.
- `다림질(IRONING)`, `검수(INSPECTION)`, `포장(PACKING)` 작업자는 공장 소속이지만 생산 라인에는 소속되지 않는다. 이 작업 종류의 기록과 AT를 봉제 라인 또는 라인 소속 이력에 억지로 연결하거나, 라인 미소속을 오류로 처리하지 않는다.
- 비봉제 작업의 배정·작업기록·AT·생산능력 조회 범위는 `Factory × ProductionStage`를 기본 풀로 삼고, 향후 실제 작업조/설비 단위가 필요할 때 별도 `CapacityGroup`을 도입한다. 봉제 라인의 인원·근로시간 총량에 비봉제 작업자를 포함하지 않는다.

## 2026-08-07 저장 전 워크스페이스 탭 이동

- 저장하지 않은 입력이 있어도 현재 탭을 보존한 채 다른 열린 탭으로 이동하거나 새 메뉴 탭을 여는 동작은 확인창 없이 허용한다. keep-alive된 기존 탭으로 돌아오면 입력 상태가 유지되어야 한다.
- 저장 전 확인은 작성 중인 탭을 닫거나, 동일 종류의 단일 상세 탭 정책으로 현재 상세를 다른 상세로 교체하거나, 로그아웃·조직 전환·브라우저 이탈처럼 현재 입력 상태가 실제로 제거되는 경우에만 한다.

## 2026-08-07 배정 화면 세로 스크롤 소유권

- 데스크톱 배정 화면은 앱 본문의 실제 남은 높이를 flex로 사용하며 `100vh` 기반 고정 높이 계산을 사용하지 않는다. 앱 헤더·탭·페이지 헤더·패딩을 중복 계산해 전체 페이지 스크롤을 만들면 안 된다.
- 라인 영역과 미배정 카드 영역은 같은 가용 높이 안에 머물고, 각 영역의 내용이 실제로 넘칠 때만 해당 영역이 독립적으로 세로 스크롤된다. 미배정 카드가 많다는 이유로 라인 영역과 페이지 전체까지 함께 스크롤되지 않는다.

## 2026-08-07 워크스페이스 홈과 열린 탭

- `/workspace`는 라우트 본문 컴포넌트가 없는 중립 홈 화면이다. 다른 업무 탭이 열려 있어도 URL이 `/workspace`이면 빈 본문을 렌더링하지 않고 LINEOS 홈 안내를 표시하며, 열린 탭은 보존해 다시 선택할 수 있어야 한다.
- 상단 조직명/브랜드 로고의 홈 이동도 직접 `navigate`로 탭 상태와 URL을 분리하지 않고 공통 워크스페이스 이동 함수를 사용한다.

## 2026-08-07 ST 라벨의 AT 대비 차이율

- 스타일 목록과 공정 상세의 ST 옆 차이율 라벨은 `ST가 AT보다 얼마나 큰지/작은지`를 뜻하며 계산식은 `(ST - AT) / AT × 100`이다. 양수는 ST가 AT보다 큼, 음수는 ST가 AT보다 작음을 의미한다. 예를 들어 ST 833초, AT 765초는 `+8.9%`다.
- AT 옆 백분율 라벨은 AT 신뢰도이며 ST 차이율과 별개의 지표다.

## 2026-08-07 AT ST 임시 대체 승인 단순화

- AT 관측이 없는 공정에 ST를 임시 표시값으로 허용하는 기능은 승인 여부만 관리하며 승인 발생 배정·승인 시각의 히스토리는 업무상 관리하지 않는다. 운영 판단의 소스오브트루스는 `StyleProcess.atStFallbackApproved` 하나로 단순화한다.
- 기존 `atStFallbackSourceAssignmentPlanId`, `atStFallbackApprovedAt`은 현재 스키마·호환성 때문에 즉시 삭제하지 않지만 신규 업무 로직과 화면에서 필수값 또는 이력 근거로 사용하지 않는다. 향후 관계·API 사용처를 정리한 뒤 별도 스키마 정리에서 제거한다.

## 2026-08-07 StyleProcess 감사 필드 운영 확인

- 운영 DB의 `StyleProcess`는 총 1,255건이며 조직 1은 726건, 조직 2는 529건이다. Railway Data 화면에서 몇 행만 보이는 것은 테이블 전체가 적은 것이 아니라 현재 페이지/표시 구간만 보이는 것이다.
- 조직 2의 과거 `StyleProcess` 529건은 모두 `createdByEmployeeId`와 `updatedByEmployeeId`가 NULL이고 기존 문자열 `createdBy`는 보존되어 있다. 예를 들어 id 414는 2026-05-07 생성 당시 `createdBy=caohang9603@gmail.com`이며, 직원 FK 감사 필드가 적용되기 전 과거 일괄 복제·동기화 계열이다. 이를 현재 직원으로 추정 백필하지 않는다.
- `processComposition`, `processDescription`, `atParams`, `atStFallbackSourceAssignmentPlanId`, `atStFallbackApprovedAt`은 조건부/선택 필드이므로 NULL 자체는 오류가 아니다. 특히 `atStFallbackApproved=false`이면 fallback 출처·승인시각 NULL이 정상이고, 유효 AT 관측이 없는 공정은 `atParams`가 NULL일 수 있다.

## 2026-08-07 작업 종류별 AT 검증 미완료 사항

- 작업 종류별 AT의 관계형 구조와 `v4-stage-aware` 저장 경로는 존재하지만, 원천 작업기록을 학습 draft로 만드는 `buildAtTrainingBucketDraftsFromRawSource`에서 조회한 `StyleProcess.productionStage`를 `preliminaryRows` 반환 객체에 전달하지 않는 누락이 확인됐다. 현재 정규화 fallback은 누락값을 `SEWING`으로 처리하므로 비봉제 작업기록을 투입하기 전에 이 전달 누락을 수정하고 혼합 종류 제외 및 종류별 노동시간 분리 회귀 테스트를 추가해야 한다.
- 2026-08-07 운영 DB에는 `StyleProcess` 1,255건, `AtTrainingBucket` 35건, `v4-stage-aware` 관측 1,174건이 모두 `SEWING`이며 비봉제 공정·작업기록·AT 관측이 0건이다. 따라서 운영 데이터만으로 다림질·검품·포장 분리를 실증할 수 없다. 비봉제 공정을 등록한 격리 검증 데이터로 `AtTrainingBucket.productionStage`, `StyleProcessAtObservation.productionStage`, 혼합 작업자 제외 진단을 확인해야 한다.
- 현재 `npm run test:at-training`은 18개 중 7개가 실패하며 작업 종류 분리를 직접 검증하는 테스트가 없다. 작업 종류별 AT 완료 판정은 해당 테스트를 보정·추가해 전부 통과하고, 관측의 단계와 연결 공정의 단계 불일치가 0건임을 확인한 뒤에만 할 수 있다.

## 2026-08-07 작업기록 공정 표시 불변식

- `WorkRecord.styleProcessId`가 작업기록 공정의 소스오브트루스다. 작업기록 상세 응답은 이 FK로 `StyleProcess`를 조인해 공정 코드와 공정명을 제공한다.
- `style-process:<id>` 같은 내부 관계 키는 매칭·진단에만 사용하며 사용자 화면의 공정명 또는 공정코드 대체값으로 노출하지 않는다. 화면에는 관계에서 확인한 공정 코드와 공정명을 표시하고, 관계 표시값을 얻지 못하면 내부 ID 대신 누락 상태를 드러낸다.
- 작업기록 응답 변환 전에 `styleProcess`·`style` 관계 객체를 제거하지 않는다. 관계형 원본 행을 최종 응답 변환기에 한 번만 전달해 표시 필드 유실을 방지한다.

## 2026-08-07 작업기록 엑셀 가져오기 시트 범위

- 작업기록 엑셀 업로드는 사용자가 파일에서 보이도록 둔 시트만 가져오기 대상으로 삼는다. Excel의 숨김(`Hidden`)·매우 숨김(`VeryHidden`) 시트는 과거 월 보관자료나 공정 참고표일 수 있으므로 헤더 검증과 행 수집에서 제외한다.
- 보이는 시트가 여러 개면 각 보이는 시트를 계속 순회해 지원되는 작업기록 헤더의 행을 합친다. 보이는 시트에 작업기록용으로 인식되는 헤더 일부가 있으면서 필수 열이 빠진 경우에는 기존처럼 해당 시트 이름과 누락 열을 명시해 업로드를 중단한다.
- 작업기록 엑셀의 직원 라인은 `DATE(END)` 하루의 소속이 아니라 `DATE(START)~DATE(END)` 작업기간과 겹치는 `LineAssignment` 이력으로 판정한다. 퇴사자의 라인 이력이 월 중간 퇴사일에 끝났더라도 작업기간과 하루 이상 겹치면 그 라인을 사용하며, 같은 작업기간에 서로 다른 라인 이력이 겹치면 임의 선택하지 않고 복수 라인 오류로 드러낸다.
- 작업기록 엑셀 한 행은 `주문번호 1개 × 스타일 1개 × 공정 1개`의 정확한 배정 카드에 연결한다. `L16-3 & 16-4`처럼 주문번호를 한 셀에 합친 행의 수량을 서버가 여러 배정 카드에 임의 배분하지 않고 명시적으로 거부한다. 배정 카드 조회·불일치 오류는 항상 `주문번호 - 스타일번호`를 함께 표시한다.

### 직원용 작업기록 Raw Data 작성 기준

- 보이는 작업기록 시트의 첫 행은 `DATE(START)`, `DATE(END)`, `STAFF`, `CODE`, `ORDER#`, `STYLE`, `PROCESS`, `JOB` 헤더를 사용한다. 호환용 과거 형식 `STYLE, JOB, JOB`도 읽지만 신규 파일은 의미가 분명한 `STYLE, PROCESS, JOB`을 사용한다. `PROCESS`는 공정 코드이고 `JOB`은 생산 수량이다.
- `CODE`는 BARO 직원 사번과 정확히 같아야 하며 선행 0을 보존하기 위해 텍스트로 입력한다. `STAFF`도 해당 사번의 BARO 직원명과 일치시킨다. 퇴사자도 작업기간이 입사일~퇴사일 및 라인 이력과 겹치면 가져올 수 있다.
- `ORDER#`에는 현장 임시명·고객명·통칭이 아니라 BARO 주문 화면의 정식 주문번호를 한 개만 입력한다. 예를 들어 원본의 `URD ORDER 1`은 정식 주문번호 `TKD260503`으로 입력한다.
- `STYLE`에는 해당 주문에 실제 연결된 BARO 스타일 코드 또는 스타일명을 입력한다. 주문과 스타일의 조합이 정확해야 하며, 다른 주문의 스타일을 서로 바꿔 입력하지 않는다. 오류와 검토표시는 항상 `ORDER# - STYLE` 조합으로 확인한다.
- `PROCESS`에는 그 주문·스타일 배정 카드의 저장된 CT 공정 코드를 입력한다. 공정명, 임의 약어 또는 다른 스타일의 공정 코드를 대신 입력하지 않는다. `JOB`은 0보다 큰 정수 수량이며 한 행의 해당 주문·스타일·공정에 실제 귀속되는 수량이다.
- 같은 스타일을 여러 주문에서 합동 생산해도 `L16-3 & L16-4`처럼 한 셀이나 한 행으로 합치지 않는다. 실제 주문별 귀속 수량을 확인해 주문마다 별도 행을 만들고 각 행의 합이 현장 총 작업량과 일치해야 한다. 서버는 총량을 주문량 비율, 잔량 또는 반반으로 임의 배분하지 않는다.
- 같은 `작업기간 × 직원 CODE × ORDER# × STYLE × PROCESS`가 여러 원천행에 있으면 업로드 전에 수량을 합쳐 한 행으로 만든다. 이미 특정 주문에 입력된 수량이 있고 합동 생산 총량을 다시 분리할 때는 기존 특정 주문 수량까지 포함해 주문별 최종 합계가 실제 생산량과 일치하도록 병합하며 중복 행을 남기지 않는다.
- `DATE(START)~DATE(END)`는 한 행이 대표하는 실제 작업 coverage이며 시작일이 종료일보다 늦을 수 없고 한 달을 넘길 수 없다. 월 자료라면 해당 월의 시작일과 종료일을 동일하게 사용하되 직원 입사·퇴사 및 라인 소속 기간과 실제로 겹쳐야 한다.
- 업로드 전에는 필수값 공백, 결합 주문번호, 임시 주문명, 주문-스타일 뒤바뀜, BARO에 없는 공정 코드, 수량 0 이하, 동일 작업 키 중복을 검사한다. 또한 주문이 잠겨 배정 카드가 생성되고 작업자 공장의 라인에 배정되었으며 CT 스냅샷이 저장되어 있어야 한다.
- 2026년 7월 파일에서 확인한 직원 Raw Data 문제는 `L16-3 & 16-4` 결합 주문 28행, `URD ORDER 1` 임시 주문명 15행, `L16-3 - AM02048`/`L16-4 - AJ2074` 주문-스타일 뒤바뀜 3행, 합동 생산 분리 후 기존 특정 주문 행과 겹친 `C05`/`HTA2` 중복 2행이었다. 숨김 과거 시트를 검사한 문제와 월 중간 퇴사자의 라인 이력을 종료일 하루로만 판정한 문제는 앱 결함으로 수정했으며 직원 작성 오류로 분류하지 않는다.

## 공통 페이지 툴바 배치 기준

- 페이지의 두 번째 헤더 행에서는 검색기만 왼쪽 정렬하고, 일반 필터와 날짜 필터는 오른쪽 정렬한다. 오른쪽 그룹에서는 일반 필터를 먼저 두고 날짜 또는 기간 선택기와 `M+`·`M-`를 항상 맨 오른쪽에 둔다. 생성·추가·업로드·저장 같은 작업 버튼은 가능한 한 첫 번째 제목 행 오른쪽에 둔다.

## 2026-08-06 라인 소속 이력과 실제 작업 기록 분리

- 라인 소속 이력의 관리 범위는 직원 입사일과 `Factory.managementStartDate` 중 늦은 날짜부터 시작한다. 공장 관리 시작일 이전의 라인 공백은 보완 대상으로 계산하지 않고, 퇴사일이 관리 시작일보다 이른 직원은 과거 이력 후보에서 제외한다. `managementStartDate`가 비어 있으면 호환 기본값 `2026-04-01`을 사용한다.
- 기존 재직자의 최초 라인 보드 생성 시점이 배정 시작일로 저장된 경우, 라인 이력이 하나뿐인 현재 배정은 `max(입사일, 공장 관리 시작일)`로 소급 보정한다. 이동 이력이 있는 직원은 과거 기간을 임의로 덮어쓰지 않는다.

- `LineAssignment`는 작업기록 입력 자격이 아니라 라인별 상시 인원과 계획 Capacity를 계산하기 위한 기간형 소속 이력이다. 실제 작업자는 같은 공장에 재직 중인 `WORKER`이면 소속 라인이 없거나 다른 라인 소속이어도 작업기록의 실제 라인을 명시해 기록할 수 있다.
- 라인 이력이 전혀 없는 직원의 최초 배정 적용일 기본값은 입사일이며, 과거 또는 현재 라인 이력이 있는 직원의 이동·재배정 기본값은 처리 당일이다. 관리자는 실제 적용일로 수정할 수 있다.
- 다른 라인으로 이동하면 기존 라인 이력은 새 라인 적용일 전날 종료하고 새 이력을 생성한다. 동일 직원의 라인 이력 기간은 겹칠 수 없으며 시작일은 입사일 전, 종료일은 퇴사일 후가 될 수 없다.
- 퇴사일은 라인 이력의 유효 종료 상한이다. 퇴사일 저장 또는 퇴사 상태 전환 시 종료되지 않은 라인 배정을 퇴사일로 닫고, 계획 부하는 `LineAssignment.startAt/endAt`과 직원 입사일·퇴사일의 교집합을 근무일별로 계산한다. 퇴사일 당일은 포함한다.
- `Employee.lineId`는 현재 화면 호환용 값이며 과거 소속과 Capacity 계산의 소스오브트루스는 `LineAssignment` 이력이다. 타 라인 지원 작업은 소속 이력을 변경하지 않는다.
- 사후에 명부를 정리하는 경우를 위해 라인 화면은 기본적으로 퇴사자를 숨기되 `퇴사자 포함`을 켜면 입사일~퇴사일 전체가 라인 이력으로 덮이지 않은 과거 작업자를 별도 후보로 표시한다. 일부 이력이 있으면 가장 이른 미배정 연속 기간을 기본값으로 제안하고, 전체 재직기간이 빈틈없이 채워진 경우에만 후보에서 제외한다. 생성되는 행은 종료된 과거 이력이며 현재 라인 인원에는 포함하지 않는다. 퇴사 상태 전환이 늦었더라도 퇴사일이 지난 `WORKER`는 같은 후보 규칙을 적용한다.

## 2026-08-06 생산 공정 작업 종류 입력 기준

- 스타일 상세의 공정 추가·수정 화면 입력 행은 왼쪽부터 `작업 종류 → 공정코드 → 공정(텍스트)` 순서로 배치하고 `작업 종류`를 필수 선택으로 둔다. 사용자 표시값은 봉제·다림질·검품·포장이고 서버/DB 소스오브트루스는 `ProductionStage`의 `SEWING`, `IRONING`, `INSPECTION`, `PACKING`이다. 공정명 문자열로 작업 종류를 추론하지 않는다.
- 신규 공정의 작업 종류 기본값은 대부분의 입력이 봉제인 현재 운영을 반영해 `봉제(SEWING)`로 한다. 이 기본값은 입력 편의를 위한 초기 선택일 뿐 저장 시에는 명시적인 단계값으로 검증·저장한다.
- 현재 운영 DB에 이미 등록된 모든 `StyleProcess`는 봉제 공정이다. 단계 컬럼 도입 시 기존 행 전부를 `SEWING`으로 명시 백필하고, 과거 공정명으로 다림질·검품·포장을 추정 분류하지 않는다. 백필 후 NULL 또는 비봉제 기존 행이 0건인지 검증한다.
- 스타일 공정 목록은 `작업 종류 → 공정코드 → 공정(텍스트)` 순서의 독립된 열로 표시하고 종류별로 구분해 볼 수 있어야 한다. 작업 종류 라벨을 공정명 셀 안에 섞지 않는다. 기존 스타일을 열면 백필된 기존 공정이 모두 봉제로 표시되어야 하며 기존 PT·ST·CT·AT와 배정 snapshot 값은 작업 종류 백필만으로 변경하지 않는다.

## 2026-08-06 작업 종류별 AT 학습 분리 기준

- AT 회귀 결과는 계속 개별 `StyleProcess` 단위로 계산하되, 출퇴근 노동시간을 공정에 배분하는 입력 풀부터 `ProductionStage`별로 분리한다. 봉제·다림질·검품·포장 기록이 같은 작업자·날짜·WorkLog에 존재해도 하나의 출퇴근 시간 풀에서 서로 시간을 빼앗아 배분받게 하지 않는다.
- 작업 종류별 AT 배분의 최소 키는 `Organization × Worker × WorkDate/coverage period × ProductionStage`이며 실제 작업 자원이 분리되는 단계에서는 `CapacityGroup`까지 포함한다. 최종 관측은 기존 `Organization × StyleProcess × AssignmentPlan` 식별에 단계 및 capacity snapshot을 함께 보존한다.
- 교체 전 AT `v3-st-stable`은 `WorkLog × Worker` 노동시간을 그 안의 모든 공정에 함께 ST 비례 배분하고, 원천 조회와 배분 키에 `productionStage`가 없으며 봉제 직무 직원만 학습 대상으로 허용했다. 이 결함은 단계 인식 모델 `v4-stage-aware`에서 작업 종류별 풀 분리와 혼합 종류 제외로 교체한다.
- 출퇴근 기록만으로 한 작업자의 하루 총 노동시간을 작업 종류별 실제 시간으로 분해할 수는 없다. 종류별 전담 작업자·기간 이력은 해당 stage/capacity 풀에 시간을 귀속하고, 같은 작업자가 같은 기간 여러 작업 종류를 수행하면 단계별 `WorkSession` 직접 측정 또는 명시적인 단계 전환 기록을 우선 사용한다. 근거 없이 출퇴근 시간을 종류별 ST 비율로 다시 추정해 확정 관측으로 만들지 않는다.
- 기존 봉제-only 데이터와 `v3-st-stable` 관측·마지막 유효 파라미터는 보존한다. 신규 유효 관측은 별도 `v4-stage-aware` 버전으로 저장하고 해당 공정에 유효한 v4 결과가 있을 때 갱신한다. 운영 배포 후 봉제-only 표본 허용 오차, 단계 간 노동시간 교차 배분 0건, 다림질 실측 표본 대조를 계속 검증한다.
- AT 학습·생산능력 계산의 노동시간 풀은 작업 종류별로 분리하지만 스타일 공정 목록의 PT·ST·AT 하단 합계는 모든 작업 종류의 공정 시간을 단순 합산한 전체 스타일 시간이다. 예를 들어 봉제 공정 100초와 다림질 공정 10초이면 전체 합계는 110초로 표시한다. 작업 종류별 소계가 추가되더라도 이 전체 합계를 대체하지 않는다.
- 2026-08-06 구현된 `v4-stage-aware`는 `AtTrainingBucket.productionStage`와 `StyleProcessAtObservation.productionStage`를 보존하고, 단일 작업자·WorkLog의 공정이 모두 같은 작업 종류일 때만 그 출퇴근 노동시간을 해당 종류 풀에 배분한다. 동일 작업자·WorkLog에 둘 이상의 작업 종류가 섞였지만 종류별 실측시간이 없으면 `MIXED_PRODUCTION_STAGE_WITHOUT_MEASURED_STAGE_TIME`으로 전부 학습 제외한다. 이 제외 때문에 신규 관측이 없는 공정의 마지막 유효 AT를 삭제하지 않는다.
- 작업기록이 연결된 `StyleProcess.productionStage`는 변경할 수 없다. 과거 기록의 의미를 바꾸지 않고 다른 종류로 전환하려면 새 공정을 추가한다. 향후 `WorkRecord.productionStageSnapshot`을 도입하기 전까지 이 불변식으로 과거 AT 단계의 안정성을 보장한다.
- 작업 종류 도입 이전에 운영 DB에 존재한 공정과 AT 학습 자료는 모두 봉제 자료다. 2026-08-07 운영 검증 기준 `StyleProcess` 1,255건, `AtTrainingBucket` 25건, `StyleProcessAtObservation` v2 919건과 v3 919건을 모두 `SEWING`으로 명시 백필했으며 단계 NULL, 현재 공정과의 단계 불일치, 고아 공정 FK는 각각 0건이다. 이 과거 행을 공정명으로 재분류하거나 신규 비봉제 종류로 추정 변경하지 않는다.
- 기존 `StyleProcess.atParams` 693건은 단계 백필과 v4 도입으로 삭제하거나 일괄 재계산하지 않는다. 유효한 `v4-stage-aware` 관측이 생성된 개별 공정만 새 결과로 갱신하고, 아직 v4 관측이 없는 공정은 마지막 유효 AT를 유지한다.

## 2026-08-02 생산수당 월 마감 준비 기준

- 생산수당 계산식은 출퇴근 시간을 사용하지 않으므로 출퇴근 행 누락은 Ver.1 계산 차단 조건이 아니다. 공장·라인 목록의 출퇴근 건수는 자료 품질 참고 경고로만 표시하고, 작업기록·CT·공장 생산수당 단가가 준비되면 계산을 허용한다.
- 현재 단계의 `생산수당 확정`은 전체 월 급여 확정이 아니다. 생산수당을 계산해 월 결과를 저장할 뿐 작업기록·출퇴근 기록·배정 상태를 잠그거나 생산 완료로 전환하지 않는다. 향후 전체 급여 확정 기능을 구현할 때만 해당 월 원본 기록 잠금 정책을 별도로 적용한다.
- 생산수당 계산 후 같은 월의 작업기록이 추가·수정되어 계산 금액이 달라지면 해당 `정산 월 × Factory × Line` 행에만 `재계산` 버튼을 표시한다. 출퇴근 기록은 생산수당 계산식에 포함되지 않으므로 재계산 사유로 사용하지 않는다. 관리자가 버튼을 누르면 해당 라인의 공정 결과만 교체하고 같은 월의 다른 라인 결과는 보존한다.
- 생산수당 공식 계산은 현재월이 아니라 직전월까지의 종료된 월만 허용한다. 현재월 중간 예상액은 공식 월 계산·확정과 분리된 향후 조회 기능으로 다룬다.
- 월 필터는 계산 결과 행 자체가 아니라 선택 월의 공장·라인별 자료 준비 상태와 계산 결과를 조회하는 조건이다. 목록 기본 단위는 `Factory × Line`이다.
- 계산 버튼은 생산수당 대상 성과급 직원이 있는 모든 활성 라인에서 공장 관리 시작일 이후의 해당 월 근무일 자료가 완성됐을 때만 활성화한다. 근무일은 일요일과 `OrganizationHoliday`를 제외하고, 직원 입사·퇴사·휴직 기간을 반영한다.
- 작업기록 준비 여부는 `WorkRecord.lineId`와 레코드/작업로그의 유효 coverage 기간으로 근무일별 확인하고 중간 누락도 계산을 차단한다. 출퇴근 현황은 해당 공장·성과급 직원·근무일별 `AttendanceEntry` 존재 여부를 계산하되 참고 정보로만 표시한다.
- 메인 목록은 계산본 유무와 무관하게 작업기록이 있는 범위를 `정산 월 × Factory × Line` 행으로 구분한다. 월 필터의 기본값은 선택 없음(전체 월)이며 계산 대상을 제한하지 않고 목록만 필터한다. 상단 계산 버튼은 필터와 무관하게 공장 관리 시작일 이후부터 직전 월까지 준비가 완료된 미계산 월만 오래된 월부터 생성한다. 계산 후 원천 작업기록이나 공장 단가로 해당 라인 결과가 달라졌을 때는 상태 라벨 대신 그 월·라인 전용 `재계산` 버튼을 표시한다. 잠금 해제 상태 자체는 재계산 사유가 아니다. 계산본의 최초 생성·잠금·해제·삭제 단위는 월 전체이고, 잠긴 월은 해제 후에만 삭제한다. 라인 행을 선택하면 해당 월 전체의 공장·라인·직원·공정별 상세를 연다.
- 라인별 목록은 저장자·저장일시를 표시하지 않고 대상 인원, 총 생산수당, 평균 생산수당을 표시한다. 평균 생산수당은 해당 저장 계산본의 라인 생산수당 합계를 그 라인에서 생산수당이 계산된 고유 직원 수로 나누며, 미계산 행이나 대상 직원이 0명이면 계산하지 않는다.

## 2026-08-02 생산수당 계산 범위

- 급여 체계 전체는 회사 정책이 확정될 때까지 구현을 미룬다. 현재 운영 기능은 `급여 계산`이 아니라 `생산수당 계산`이며 성과급 직원의 생산수당만 계산·확정한다.
- 생산수당 월 계산은 서버가 `Σ(WorkRecord.quantity × WorkRecord.ctSeconds × 해당 작업 월에 적용되는 공장 생산수당 초당 단가)`로 다시 계산한다. 공장 단가 변경 시 사용자가 `적용 시작 월`을 선택하며 기본값은 변경 당시 현재 월이다. `FactoryProductionAllowanceRate`에서 계산 월 이하의 가장 최근 이력을 사용하고 과거 `WorkLog.factoryWagePerSecond`는 생산수당 계산 근거로 사용하지 않는다. 클라이언트가 보낸 생산수당 합계를 신뢰하지 않는다.
- 잠금 해제된 월 계산본에서는 직원별 `적용 초당 단가`를 수정할 수 있다. 기본 표시는 직원의 `총 생산수당 ÷ 총 CT초` 가중평균이며 수정값은 평균이 아니라 해당 직원의 그 달 전체 CT초에 적용되는 명시적 override다. 서버는 저장된 공정별 CT초에 override를 곱해 직원·공정 생산수당을 재계산하고 스냅샷에 동결한다. 잠긴 계산본은 수정할 수 없다.
- 생산수당 화면과 신규 스냅샷에는 성과급(`CT`) 직원만 포함한다. 고정급 직원과 기본급·고정수당·변동수당·상여금·공제는 제외한다. 과거 급여 스냅샷을 읽을 때도 저장된 성과급 행의 `productionEarnings`만 생산수당으로 보며 `ctAmount`나 최종급여를 합산하지 않는다.
- 공장 설정의 `targetMonthlyWage`는 물리 컬럼명과 달리 전체 월급이 아니라 `월 목표 생산수당`이며, `wagePerSecond`는 이를 월 26일·일 8시간 기준으로 나눈 공장 공통 생산수당 초당 단가다. 화면에서는 월 목표 생산수당을 입력하면 초당 단가를 자동 계산한다. 향후 컬럼명을 바꾸기 전까지 기존 물리 이름은 호환용으로 유지한다.
- 공장 생산수당 설정은 최근 변경 시각 대신 `적용 시작 월`을 입력받는다. 단가 이력은 `FactoryProductionAllowanceRate`의 공장×적용 월 관계형 행으로 보존하며 같은 적용 월을 다시 저장하면 그 월의 정책을 수정한다. 기존 공장의 첫 이력 저장 때는 종전 단가를 공장 관리 시작 월 기준으로 먼저 보존한다.
- 기존 `/payroll` API 경로와 `PayrollSnapshot` 물리 이름은 현재 연계 호환을 위해 유지하지만 신규 의미는 생산수당 확정 스냅샷이다. 향후 전체 급여 체계를 구현할 때 생산수당 스냅샷을 구성 항목 근거로 연결하고 과거 값을 재계산하지 않는다.
- 생산수당 월 선택의 최소 월은 사업체 메뉴에서 관리하는 공장별 `Factory.managementStartDate` 중 가장 이른 날짜가 속한 월이다. 각 공장의 생산수당에는 해당 공장의 관리 시작일 이후 `WorkLog`만 포함하며, 다른 공장의 더 이른 시작일을 이용해 시작 전 기록을 포함하지 않는다. 공장이 없거나 값이 비어 있으면 기본 관리 시작일 `2026-04-01`을 사용한다.
- 생산수당 계산·확정은 출고 수량 정산 완료 여부에 의존하지 않는다. 생산수당의 근거는 성과급 직원의 확정된 작업기록 수량·CT와 계산 시점 공장 단가 또는 계산본에 동결된 직원별 override이며, 숨겨진 수량 정산 화면의 검토·차단 상태로 생산수당 저장을 409 차단하지 않는다.
- 생산수당 화면은 공장 선택 없이 선택 월의 모든 공장 작업기록을 함께 최초 계산한다. 월 필터는 관리 시작 월부터 직전월까지 허용하며 현재월 계산은 Ver1 범위에서 제외한다. 계산 근거가 바뀐 잠금 해제 계산본은 월·공장·라인별 `재계산` 버튼으로 해당 라인만 갱신한다. 이때 직원별 수동 초당 단가 override와 같은 월의 다른 라인 결과는 보존한다. 잠긴 계산본은 재계산하지 않으며 계산본은 별도 확인 후 삭제할 수 있다.
- 생산수당 계산은 목록 화면에서 실행하며 별도 `/payroll/new` 입력 화면으로 이동하지 않는다. 계산 후 생성된 월 행을 한 번 선택하면 `/payroll/:month` 직원별·공정별 상세 화면을 연다. 상세 상단에도 주문 상세와 같은 잠금 상태 버튼을 두며, 잠금 해제 후 페이지를 다시 불러오지 않고 직원별 초당 단가 편집을 즉시 활성화한다.
- `PayrollSnapshot.isProvisional`은 Ver1에서 확정 해제된 생산수당 계산본을 나타내는 호환 상태다. `false`인 생산수당 확정본도 최종 급여 확정이 아니므로 작업기록·출퇴근·배정·수량 정산을 잠그지 않는다.

## 2026-08-01 재고 개발 전 확정 사항

- 자재 마스터는 `자재 대분류 → 자재 종류 → 자재 품목 → 색상·규격·세부 구분별 SKU` 관계로 관리한다. 초기 자재 대분류는 `원단류`, `부자재`, `포장재`이며 모두 마스터에서 관리한다. 원단류는 겉감뿐 아니라 안감·심지·메쉬처럼 재단하거나 면을 구성하는 자재를 함께 조회하는 범위다. 의류에 직접 부착하는 메인·케어·사이즈 라벨은 부자재이고 폴리백·박스·포장용 스티커는 포장재다. 바늘·초크·기계유 같은 공장 운영 소모품까지 관리하게 될 때만 `소모품` 대분류를 추가 검토한다.
- 자재 대분류와 자재 종류는 품목 등록 시 모두 필수 선택하고, 자재 종류는 선택한 대분류에 속한 값만 표시한다. 겉감과 `HS-SCW-90003`처럼 자재 종류와 그 종류에 속한 품목은 독립 문자열이 아니라 관계형 FK로 연결한다.
- 자재 품목의 품명과 제조사는 수동 입력 선택값이며 품명을 모르는 경우 NULL을 허용한다. 폴리백처럼 자재 종류 자체로 식별 가능한 품목은 품명 없이 등록할 수 있다. 외부 고유번호도 시스템 불변 PK·자동 생성 자재코드와 분리된 선택 입력값으로 둔다.
- 규격과 세부 구분은 각각 선택 가능한 마스터 옵션으로 관리하되 NULL을 허용하고, 선택한 자재 종류에 사용할 수 있는 옵션만 제안한다. 예를 들어 일반 스냅·가시 스냅은 각각 자재 종류이고 10mm·13mm는 규격, B·C·D는 세부 구분이다. 실제 색상은 기존 `AttrColor`를 선택 연결하며 색상이 없는 자재는 NULL을 허용한다.
- 재고 단위는 별도 단위 마스터를 만들고 품목 등록 시 필수 선택한다. 단위별 소수 허용 자릿수를 관리하되 자동 단위 환산식은 만들지 않는다.
- 자재 검색은 자재 종류, 품명, 제조사, 외부 고유번호, 규격, 세부 구분, 색상, 단위 등 등록·표시 항목 전체를 하나의 키워드로 검색할 수 있어야 한다. 반복 사용 시 기존 자재를 먼저 검색·선택할 수 있게 하며 같은 식별 조합의 중복 등록을 방지한다.
- 자재 품목에는 별도 활성 상태를 초기 필수 요건으로 두지 않는다. 사용 이력이 있는 품목의 삭제·사용중지 정책이 실제로 필요해질 때 별도로 확정한다.
- 재고 수불·자재 마스터·BOM은 아직 구현하지 않는다. 이번에 명시적으로 확정한 공장 하위 창고 관리만 먼저 구현하며, 나머지는 사용자가 제공할 현행 재고표와 BOM 조사 결과를 확인한 뒤 각 개발 단계 직전에 다시 논의한다.
- 재고 메뉴와 화면 골격은 사용자 검토용 UI 시안으로 제공한다. `재고 현황·재고 거래·자재 관리·자재 설정` 메뉴는 열 수 있지만 샘플 데이터와 로컬 입력만 사용하며, 관계형 자재 마스터·재고 원장 API가 구현되기 전에는 운영 저장 기능으로 간주하지 않는다. `재고 거래`는 거래 내역을 기본 화면으로 표시하고 상단 `거래 등록` 버튼에서 구매·입고·출고·이동·반환·손실·조정을 입력한다.
- 재고 대상은 원재료와 부자재 전체다. 자재의 정확한 분류·규격·기준 단위는 현행 재고표를 받은 뒤 확정한다.
- 재고 단위 간 자동 환산과 저장된 고정 환산식은 구현하지 않는다. 단위가 다른 수량은 사용자가 실제 측정·확인한 값으로만 수동 입력하며, kg·m처럼 단위가 다르면 별도 자재 품목으로 관리한다.
- 재고 위치의 운영 단위는 창고다. `Factory 1:N Warehouse` 관계로 한 공장에 여러 창고를 둘 수 있게 하며, 공장 내부 선반·라인까지 재고 위치로 세분하지 않는다.
- 공장 생성 트랜잭션은 수정 가능한 영문 기본명 `Default Warehouse`와 한글명 `기본 창고`, 베트남어명 `Kho mặc định`을 가진 활성 기본 창고를 함께 생성한다. 기존 공장도 창고가 전혀 없는 경우 같은 기본 창고를 백필한다. 창고명은 공장명처럼 영어를 기본으로 하고 한글·베트남어 이름을 별도 저장한다. 공장에는 활성 기본 창고가 정확히 하나 있어야 하며 기본 창고를 비활성화하기 전 다른 활성 창고를 기본으로 지정해야 한다.
- 공장 하위 창고 관리는 구현 완료 상태다. 공장 상세에서 창고 추가·이름 수정·기본 창고 전환을 지원하며, 창고명 변경은 공장 정보와 같은 하단 저장 버튼으로 저장한다. 별도 사용 토글과 행별 이름 저장 버튼은 화면에 두지 않는다. 자재·lot·재고 원장과 Warehouse FK를 연결하는 작업은 재고 구현 단계 전까지 시작하지 않는다.
- `Warehouse`와 `FactoryProductionAllowanceRate`의 조직 범위는 각각 `(factoryId, orgId) -> Factory(id, orgId)` 복합 FK로 강제한다. 두 하위 행의 `orgId`를 독립적인 소유 정보로 신뢰하지 않으며 연결된 공장의 조직과 다르면 저장을 거부한다.
- 재고 거래의 창고 방향은 유형별로 강제한다. `구매`·고객 지급 입고·생산 반환 등 재고 증가 거래는 `destinationWarehouseId`만, 납품·생산 투입·고객 반환·손실 등 재고 감소 거래는 `sourceWarehouseId`만, 창고 이동은 두 FK를 모두 요구한다. 이동은 한 문서와 한 트랜잭션에서 양쪽 원장을 함께 생성한다.
- 음수 재고는 업무를 막지 않고 허용하되 조용히 지나가지 않는다. 음수가 발생하면 관리자에게 경고하고 원인과 미해결 상태를 추적할 수 있어야 한다. 구체적인 알림·해결 절차는 구현 전에 확정한다.
- 자재 마스터를 사용한다. 자재 코드는 시스템이 유일한 값으로 자동 생성하고 사용자가 수정할 수 있게 하되, 관계 FK는 변경 가능한 코드가 아니라 불변 PK를 사용한다. 품목별 소수 허용 자릿수와 lot 관리 여부도 자재 마스터에서 설정한다.
- 기존 의류 종류의 `카테고리`와 혼동하지 않도록 재고 화면에서는 `자재 대분류`와 `자재 종류`라는 용어를 사용한다. 대분류 아래의 자재 종류는 겉감·안감·일반 스냅·가시 스냅처럼 실제 업무에서 바로 선택할 평면 목록이며 추가 계층은 두지 않는다. 실제 재고 계산은 대분류나 종류가 아니라 정확한 품목/SKU를 기준으로 한다.
- 공급처와 재고 소유자는 별개다. 공급처는 조달 출처이고, 소유자는 현재 물품의 법적·업무상 주인이다. 고객 지급 자재처럼 제3자 소유 물품이 회사 창고에 있어도 소유 조직을 분리해 추적한다. 별도 `위탁 보관` enum의 필요성은 확정하지 않았다.
- 고객 지급 자재도 입고·출고/생산 투입·반환·손실·실사 조정과 잔량을 추적한다. 회사 원가에는 포함하지 않지만 수출입 서류 등을 근거로 직원이 입력한 참고단가는 보존한다.
- 기본 BOM의 소유 단위는 스타일이다. 나머지 BOM 사용량·버전·동결·대체 자재 규칙은 사용자 조사 후 구현 직전에 다시 논의한다.
- 입출고 원장의 회사 소유 취득 유형은 화면과 저장 유형에서 `구매`로 구분한다. 구매는 도착 창고의 회사 소유 재고를 증가시키지만 그 자체로 구매발주 문서를 생성하지 않으며, 향후 발주 기능을 추가하면 선택적으로 발주 FK를 연결한다. 그 밖에 고객 지급 입고, 창고 이동, 납품, 생산 투입, 생산 반환, 고객 반환, 폐기·손실, 실사 조정을 지원하는 방향으로 검토한다. 오입력은 원본 삭제가 아니라 반대 거래와 정정 이력으로 처리하고, 실사 차이 조정은 관리자 승인 후 반영한다.
- 생산 투입은 BOM 예상량을 제안하고 실제 출고량과 생산 후 반환량을 기록해 `예상 사용량`과 `실제 순사용량(출고-반환)`을 비교할 수 있어야 한다.
- 발주는 기본적으로 공용 재고 구매다. 특정 주문 연결은 선택 기능으로 둘지 구현 전에 다시 결정한다. 부분 입고와 미입고 잔량은 필수로 관리한다.
- 실제 취득원가 후보는 매입단가, 운송비, 관세, 기타 직접 취득비이며 부가세 처리도 별도로 검토한다. 환율은 직원이 근거 문서를 바탕으로 직접 입력한다. 공동 운송비 배분은 사례를 확인하기 전까지 확정하지 않는다.

## 2026-07-31 AT v2 관측 모델

## 2026-08-05 과거 작업기록의 라인 복구 기준

- 입사일이 과거인 직원을 뒤늦게 시스템에 등록하고 현재 올바른 라인에 처음 배정한 경우, 과거 Excel 작업기록 가져오기는 작업일을 덮는 라인 이력이 없더라도 종료되지 않은 현재 라인 배정이 정확히 하나면 그 라인을 복구용 근거로 사용할 수 있다. 이는 과거 `LineAssignment.startAt`을 입사일로 소급 변경하지 않으며, 직원의 입사·퇴사 기간 검증은 그대로 적용한다.
- 같은 직원에게 현재 활성 라인 배정이 둘 이상이면 임의로 선택하지 않고 가져오기를 차단한다. 작업일을 덮는 명시적 과거 라인 이력이 있으면 현재 라인 fallback보다 우선한다.
- 직원 명부의 `전체 상태`에는 거절된 직원 레코드도 표시해 사번을 점유한 숨은 계정을 관리자가 확인·재활성화할 수 있게 한다. 다만 `PENDING`과 `REJECTED` 직원은 작업기록 가져오기의 유효 직원으로 인정하지 않는다.

## 2026-08-05 완료 배정 보드 저장 불변식

- 배정 보드 전체 저장에서 완료 배정은 클라이언트의 화면 기준일·좌표 재매핑이나 파생 필드 동기화 결과를 쓰기 변경으로 간주하지 않고 서버의 기존 확정값으로 정규화한다. 완료 배정의 제거와 ST draft 전송은 계속 명시적으로 차단하며, 실제 완료 상태 변경은 전용 API만 사용한다.

### 2026-08-05 AT 안정 배분 운영 모델

- 기존 `v2`와 `v3-st-stable` 관측은 감사·비교용으로 삭제하지 않는다. 신규 운영 관측은 작업 종류별로 분리된 `v4-stage-aware` 모델 버전으로 별도 생성하며 화면과 운영 AT는 이 버전을 우선 조회한다.
- 작업자·기간 노동시간의 공정 배분은 ST snapshot을 초기값으로 한 번만 수행한다. 회귀·추정 AT를 다음 배분 가중치로 다시 넣는 반복 비례배분은 사용하지 않는다.
- 작업자·기간의 기록 ST 작업량으로 설명 가능한 노동시간은 기본적으로 ST 작업량의 최대 2배까지만 공정에 배분한다. 이를 초과한 노동시간은 공정 AT에 강제 귀속하지 않고 `unexplainedLaborInputSeconds`로 보존한다. 원 노동시간은 `sourceLaborInputSeconds`, 실제 공정 배분시간은 `allocatedLaborInputSeconds`로 구분한다.
- AT 총시간 회귀는 `total labor seconds = a × quantity + b`와 `a > 0, b ≥ 0` 제약을 사용한다. `eventCount`는 진단 메타데이터이며 회귀 설명변수나 수량 가중치로 사용하지 않는다.
- `FITTED`는 수학적 적합 상태일 뿐 운영 신뢰 승인을 뜻하지 않는다. 배분 관측과 직접 측정값을 구분하고, 화면 진단에는 미설명 노동시간과 AT/ST 비율을 함께 제공한다.

- ST의 임시 AT 대체는 배정이 `완료 조정(MANUAL_PROGRESS_ADJUSTMENT)`으로 전환되는 시점에, 해당 배정의 필수 공정별 WorkRecord 존재 여부를 서버가 검사해 연결된 작업기록이 0건인 공정이 정확히 1개일 때만 그 `StyleProcess`에 승인한다. 다른 공정의 기록수량이 배정수량보다 적다는 이유만으로 미완료 공정 수에 포함하지 않는다. 승인된 공정에 유효한 AT 관측이 0건이면 스타일 수량별 상세표에서 해당 버킷의 ST를 빨간색 `AT ST 대체값·검토 필요`로 표시하고 합계 AT에 포함하며, 스타일 목록의 1,000장 AT 합계에도 같은 표시 계산 규칙을 적용한다. 이는 합계를 비우지 않기 위한 표시 전용 임시값이며 `StyleProcessAtObservation`, AT 회귀 학습 또는 생산수당 원천으로 저장·사용하지 않는다. 무기록 공정이 0개 또는 2개 이상이거나, 관측이 존재하지만 특정 수량이 허용 추정 범위 밖인 경우에는 ST로 보완하지 않고 기존처럼 `-`를 유지한다.
- 승인 필드 도입 전에 이미 완료 조정된 과거 배정도 배포 마이그레이션에서 같은 필수 공정·WorkRecord 존재 조건으로 재검사하여, 무기록 공정이 정확히 1개인 경우에만 근거 배정과 대상 `StyleProcess` 승인을 백필한다.

- 외주 공정 등으로 실제 생산은 끝났지만 내부 작업기록만으로 진행률이 100%가 되지 않는 과거 배정에만 우클릭의 `완료 조정`을 사용한다. 서버는 저장된 배정수량을 100% 완료수량으로 사용하고 연결된 작업기록의 마지막 작업일을 완료일로 저장하며, `MANUAL_PROGRESS_ADJUSTMENT` 사유·처리자·처리시각을 보존한다. 가짜 WorkRecord나 생산수당 기록은 생성하지 않는다. 완료 조정은 배정 상태만 바꾸며 기존 WorkRecord와 유효한 공정별 AT 관측은 그대로 학습에 사용한다.

- v1 회귀가 `IMPLAUSIBLY_LOW_AT_PARAMS`로 실패해도 유효한 관측 평균이 ST 기반 최소 기준을 통과하면 `USED_PROVISIONAL`로 보존한다. 회귀 실패를 데이터 없음으로 바꿔 `StyleProcess.atParams`를 NULL 처리하지 않는다.
- 관계형 관측의 운영 단위는 `Organization × StyleProcess × AssignmentPlan`이며 `StyleProcessAtObservation` 행으로 저장한다. 수량은 `WorkRecord.quantity` 기반 실제 생산량 합을 사용한다.
- v2의 핵심 시간식은 학습과 예측 모두 `total labor seconds = a × quantity + b`로 단위를 통일한다. `eventCount`는 진단 메타데이터일 뿐 핵심 회귀 변수로 사용하지 않는다.
- 원본 AssignmentPlan 관측 장당 시간은 관계형 관측행에 그대로 보존하고 같은 수량도 학습 전에 합치지 않는다. 운영 AT는 Plan별 장당 잔차에 Huber 강건 손실을 적용해 `AT(q)=a+b/q`, `a>0`, `b>=0`을 적합한다. 수량 정보량 계수는 `min(2, sqrt(q/median(q)))`로 제한하고 출퇴근 실제시간 coverage와 단일공정일 노동시간 집중도를 곱한 최종 품질 가중치는 0.25~2 범위로 제한한다. 관측 수량별 제약 곡선 값을 기준점으로 사용하고 그 사이는 총시간이 증가하는 구간만 보간하며, 관측 수량이 하나뿐이면 곡선을 만들지 않고 기존 provisional 정책을 유지한다. 데이터가 감소 효과를 지지하지 않으면 임의 최소 감소율을 넣지 않고 `b=0`을 허용한다.
- 관측 범위 밖이지만 최소 관측수량의 1/2 이상, 최대 관측수량의 4배 이하인 수량은 회귀선을 연장하지 않고 가장 가까운 실제 관측점의 장당 AT를 범위 밖 참고값으로 표시한다. 소량 방향은 셋업시간 왜곡 위험 때문에 1/2 제한을 유지하고, 대량 방향만 1,000장 수준의 참고값을 제공하도록 4배까지 허용한다. 허용 배수 밖은 계산하지 않으며 모든 표시값은 ST 최소 기준과 양수 검사를 계속 통과해야 한다.
- 같은 실제 수량의 반복 배정은 모두 보존하고 생산량 가중 대표 AT에 반영한다. 반복 배정의 장당 AT 편차는 데이터 성숙도 감점에 사용하되, 서로 다른 수량 사이의 차이는 반복 편차로 간주하지 않는다.
- v1 `StyleProcess.atParams`와 v2·v3 관측은 과거 데이터 감사·비교 목적으로 보존한다. 신규 운영 AT 계산·표시·신뢰도 판정은 `v4-stage-aware` 관측 모델을 사용하되 유효한 v4 결과가 없는 공정의 마지막 유효 AT를 임의 삭제하지 않는다.
- 출퇴근 누락일은 작업기록이 있으면 기존 8시간 대체 투입시간으로 AT 관측에서 보존한다. 다만 실제 출퇴근으로 설명되지 않은 노동시간 비율(`attendanceFallbackShare`)만큼 v2 AT 신뢰도 점수를 감점하고, 보정 비율 8%·20%·35%·50%를 넘으면 각각 검증·신뢰·사용 가능·유의미 등급의 상한을 적용한다. 출퇴근 누락만을 이유로 관측 자체를 버리지 않는다.

## 2026-07-28 배정 ST snapshot 저장 불변식

- 신규 `AssignmentPlan.assignmentStSnapshot`은 프론트 payload를 신뢰해 저장하지 않는다. 배정 저장 트랜잭션 안에서 검증된 관계·스타일·활성 시간 버전·`QuantityBucketEntry.id`·`StyleProcessStandard` FK를 사용해 백엔드가 생성한다.
- 저장 직전 정규화는 백엔드가 생성한 snapshot을 유실하면 안 된다. 기존 배정의 ST 총합과 snapshot은 DB 저장값을 보존하며, 라인 이동이나 일정 좌표 변경만으로 현재 활성 버전의 ST로 교체하지 않는다.
- 기존 snapshot 누락 행을 현재 활성 버전, CT snapshot, PT 또는 수량 숫자 검색으로 추정 백필하지 않는다. 정확한 과거 version/entry를 확정할 수 없는 행의 ST 변경은 409로 실패시키고 별도 데이터 수리 대상으로 드러낸다.
- 운영 데이터를 초기화하거나 임의 출퇴근·급여·배정 상태를 생성한 뒤 삭제하는 방식으로 검증하지 않는다. 변경형 검증은 운영 테이블과 분리된 임시 PostgreSQL schema에서 수행한다.
- 2026-07-28 운영 org 1 관계 1의 snapshot 누락 49건은 관계 전환 시 `SYSTEM:RELATIONSHIP_TIME_BUCKET_BACKFILL`이 만든 최초 버전 142와 저장된 배정 수량·총 ST·CT snapshot의 공정 FK 집합을 교차 검증했다. 정확히 일치한 48건만 snapshot을 복구했고 전수 사후 검증 오류는 0건이었다. plan 331은 보존된 표준행 합계와 저장 총 ST가 4,000초 불일치해 추정하지 않고 NULL로 유지한다.

## Git 커밋·푸시 운영 원칙

- 코드나 문서 변경을 완료하고 검증한 뒤에는 사용자가 매번 별도로 요청하지 않아도 변경 범위를 확인해 자동으로 커밋하고 원격 저장소에 푸시한다.
- 기본 작업 흐름은 `main` 브랜치에 커밋한 뒤 `origin/main`으로 직접 푸시하는 것이다. 사용자가 명시적으로 요청하지 않는 한 별도 작업 브랜치나 PR을 만들지 않는다.
- 작업 트리에 이번 업무와 무관한 사용자 변경이 있으면 해당 변경을 커밋에 섞지 않고, 이번 업무에 속한 파일만 명시적으로 스테이징한다.
- 푸시 실패나 충돌처럼 자동 완료가 불가능한 경우에만 원인과 필요한 조치를 사용자에게 알린다.

## 2026-08-05 스타일 저장 후 배정 카드 재구성 범위

- 스타일 저장 후 배정 카드는 접근 관계에 포함된 조직에 다시 동기화할 수 있지만, 관계별 시간 버킷·공정 ST 저장소·미연결 배정 ST/CT snapshot 재계산은 제조사 조직 범위에서만 수행한다.
- 브랜드 조직의 `Style.timeBucketSetVersion`은 관계별 제조사 시간 버킷의 대체 자료가 아니다. 브랜드 배정 카드 재구성 중 빈 레거시 버킷을 제조사 공정 계산에 사용하거나 임의 기본 버킷으로 보완하지 않는다.
- 스타일 공정·PT·ST 변경 후에는 주문에서 다시 계산한 최신 시간 합계를 미배정 카드에 반영한다. 이미 생성된 `AssignmentPlan`은 배정 당시의 ST/CT snapshot과 합계를 보존하며, 스타일 저장 후 동기화가 이를 현재 스타일 값으로 갱신하지 않는다.
- 미배정 카드의 ST 합계를 계산하는 최종 스타일 객체에는 관계별 활성 `timeBucketSetVersion.entries`에서 만든 `timeBucketQuantities`를 반드시 함께 전달한다. 공정 mirror만 결합하고 버킷 수량을 누락해 빈 버킷 오류를 만들면 안 된다.

## 2026-07-27 매출·시간 기본 버킷 영향 대상 분리

- 고객 기본 버킷 변경 시 가격 승계 대상은 해당 관계에서 매출 예외가 없는 스타일이고, 시간 ST 전환 대상은 시간 예외가 없는 스타일이다. 두 집합은 서로 독립적으로 계산하며 한쪽 기본 집합에서 다른 쪽 집합을 파생하지 않는다.
- 매출 예외만 있고 시간 예외가 없는 비대칭 상태에서도 관계 기본 시간 버전이 바뀌면 해당 스타일의 새 활성 entry마다 `StyleProcessStandard`가 생성되어야 한다. 반대로 시간 예외 스타일은 매출 기본 여부와 무관하게 관계 기본 시간 전환에서 제외한다.
- `OrgRelationship.salesBucketSetVersionId`, 관계×스타일 매출 예외, 고객 판매단가표의 버전은 모두 관계 제조사 조직 소유여야 한다. 애플리케이션 생성 경로뿐 아니라 관계·스타일·버전 복합 FK로 제조사/브랜드 범위를 DB에서 강제한다.

## 2026-07-26 관계별 시간/ST 버킷 소유권

- 시간/ST 버킷의 운영 범위는 `OrgRelationship(제조사 × 브랜드) × Style`이다. 같은 브랜드의 같은 스타일이라도 제조사가 다르면 서로 다른 버킷 경계와 ST를 사용할 수 있다.
- 관계 기본 시간 버전은 `OrgRelationship.timeBucketSetVersionId`, 스타일 예외는 `OrgRelationshipStyleTimeBucket.quantityBucketSetVersionId`로 연결한다. 두 버전과 entry는 제조사 조직 소유이며, 스타일은 브랜드 조직 소유를 유지한다.
- `Style.timeBucketSetVersionId/timeBucketSource`는 마이그레이션 호환 필드일 뿐 제조사 운영 조회·계산의 소스오브트루스가 아니다. 운영 코드는 반드시 현재 제조사-브랜드 관계를 먼저 확정하고 관계 기본 또는 관계×스타일 예외 버전을 사용한다.
- 브랜드가 제조사 공정 없이 스타일만 생성하거나 가져올 때 `Style.timeBucketSetVersionId` 또는 브랜드 소유 `DEFAULT_TIME_BUCKETS`를 새로 만들지 않는다. 제조사가 스타일을 사용할 때 관계 시간 버전을 해석한다.
- `AssignmentPlan.orgRelationshipId`는 배정의 제조사 `orgId`와 고객 `buyerOrgId`에 맞는 관계를 고정한다. 신규 ST 스냅샷은 이 관계 범위의 entry/version과 해당 제조사 `StyleProcessStandard`에서만 생성한다.
- 매출 버킷과 시간 버킷은 별도 세트·버전·FK를 유지하되, 단가 화면에서 버킷 경계를 저장할 때 같은 관계 범위 안에서 한 트랜잭션으로 함께 전환한다. 다중 제조사 브랜드라는 이유만으로 저장을 막지 않으며 다른 관계의 시간 버킷은 변경하지 않는다.
- 기존 버전, 기존 ST 행, 기존 배정 ST/CT 스냅샷은 삭제·재계산하지 않는다. 관계 전환 마이그레이션은 기존 정확한 entry/version의 ST만 새 관계 entry로 복제하고 누락이 있으면 실패한다.
- `npm run test:relationship-bucket-integration`은 공개 운영 테이블과 분리된 임시 PostgreSQL schema에서 제조사 2곳×브랜드 1곳×스타일 1곳을 구성해 관계 A/B의 버전·entry·ST·기존 배정 snapshot 상호 불변을 검증하고 schema를 삭제한다. 실행에는 `RELATIONSHIP_BUCKET_TEST_DATABASE_URL`이 필요하다.

## 2026-07-26 ST 버킷 FK 조회 불변식

- `StyleProcessStandard` 조회와 계산은 `bucketQuantity` 숫자로 행을 검색하지 않는다. 반드시 현재 `Style.timeBucketSetVersionId`에서 결정한 `QuantityBucketEntry.id`와 version ID를 함께 사용한다.
- 같은 공정과 같은 수량 숫자가 과거·현재 버전에 동시에 존재하는 것은 정상적인 버전 이력이다. 과거 행을 삭제하지 않으며, 활성 화면과 신규 배정 계산에는 현재 버전 행만 사용한다.
- `assignmentStSnapshot.quantityBucketEntryId`와 snapshot 공정의 `stSeconds/stSource`는 반드시 같은 entry/version의 `StyleProcessStandard`에서 생성한다.
- snapshot의 표시용 `bucketQuantity`도 해당 entry relation의 실제 `bucketQuantity`와 일치해야 하며, 불일치하면 보정하지 않고 409로 거부한다.
- `StyleProcessStandard(styleProcessId, orgId)`는 `StyleProcess(id, orgId)` 복합 FK로 보호한다. 코드의 조직 필터를 DB 무결성 대신 사용하지 않는다.
- `npm run verify:st-bucket-fk`는 FK 누락, entry 불일치, 공정 조직 불일치, 해결되지 않은 교차 조직 연결 또는 레거시 ST 컬럼을 발견하면 실패 종료한다.

### 2026-07-25 매출 버킷과 지급 시간 버킷 동기화 정책

- 고객 매출 버킷은 고객에게 받을 판매단가 구간이고, 스타일 시간 버킷은 직원 지급액 산정의 근거가 되는 ST/AT/CT 수량 구간이다. 데이터와 계산 목적은 분리하지만 운영 수량 경계는 함께 맞춘다.
- 고객 매출 버킷을 추가하거나 삭제하는 저장 작업은 해당 고객에게 연결된 스타일의 지급 시간 버킷 변경과 하나의 명시적인 트랜잭션으로 처리한다. 한쪽을 다른 쪽의 조회 fallback으로 대신하거나 같은 FK를 암묵적으로 공유하지 않는다.
- 버킷 숫자는 해당 구간의 시작 수량이다. 예를 들어 `100, 300, 500`에서 `300`을 삭제하면 이후 생성되는 수량 300~499의 배정은 `100` 버킷을 사용한다. `100, 500`에 `300`을 추가하면 이후 생성되는 수량 300~499의 배정은 `300` 버킷을 사용한다.
- 버킷 변경은 변경 이후 생성·수정되는 운영 데이터에만 적용한다. 기존 배정의 ST/CT 스냅샷, 기존 WorkRecord의 CT 및 확정·잠금된 급여를 현재 버킷으로 재계산하거나 변경하지 않는다. 판매단가는 주문 잠금과 무관하며 향후 청구서 생성 시점에 확정한다.
- 버킷 삭제 시 삭제한 구간의 현재 편집 대상 값만 활성 버전에서 제외한다. 그대로 남는 수량 구간의 판매단가와 ST는 새 활성 버전으로 정확히 승계한다.
- 버킷 추가 시 그대로 남는 구간의 판매단가와 ST는 승계하고, 새 판매단가 셀만 미입력 상태로 둔다. 신규 ST는 새 수량보다 작은 기존 버킷 중 가장 가까운 버킷의 ST를 실제 `StyleProcessStandard` 행으로 복사한다. 예를 들어 `100, 500`에 `300`을 추가하면 공정별 `ST(100) -> ST(300)`으로 복사한다. 이 값은 `setBy=BUCKET_INHERITED_REVIEW`로 기록하고 UI에서 검토가 필요한 빨간색 값으로 표시한다. AT는 저장 복사본을 만들지 않고 기존 `AT(q)=a*q+b`를 새 수량에 평가해 추정 가능할 때 표시한다.
- 신규 버킷보다 작은 기존 버킷이 없거나, 해당 하위 버킷의 유효한 ST가 없는 공정이 하나라도 있으면 전체 버킷 변경을 거부한다. PT, 상위 버킷, 전역 기본값 또는 임의 값으로 보완하지 않는다.
- 버킷 변경은 향후 대시보드 검토 알림의 원천 이벤트다. 최소한 변경 고객 관계, 추가·삭제된 수량 경계, 영향받은 스타일과 공정, PT에서 초기화된 ST, 단가 미입력 셀, 변경자와 변경 시각을 관계형 변경 이력으로 남길 수 있어야 한다. JSON 로그나 화면 문자열만으로 관계를 표현하지 않는다.
- 향후 알림은 예를 들어 “고객 A에 300 버킷이 추가되어 스타일 X/Y의 ST(300)가 ST(100) 값으로 초기화되었습니다. 판매단가와 신규 ST를 검토하세요”처럼 영향 범위를 정확한 FK로 조회해 표시한다.
- **2026-07-25 구현:** `PUT /customers/:id/quantity-buckets`의 Serializable 트랜잭션 안에서 매출·시간 버전을 함께 전환한다. 유지 수량의 `CustomerSalesPrice`는 새 entry에 복사하고, 신규 수량의 판매단가는 비워 둔다. 신규 ST는 과거에 삭제되어 비활성인 standard가 아니라 변경 직전 활성 버킷 중 가장 가까운 하위 수량의 ST만 복사한다. 하위 ST가 없는 공정이 하나라도 있으면 전체 롤백한다. 단가 관리 UI는 저장 전 영향 확인을 받고 저장 후 영향 스타일·승계 단가·검토 ST 수를 알리며, `BUCKET_INHERITED_REVIEW` ST는 스타일 화면에서 빨간색으로 표시한다.

### 2026-07-25 관계형 정합성 마이너 정리

- `syncAssignmentPlansForOrderLock`의 스타일별 수량/FK 검증은 완료·급여잠금 여부와 무관하게 해당 주문의 모든 `AssignmentPlan`을 대상으로 한다. 잠금 상태는 수정 가능 여부에만 사용하며 합계에서 제외하지 않는다.
- split 배정의 합계가 주문 수량과 다르면 자동 재분배하지 않고 409로 거부한다. 단일 배정이라도 완료·급여잠금 상태에서 수량이 다르면 명시적 해제·정정을 요구한다.
- `AssignmentPlan.assignmentQuantity = null`은 0장이 아니라 데이터 정합성 훼손이다. 주문 잠금 동기화에서 409로 드러내며 계산용 0 fallback을 사용하지 않는다.
- WorkRecord 정규화의 `styleCode`/`styleName`은 검증된 `AssignmentPlan -> Style` 관계에서만 가져온다. 관계를 확정하지 못했을 때 요청 payload의 문자열을 진단·표시값으로 유지하지 않는다.
- `AssignmentPlan.cardId`는 현재 외부 보드 식별자/API 호환 용도가 남아 있으므로 이번 정리에서 컬럼을 제거하지 않았다. 관계 조인은 `assignmentCardId` FK를 사용하며, 진단 payload에서 문자열 값은 `assignmentCardExternalId`로 명시한다.

> 이 파일은 Claude Code, Codex 등 모든 AI 도구의 단일 진입점이다.  
> 내용을 수정할 때는 이 파일 하나만 수정한다.

## 문서 읽기 순서

1. 현재 업무 규칙과 구현 판단은 이 `AGENTS.md`를 따른다.
2. 앞으로 할 일, 운영 검증, 보류된 재고·수익성 계획은 `todo.md` 하나에서 관리한다.
3. 재고 세부 업무 규칙은 재고 개발을 시작한 뒤 각 단계 구현 직전에 사용자와 논의해 확정한다. 사용자가 구현 시작을 명시하기 전에는 BOM·재고·매입·수익성 코딩을 시작하지 않는다.
4. 이 파일 뒤쪽의 날짜별 phase 기록은 변경 이력이다. 앞쪽 강제 원칙 또는 `todo.md`와 충돌하면 현재 강제 원칙과 `todo.md`가 우선한다.

## 대화별 문서 팔로우업 원칙

- 재고에 한정하지 않고 모든 업무 주제에서 사용자가 새로 확정하거나 변경한 요구사항, 용어, 계산 규칙, 데이터 불변식, 화면 동작과 운영 정책을 매 요청마다 확인해 별도 지시 없이 관련 MD에 반영한다.
- 현재 구현과 판단을 강제하는 확정 규칙은 `AGENTS.md`에, 앞으로 할 일·운영 검증·보류된 결정은 `todo.md`에 기록한다. 단순 질문·일회성 조사 과정·확정되지 않은 제안은 확정 규칙처럼 기록하지 않는다.
- 새 결정이 기존 문구와 충돌하면 새 항목만 덧붙여 모순을 남기지 말고 기존 문구와 체크리스트를 함께 수정하거나 제거한다. 구현을 완료하면 관련 할 일의 상태도 같은 작업에서 갱신한다.
- 문서 변경은 해당 요청의 코드 변경과 함께 검증·커밋·푸시한다. 코드 변경이 없는 논의라도 확정된 내용이 있으면 문서만 별도 커밋·푸시한다.

봉제 공장 생산 관리 SaaS. 핵심 기능: **AT 추정** + **스케줄러**.

---

## ⚠️ DB 접속 전 필독: Supabase ≠ 운영 DB

- **운영 데이터(주문/스타일/작업기록/배정 등)는 전부 Railway Postgres에 있다. Supabase에는 없다.**
- Supabase는 **소셜 로그인(Auth, Google OAuth)만** 담당한다. Supabase 안에 Postgres가 딸려 있어서 헷갈리기 쉽지만, 그 Postgres는 앱 데이터 저장용으로 쓰이지 않는다(테이블은 존재해도 전부 빈 상태).
- **`backend/.env`의 `DATABASE_URL`/`DIRECT_URL`은 현재 Supabase Postgres를 가리키고 있다.** 이 파일을 운영 DB로 믿고 사용하면 안 된다. 2026-07-23 Supabase `public`의 빈 BARO 테이블 31개는 삭제했으며, 데이터가 1건씩 있던 `SystemUser`/`SchedulerRunHistory`만 임의 삭제하지 않고 남겼다.
- 실제 운영 데이터를 조회/조사해야 하면 `.env`를 쓰지 말고, Railway 콘솔 → **Postgres 서비스 → Variables 탭 → `DATABASE_PUBLIC_URL`** 값을 받아서 그걸로 접속한다. (`DATABASE_URL`이라는 이름의 변수가 Railway Variables에도 있지만 그건 `*.railway.internal` 내부 전용 호스트라 Railway 네트워크 밖에서는 연결 자체가 안 된다. 반드시 `DATABASE_PUBLIC_URL`을 써야 한다.)
- 이 값은 비밀번호가 포함된 민감정보이므로 세션에서만 임시로 쓰고 `.env`에 영구 저장하지 않는다.
- **2026-07-23 안전장치:** 백엔드 시작과 DB 변경 Prisma 명령은 `DATABASE_URL`/`DIRECT_URL`이 Supabase Postgres 호스트를 가리키면 즉시 실패한다. `SUPABASE_URL` 등 인증 변수는 검사하지 않는다. Supabase는 Auth 전용이고 BARO 애플리케이션 DB는 Railway Postgres만 허용한다.

---

## 핵심 용어

| 용어 | 정의 |
|---|---|
| **스타일** | 옷 한 종류 (예: 재킷 A형) |
| **공정** | 스타일을 만들기 위한 작업 단계. 순서 없음. 공정 N개가 각 1회씩 완료 = 옷 1벌 완성 |
| **라인** | 작업자들의 팀. "라인 1 = A팀(작업자 1, 2, 3)" |
| **PT** | Physical Time. 기본 물리 시간 (`process.pt`) |
| **ST** | Standard Time. 수량 구간별 수동 설정 기준 시간 (`stValues[bucket].seconds`). 구간: 1,3,5,10,30,50,100,300,500,1000,3000,5000,10000 |
| **CT** | Contract Time. ST 기반 계약 시간(초/공정). 성과급 직원의 작업 실적을 금액으로 환산하는 시간 기준이다. |
| **AT** | Actual Time. 작업기록으로 학습한 실제 시간. 모델: `AT(q) = a*q + b` |

### 시간 필드 규칙 (강제)
- **PT (`ptSeconds`)**: 공정 row 1개를 1장 수행하는 전체 물리 시간이다. `timesPerPiece`를 다시 곱하지 않는다.
- **ST (`stSeconds`)**: 공정 row 1개를 1장 수행하는 전체 표준 시간이다. 스케줄러 예상 기간, 배정 카드 길이, 계획 소요 시간 계산의 기준이며 `timesPerPiece`를 다시 곱하지 않는다.
- **CT (`ctSeconds`)**: 공정 row 1개를 1장 수행하는 전체 계약 시간이며, 성과급 계산에서 작업 실적을 금액으로 환산하는 시간 기준이다. 배정 카드에서 수정할 수 있지만, 스케줄러 길이 계산에 사용하면 안 되며 `timesPerPiece`를 다시 곱하지 않는다.
- **AT**: WorkLog/WorkRecord와 출퇴근 데이터로 학습한 실제 시간 추정값이다. 스케줄 보정/예측 참고값이지 CT가 아니다.
- `AssignmentPlan.assignmentStTotalSeconds`(물리 컬럼명, §24에서 `stTotalSeconds`에서 리네임됨): 배정 카드 전체의 계획 ST 총초. 스케줄러 길이 계산 전용이다. API/board payload 호환 키로 `stTotalSeconds`가 여전히 노출될 수 있다.
- `AssignmentPlan.assignmentCtTotalSeconds`(물리 컬럼명, §24에서 `ctTotalSeconds`에서 리네임됨): 배정 카드 전체의 계약 CT 총초. 성과급 산정 근거와 계약 기준 전용이며 스케줄러 길이 계산에 사용 금지. API/board payload 호환 키로 `ctTotalSeconds`가 여전히 노출될 수 있다.
- `WorkRecord.ctSeconds`: 작업기록 상세 행의 성과급 계산용 CT. 진행률/스케줄 실제 기간 계산에서 ST처럼 쓰면 안 된다.
- `WorkLog.totalCtSeconds`: 작업기록 헤더의 CT 합계. 작업기록 목록/요약과 급여 참고용이며 스케줄러 길이 계산에 사용 금지.
- `AtTrainingBucket.laborInputSeconds`: AT 학습용 실제/대체 투입 노동 시간 합이다. 스케줄러 계획 시간이나 계약 시간과 섞으면 안 된다.
- 같은 의미는 같은 단어를 쓴다. 공정 단위는 `stSeconds`/`ctSeconds`, 배정카드 총합은 `stTotalSeconds`/`ctTotalSeconds`, AT 투입 노동 시간은 `laborInputSeconds`.
- 신규 코드에서 `contractedSeconds`나 도메인 필드명 `totalSeconds`를 추가하지 않는다. `totalSeconds`는 화면 포맷팅 같은 일반 지역 변수에만 허용한다.

### 2026-07-28 생산직 성과급 급여 구조

- 급여 타입은 `고정급`과 `성과급`으로 표시한다. 기존 `FIXED`의 한국어 표시 `기본급`은 `고정급`으로 바꾸되, 저장 enum을 변경하는 작업과는 구분한다.
- 급여 구성 항목은 `기본급`, `고정수당`, `생산수당`으로 구분한다. 한국어/영어/베트남어 표준 표기는 각각 `기본급 / Base Salary / Lương cơ bản`, `고정수당 / Fixed Allowance / Phụ cấp cố định`, `생산수당 / Production Allowance / Phụ cấp sản lượng`이다.
- 급여 타입의 다국어 표기는 `고정급 / Fixed Pay / Lương cố định`, `성과급 / Performance Pay / Lương theo sản lượng`으로 통일한다.
- 고정급 직원의 월 총급여는 `기본급 + 고정수당`, 성과급 직원의 월 총급여는 `기본급 + 고정수당 + 생산수당`으로 구성한다. 성과급 직원이라는 이유로 기본급이나 고정수당을 0원으로 간주하지 않는다.
- 기본급과 고정수당은 작업 실적과 무관한 고정 금액이다. 생산수당과 분리해 저장·계산·표시하며, CT나 초당 단가로 기본급·고정수당을 역산하지 않는다.
- 개인별 생산수당은 해당 직원의 작업기록을 근거로 `Σ(WorkRecord.quantity × WorkRecord.ctSeconds × 월 계산 시점 해당 공장의 생산수당 초당 단가)`로 계산한다. 계산본에서 직원별 적용 초당 단가를 수정하면 그 직원의 월 전체 CT초에 override를 적용한다. CT는 전체 급여가 아니라 생산수당만 계산하는 시간 기준이다.
- 공장의 초당 금액은 전체 급여나 월 목표 급여가 아니라 `공장 공통 생산수당 초당 단가`다. 같은 공장에서 같은 적용기간에 일한 성과급 직원은 공통 단가를 사용하되, 개인별 작업기록 수량과 CT에 따라 생산수당이 달라진다.
- 공장 설정 화면의 `급여 기준`, `월 목표 급여`, `초당 급여`라는 표현으로 기본급·고정수당·생산수당을 하나의 급여 기준처럼 보이게 하지 않는다. 생산수당 설정 영역과 고정 지급 항목을 명확히 분리한다.
- 직원의 `급여 타입: 성과급`은 총급여 전체가 생산실적에 따라 결정된다는 뜻이 아니라, 기본급과 고정수당에 작업기록 기반 생산수당을 추가하는 계산 방식임을 뜻한다.
- 과거 작업기록과 확정 급여를 현재 공장 단가로 다시 계산하지 않는다. 구현 시 공장별 성과급 단가의 적용기간 또는 급여 스냅샷 보존 방식을 관계형 데이터로 확정해야 한다.

### 2026-07-29 급여 설정·생성 시점과 4개 구성 항목

- 급여에는 두 개의 `급여 타입`과 네 개의 `급여 구성 항목`이 있다. 급여 타입은 `고정급/성과급`이고, 구성 항목은 `기본급/고정수당/변동수당/생산수당`이다. 네 구성 항목을 네 개의 급여 타입이라고 부르지 않는다. 변동수당의 표준 번역은 `Variable Allowance / Phụ cấp biến đổi`로 사용한다.
- 고정급 직원의 총급여는 `기본급 + 고정수당 + 변동수당`, 성과급 직원의 총급여는 `기본급 + 고정수당 + 변동수당 + 생산수당`으로 구성한다.
- 급여 계산을 새로 생성할 때 직원의 현재 급여 타입과 현재 적용되는 기본급·수당 설정을 기본값으로 가져온다. 급여 생성 후에는 가져온 타입·항목·금액·적용 정책을 해당 급여에 동결하고, 이후 직원 또는 공장 설정이 바뀌어도 이미 생성·확정된 급여를 자동 변경하지 않는다.
- 급여 화면에서 명시적으로 수정 가능한 항목은 생성된 급여 내역의 조정값이다. 직원 마스터나 공장 기본값을 역으로 덮어쓰지 않으며, 새 급여를 다시 생성할 때만 당시의 현재 설정을 기본값으로 사용한다.
- 기본급은 직원별 설정값이다. 권한 있는 사용자가 사업체 또는 공장 범위의 기본값을 관리할 수 있고, 직원 생성·편집 시 그 기본값을 제안값으로 사용하되 직원별로 수정할 수 있어야 한다. 직원별 확정값과 기본값의 출처를 구분한다.
- 고정수당도 사업체 또는 공장 범위의 수당 항목·기본 금액을 둘 수 있고 직원별 적용 여부와 금액을 수정할 수 있어야 한다. 고정수당은 매월 반복되는 항목이며 하나의 합계 필드만 두지 않고 수당 종류별 관계형 행으로 관리한다.
- 변동수당은 근태·근무조건·월별 사실에 따라 발생 여부나 금액이 달라지는 항목이다. 만근수당, 특근수당 등이 후보지만 실제 급여 항목 분류는 현장 직원 협의 후 확정한다. 항목별 계산 규칙과 계산 근거를 보존하며 사용자가 급여 생성 화면에서 확인·조정할 수 있어야 한다.
- 생산수당은 다른 수당과 분리하며 성과급 타입 직원에게만 작업기록 수량·CT·생산수당 초당 단가를 근거로 계산한다.
- 수당 항목은 최소한 `FIXED_ALLOWANCE`, `VARIABLE_ALLOWANCE`, `PRODUCTION_ALLOWANCE` 분류를 가져야 한다. 만근수당·특근수당 같은 구체 항목은 수당 마스터 FK로 연결하고 이름이나 ID 목록을 급여 JSON에만 복제해 관계를 표현하지 않는다.
- 급여 스냅샷에는 직원 급여 타입, 기본급, 적용된 수당 항목과 금액, 생산수당 계산 근거 및 사용된 정책 버전을 보존해야 한다. 현재 마스터를 다시 읽어 과거 급여를 재구성하지 않는다.
- 급여 기본 정책의 최종 운영 범위를 법인으로 할지 공장으로 할지는 아직 확정하지 않았다. 구현 전 `todo.md`의 범위 결정 항목을 먼저 완료하며, 임의로 한쪽을 영구 소스오브트루스로 고정하지 않는다.
- 특근수당의 일요일 근무 인정 방식과 최소 근무시간·시간당 추가 지급·일액 지급 여부는 아직 미정이다. 정책 확정 전 임의 공식을 구현하지 않는다.
- 급여 Ver1의 생산수당 확정은 해당 월의 계산 스냅샷만 잠근다. 화면에서 확정 해제 후 재계산하거나 계산본을 삭제할 수 있으며, 이 단계에서는 작업기록·출퇴근 기록·배정 데이터를 잠그지 않는다. 원천자료 잠금은 향후 최종 급여 확정 기능에서 처리한다.
- 기본급·고정수당·변동수당·생산수당에 어떤 실제 급여 항목을 배치할지는 2026-07-30 현장 직원 협의 예정 사항이다. 협의 결과가 문서에 반영되기 전에는 항목 마스터나 자동 계산 공식을 구현하지 않는다.

### 인증/권한 가드레일 (강제)
- 백엔드는 `x-user-email`, `x-org-id`, 쿼리 `orgId`를 **신원/권한의 소스오브트루스**로 사용하면 안 된다.
- 사용자 신원, 조직 소속, 시스템 관리자 판정은 **백엔드가 검증한 인증 토큰(JWT 등)** 에서만 유도한다.
- 헤더의 이메일/조직 값은 디버그/보조 정보로만 취급할 수 있으며, 검증된 actor context와 불일치하면 401/403으로 거부한다.
- `createdBy` / `updatedBy` / `requireSystemAdmin` / 조직 범위 접근 체크는 모두 같은 검증된 actor context를 사용해야 한다.
- **2026-07-12 적용 완료:** `backend/src/auth/requestAuth.ts`가 Bearer token을 검증하고 `backend/src/middleware/access.ts`는 그 검증 결과만 신원으로 사용한다. 프론트는 Supabase access token을 자동 부착한다. `x-org-id`는 조직 선택 힌트일 뿐이며 멤버십을 서버에서 다시 검증한다.

### DB 설계 원칙 (강제)
- 엔티티 간 관계는 JSON blob 안에 값을 복사해서 표현하지 않고 FK 컬럼 + Prisma relation으로 표현한다. "A가 B를 참조한다"는 항상 `aId Int` FK 컬럼과 `@relation`으로 만들고, 조회는 JOIN(Prisma `include`/`select`)으로 한다.
- `Json?` 필드는 아래 두 용도로만 신규 사용을 허용한다.
  1. 저장 시점 값을 의도적으로 얼려서 보존해야 하는 스냅샷 (`AssignmentPlan.assignmentCtSnapshot` 등).
  2. 다른 테이블 PK를 참조하지 않는, 구조가 자주 바뀌는 순수 표시/메타 데이터 (`imageUrls`, `bom` 등).
  - 다른 테이블의 PK를 담거나 이미 FK로 연결된 테이블과 같은 의미의 데이터를 다시 담는 JSON은 신규로 추가하지 않는다.
- 신규 스키마 변경/리뷰 시 "이 값이 이미 FK로 연결된 다른 테이블에도 존재하는가"를 먼저 확인한다. 존재하면 JSON에 중복 저장하지 말고 relation을 통해 조회한다.
- **JSON-관계형 이중 저장 정리 현황 (2026-07-02 업데이트)**:
  - `WorkOrder.items` (Json) ↔ `WorkOrderItem` (FK `workOrderId`) — **쓰기 중단 완료**. 신규 생성/수정 경로는 더 이상 `items` JSON에 쓰지 않는다(항상 `Prisma.JsonNull`). 읽기 fallback(`itemsFromRelation ?? normalizeOrderItems(order?.items)`)도 전부 제거해 이제 relation만 읽는다(비어 있으면 그냥 빈 배열). `PUT /orders/:orderId`의 부분 업데이트 fallback도 과거엔 `existing.items`(JSON) 을 읽었는데, 이제 `existing.workOrderItems`(relation)를 읽도록 같이 고쳤다 — 그대로 뒀으면 Phase 2 이후 items 없는 payload로 저장할 때마다 기존 주문 품목이 삭제되는 사고였다. 레거시 주문(관계형 행이 없는 주문)은 `migration_fix.sql`의 `Step 0d-5` 백필과 `npm run verify:workorder-item-backfill`로 처리한다. 백필 검증에서 0건이 나오면 컬럼 DROP을 진행할 수 있다.
  - `Style.processes` (Json) ↔ `StyleProcess`/`StyleProcessStandard` (FK `styleId`) — **쓰기 중단, 응답 fallback 제거 완료**. `POST /styles`, `PUT /styles/:styleId`, `POST /styles/import`는 더 이상 `processes` JSON에 쓰지 않는다. `toStyleResponse`와 카드 빌더의 "mirror 없으면 JSON 읽기" fallback도 제거했다. 다만 `ensureStyleProcessStorageForStyles`(자가치유 백필)는 그대로 유지한다 — 이건 매 요청마다 조용히 JSON을 대신 보여주는 fallback이 아니라, JSON을 시드로 관계형 행을 영구히 다시 써서 그 스타일을 완전히 마이그레이션시키는 1회성 백필이라 성격이 다르다. `npm run verify:style-process-backfill`(진단 전용, 미백필 스타일 수만 셈)로 남은 레거시 스타일을 확인하고, `GET /styles?includeProcesses=1` 호출(또는 스타일 편집 화면에서 재저장)로 개별 마이그레이션시킬 수 있다. `Style.processes` → `StyleProcess` 매핑은 processCode 다단계 fallback/로컬라이즈드 이름 합성 등 복잡한 정규화 로직이 얽혀 있어 raw SQL로 새로 백필하지 않았다 — 잘못 재구현하면 todo.md에 기록된 과거 데이터 유실 사고를 반복할 위험이 커서다. 0건 확인 후 컬럼 DROP.
  - `WorkLog.records` (Json) ↔ `WorkRecord` (FK `workLogId`) — 애초에 레코드 데이터를 복제 저장한 적이 없다. `{ lineId, lineName }` 헤더 메타데이터만 담으며, 실제 작업기록은 항상 같은 트랜잭션에서 `WorkRecord`로만 저장돼 왔다. 응답 조립 함수(`resolveWorkLogRecordResponses`)에 있던 `records.rows`/`records` 2단계 JSON fallback만 제거했다(이제 `workRecords` relation만 읽는다). `WorkRecord.lineId`는 이미 `Line`에 대한 실제 FK가 걸려 있다. `WorkLog.records` JSON 내부의 `{lineId,lineName}` 메타데이터는 여전히 비정규화 상태이지만, 이는 WorkRecord 데이터 복제가 아니라 별도 트래킹 대상(구조적 문제 #1)이라 이번 정리 범위에 포함하지 않았다.
  - `AssignmentBoardState.cards`/`assignments` (Json) ↔ `AssignmentCard`, `AssignmentPlan` (FK) — **완료 (2026-07-06 정정)**. 이 항목이 예전엔 "아직 미착수"이고 board JSON이 `$transaction` 안에서 커밋된 뒤 `AssignmentPlan` relation sync가 트랜잭션 밖에서 따로 실행된다고 적혀 있었으나, 실제 코드(`PUT /assignment-board-state`)를 다시 확인한 결과 이미 그렇지 않다 — `AssignmentCard` upsert(`syncAssignmentCardsForOrg`)와 `AssignmentPlan` 갱신, `AssignmentBoardState` upsert(`cards`/`assignments`를 항상 `Prisma.JsonNull`로 기록)가 전부 하나의 `prisma.$transaction` 안에서 실행된다. `shouldSyncPlans`라는 이름의 블록 자체도 더 이상 코드에 없다(§44~46 FK+join 재설계 과정에서 이 트랜잭션 구조로 이미 정리됨). board JSON 컬럼은 이제 순수 레거시 응답 호환용 빈 값일 뿐, 실제 읽기/쓰기 소스오브트루스는 `AssignmentCard`/`AssignmentPlan` relation이다.
  - `AssignmentCard`/`AssignmentPlan` FK 정확성 (2026-07-08): `styleId`/`workOrderId`/`buyerOrgId`는 row의 FK 컬럼만 소스오브트루스다. `AssignmentCard.payload`, `AssignmentPlan.cardId`, `originOrderId`, 스타일명/주문번호 문자열로 누락 FK를 복원하거나 매칭하지 않는다. 저장/동기화 경로에서 필요한 FK가 없으면 409로 드러내고, 운영자가 백필/수리해야 한다.
- 위 이중 저장을 정리할 때는 "JSON을 read source of truth에서 제외 → 코드 전체가 relation만 읽는지 검증 → JSON 컬럼 제거"의 단계적 순서를 따른다 (레거시 컬럼 제거 원칙과 동일). raw SQL 백필이 원본 정규화 로직(다단계 fallback, 파생 필드 등)을 완전히 재현하기 어려우면 SQL로 새로 만들지 말고 앱이 이미 쓰는 검증된 로직(자가치유 함수, 재저장 트리거 등)을 백필 메커니즘으로 재사용한다.

### 정확 계산 원칙 (강제)
- **2026-07-28 배정 조회 fail-closed:** progress 조회는 WorkLog/WorkRecord coverage 컬럼이 없을 때 축소 projection으로 재시도하지 않는다. 프론트도 progress·capacity 요청 실패 시 과거 성공값을 현재값처럼 유지하거나 빈 응답을 0% load로 해석하지 않으며, 값을 비우고 명시적 미계산 오류를 표시한다.
- **2026-07-25 후속:** 스케줄 표시 범위에 오늘이 없으면 첫 표시일을 오늘로 대체하지 않는다. AssignmentPlan에서 WorkRecord의 Style FK를 확정하지 못하면 요청 styleId로 보완하지 않는다. 동일 스타일이 여러 라인에 split된 상태에서 주문 수량과 배정 합계가 달라지면 자동 분배하거나 조용히 건너뛰지 않고 409로 명시 조정을 요구한다. `AssignmentPlan.updatedAt`은 `@updatedAt`으로 모든 쓰기에서 자동 갱신한다.
- **2026-07-25 FK 강화:** 정상 `WorkRecord`의 `assignmentPlanId/styleId/styleProcessId`는 필수이며 삭제 시 `SET NULL`로 고아화하지 않는다. `assignmentPlan`은 `(assignmentPlanId, orgId)`, `styleProcess`는 `(styleProcessId, styleId, orgId)` 복합 FK로 제조사 조직과 스타일 공정 일치를 강제한다. `Style`은 고객 조직 소유일 수 있으므로 `styleId -> Style.id` 단일 FK가 맞으며 `WorkRecord.orgId = Style.orgId`를 강제하면 안 된다. 운영 DB에서 확인된 978개 WorkRecord와 648개 StyleProcess는 제조사 org 1이 고객 org 2의 Style을 사용하는 정상 교차 조직 관계였다. 라인·공장 삭제도 연결 작업기록이 있으면 409로 거부한다.
- WorkRecord 저장 정규화에서 Style은 AssignmentPlan이 확정한 `styleId` PK로 조회한다. 제조사 `orgId`로 Style을 필터링하거나 조회 실패를 요청 payload의 `styleCode/styleName`으로 보완하지 않는다. 교차 조직 Style은 `OrgRelationship(manufacturerOrgId, brandOrgId)`가 존재해야 하며 무결성 진단에서 이를 확인한다.
- 배정 화면은 `AssignmentCard` FK row가 없을 때 `cardId/originOrderId` 문자열을 분해해 synthetic card를 만들지 않는다. 연결 이상은 기능을 비활성화해 드러낸다.
- 월별 라인 생산능력은 백엔드 계산 응답만 사용한다. 응답에 없는 월이나 capacity 값을 프론트가 근무일수×일일 생산능력으로 다시 만들지 않으며 0/미계산으로 드러낸다.
- 핵심 지표(생산률, 실제 생산 ST, 진행률, 급여, AT 학습 입력)는 정확한 소스오브트루스가 연결될 때만 계산한다.
- 계산에 필요한 FK/마스터/ST bucket/작업기록 연결이 없으면 임의 추정, 우회 공식, 보완 fallback으로 그럴듯한 값을 만들지 않는다.
- 예외: AT 학습의 출퇴근 휴먼에러 보정은 승인된 정책으로, 출퇴근 행이 없는 유효 근무일에 작업자당 8시간을 사용한다. 월~토요일 중 조직 휴일이 아닌 날만 대상이며, 일요일·조직 휴일·입사 전·퇴사 후·휴직 기간은 제외한다. 이 대체 비율은 AT 신뢰도에 반영해야 한다.
- 계산 실패는 0/null/미계산 상태와 진단 로그로 드러내며, 조용히 다른 공식으로 대체하지 않는다.
- 호환성 dual-read나 schema migration fallback은 명시된 migration 단계에서만 허용한다. 운영 지표 계산 로직에 섞지 않는다.
- 운영 지표 조회 중에 정규 참조를 다시 붙이는 helper를 호출하지 않는다. 예를 들어 실제 생산 계산은 저장된 `WorkRecord.styleProcessId`로 `StyleProcess/StyleProcessStandard`를 조회하며, `styleId/styleCode/name`, `processCode`, `AttrProcess.code`, 공정명으로 재탐색하지 않는다.
- `WorkRecord.assignmentPlanId/styleId/styleProcessId`는 신규 작업기록 저장 시점에 확정되어야 한다. 비어 있으면 저장을 거부하고 원인을 노출한다. `styleId`는 `Style.uid` 정수 FK이며 스타일 코드 문자열이 아니다. `processId`는 WorkRecord에 저장하지 않는다.
- 작업기록/배정의 실제 생산 계산은 색상, 사이즈, 성별을 구분하지 않는다. 정산에서 WorkRecord 생산량을 볼 때도 색상 기준으로 나누지 않는다. `colorId`, `colorCode`, `colorName`, `gender`를 WorkRecord 저장값이나 실제 생산/정산 매칭 키로 재도입하지 않는다.
- 레거시 컬럼/JSON key는 "백필 -> 신규 저장 차단 -> 운영 조회 참조 제거 -> 검증 -> DB DROP" 순서로만 제거한다. 참조 제거 전 DROP 금지, DROP 대상 컬럼을 새 코드에서 읽는 것도 금지한다.
- 진행 중인 DB/계산 정리 작업의 **원인 분석, 정책 판단, 로직 메모**는 `AGENTS.md`에 기록한다. `todo.md`에는 **앞으로 해야 할 일과 아직 남은 검증 항목만** 짧게 남긴다.
- 이 파일의 뒤쪽 phase 기록에 과거 dual-read/fallback 허용 문구가 남아 있더라도 현재 개발 정책은 이 "정확 계산 원칙"을 우선한다.

### 판매방식 용어와 레거시 가격 기능 (2026-07-23)
- 화면과 저장값은 `CMT · 임가공` / `FP · 완제품` 두 방식만 사용한다. 고객 제공 자재와 제조사 구매 자재가 함께 있어도 `MIX · 혼합`으로 저장하거나 표시하지 않으며, 자재별 조달주체는 판매방식과 별도 축으로 관리한다.
- 신규 DB 값은 업계 약어를 직접 저장하지 않고 `MANUFACTURING_SERVICE_PRICE` / `FINISHED_GOODS_PRICE`처럼 의미가 분명한 설명형 이름을 사용한다. 자재 조달주체와 소유주체는 판매방식과 별도 축으로 관리한다.
- `FOB`는 생산·조달 방식으로 사용하지 않는다. 향후 필요하면 Incoterm/배송조건으로 별도 관리한다.
- `OrgRelationship.pricingDefaultTradeType/pricingMatrix`의 `CMPT/FOB` 가격 기능은 실제 계산에 연결된 적 없는 레거시다. 2026-07-27 Railway 운영값을 `backups/legacy-org-relationship-pricing-2026-07-27.json`에 원문 백업했고 런타임 참조가 없음을 확인한 뒤 컬럼 제거 마이그레이션을 추가했다. 스타일 코드 문자열을 FK로 자동 매핑하거나 신규 관계형 가격표의 fallback으로 사용하지 않는다.
- 고객 판매단가는 스타일 상세에서 관리하지 않는다. 다음 phase에서 운영 관리의 고객 단가 관리 메뉴가 관계형 `고객 관계 × 스타일 × 판매방식 × 수량구간` 가격표의 단일 편집 위치가 된다.

### 매출 단가·청구 시점 정책 (2026-07-27)
- 단가 화면은 표시된 전체 표를 다시 쓰지 않고 저장 기준값과 비교한 변경 셀만 전송한다. 백엔드는 요청 전체를 먼저 검증한 뒤 단가표 헤더와 단가 행을 배치로 저장한다. 셀마다 조회/생성/upsert하는 경로를 다시 만들지 않는다.
- `CustomerSalesPrice`의 단가표 버전과 버킷 entry 버전 일치는 복합 FK로 강제하며, Prisma schema와 런타임 schema drift 검사 모두 같은 제약 이름을 요구한다.
- `DECIMAL(18,4)` 입력은 양수, 정수부 최대 14자리, 소수부 최대 4자리만 허용한다. 잘못된 셀 하나를 조용히 버리거나 반올림해 저장하지 않는다.
- 판매단가는 주문 생성·수정·잠금·배정·생산·작업기록·급여 계산과 무관하다. 가격 누락으로 주문 잠금을 409 거부하지 않으며 주문 잠금은 가격표를 생성·수정하지 않는다.
- `WorkOrderItem.salesPriceSnapshot`, `freezeOrderSalesPriceSnapshots`, `/orders/sales-price-diagnostics`, `salesPriceSnapshotStatus`는 잘못된 주문 잠금 시점 정책이므로 제거했다. 가격 확정은 향후 청구서 생성 시점에 관계형 `InvoiceLine`으로 구현하며 가격표·가격행·버킷 entry를 FK로 연결한다.
- 청구 전 예상 수익률은 현재 활성 판매단가를 사용하고, 청구 후에는 가장 최근 적용 가능한 청구 라인의 동결 단가를 사용한다. 둘 다 없으면 0원으로 보완하지 않고 미계산으로 표시한다. 수익률과 청구 기능은 아직 미구현이다.
- 고객 판매단가표의 판매방식은 `SalesPricingBasis` DB enum, 통화는 `Currency` 마스터와 `currencyId` FK로 저장한다. 단가 API는 `currencyCode`를 주고받지만 임의 판매방식·통화를 기본값으로 조용히 치환하지 않는다. 환율은 Currency 마스터에 포함하지 않으며 별도 정책 확정 후 구현한다.

### 주문 사이즈 세트 (2026-07-14)
- `WorkOrderItem.sizeQuantities`는 자유 JSON 키를 유지한다. 주문 입력 UI는 전역 `SIZE_CODES` 하나만 렌더링하지 말고 선택된 size set의 `sizeCodes`를 렌더링한다.
- 기본 size set은 기존 의류 세트(`XS/S/M/L/XL/2XL/3XL/4XL/FREE`, `M/W/U`)이며, URD/우리들 주문은 숫자 세트(`100/110/120/130/140/150/160/170/180/190/200`)를 사용한다.
- URD/우리들처럼 성별 구분이 없는 주문은 DB enum 호환을 위해 `gender: "U"`로 저장하되, 주문 UI에서는 성별 축을 숨긴다.
- size set은 주문 표시/입력/문서 컬럼의 문제다. 배정/작업기록/진행률/정산 계산 키로 사이즈나 성별을 다시 도입하지 않는다.

### AT 모델
```
AT(q) = a*q + b
  a = 장당 한계시간(초/장)
  b = 작업 시작 1회당 셋업 고정시간(초, 수량 무관)
```
수량이 많아질수록 장당 시간이 `a`에 수렴. 화면에서 보여주는 `AT(q)`는 "한 번 시작해서 q장을 만든 경우"의 총시간이며, 장당 참고값은 `(a*q + b) / q`다.

- **2026-07-15 이벤트 카운트 반영:** AT 학습식은 이제 `laborInputSeconds ≈ a * quantity + b * eventCount`로 맞춘다. `eventCount`는 `AtTrainingBucketProcess.eventCount`에 저장하며, 현재 구현은 해당 WorkLog 기간 안에서 같은 공정에 참여한 `workerId + attendance workDate`의 unique count를 사용한다. 즉 월말 일괄 WorkLog 1건이어도 출퇴근 데이터가 여러 작업일로 있으면 셋업 시간이 1회가 아니라 여러 worker-day로 반영된다.
- `b`는 "월 1회"가 아니라 "작업자가 해당 공정을 시작한 worker-day 1회"에 붙는 준비/셋업 성격의 시간으로 해석한다. 현장 데이터가 더 정교해지면 `eventCount` 산정 기준은 실제 시작 이벤트 단위로 바꿀 수 있지만, 임의 추정 없이 저장된 WorkRecord 기간과 AttendanceEntry만 사용해야 한다.
- `StyleProcess.atParams`는 `{a,b}` 외에 `fitStatus`, `isProvisional`, `fallbackReason`, 관측 수량/이벤트 범위(`minQuantity/maxQuantity`, `minEventCount/maxEventCount`)와 sample count를 저장한다. `USED_PROVISIONAL` 또는 수량 변화가 부족한 값은 확정 AT처럼 취급하지 않고 낮은 신뢰도로 표시한다.
- **2026-07-22 독립 출처 가드:** AT 회귀가 `FITTED`로 승격되려면 서로 다른 실제 수량뿐 아니라 서로 다른 독립 배정 출처(`assignmentPlanId` 기반)가 2개 이상 필요하다. 같은 주문/배정이 60장+40장처럼 여러 달에 나뉘어 작업기록으로 들어온 경우는 수량이 달라도 하나의 출처에서 쪼개진 데이터이므로 곡선으로 학습하지 않고 `USED_PROVISIONAL`로 남긴다.
AT 목적: 충분한 데이터 축적 후 CT/ST 조정 참고용.

### 가변 수량 버킷 (2026-07-23)

- 고객 판매단가용 기본 버킷은 `OrgRelationship.salesBucketSetVersionId`, 스타일 시간용 버킷은 `Style.timeBucketSetVersionId`로 각각 명시적으로 연결한다. 두 관계는 같은 버전을 가리킬 수 있지만 숨은 상속이나 조회 fallback으로 서로를 대신하지 않는다.
- 버킷은 `QuantityBucketSet -> QuantityBucketSetVersion -> QuantityBucketEntry` 관계형 구조로 저장한다. 기존 버전의 entry를 수정하지 않고 변경마다 새 버전을 만든다.
- `Style.timeBucketSource`는 `CUSTOMER_DEFAULT` 또는 `STYLE_OVERRIDE`다. 고객 기본 버킷을 바꿀 때는 `CUSTOMER_DEFAULT` 스타일만 새 버전으로 이동하며 예외 스타일은 그대로 둔다.
- 새 버킷의 ST는 모든 공정에 `StyleProcessStandard` 실제 행을 만들고, 새 수량보다 작은 기존 버킷 중 가장 가까운 버킷의 `bucketStSeconds`를 복사해 `setBy=BUCKET_INHERITED_REVIEW`로 기록한다. 유효한 하위 버킷 ST가 없으면 전체 변경을 거부한다. 조회 시 PT나 다른 버킷을 대신 쓰지 않는다.
- AT는 버킷별 저장값이 아니라 기존 곡선 `AT(q)=a*q+b`를 선택된 수량에 직접 평가한다.
- 배정 생성/수량 변경 시 `AssignmentPlan.assignmentStSnapshot`에 버킷 버전, 버킷 수량, 공정별 `styleProcessId/stSeconds/stSource`를 동결한다. 이후 과거 배정의 잔여 ST와 실제 생산 ST는 현재 `StyleProcessStandard`를 다시 읽지 않고 이 스냅샷만 사용한다. 스냅샷이 없는 레거시 배정은 현재 값으로 재구성하지 않고 미계산 진단으로 드러낸다.
- `BUCKET_INHERITED_REVIEW` ST가 CT 생성 근거가 된 배정은 `ctReviewRequired=true`다. 관리자가 신규 ST와 CT를 검토해 `ctReviewedAt`을 기록하기 전에는 해당 작업월의 급여 잠금을 거부한다.
- `ST_STANDARD_BUCKETS`는 새 조직/고객에 최초 기본 버전을 만드는 템플릿으로만 허용한다. 운영 계산에서 전역 버킷 목록으로 사용하지 않는다.
- **2026-07-25 동시성·관계 안전장치:** 버킷 전체 교체 PUT은 클라이언트가 마지막으로 읽은 `expectedVersionId`를 필수로 보내며, 서버 활성 버전과 다르면 409로 거부한다. 스타일 예외에서 고객 기본으로 복귀할 때는 예외 가격을 고객 기본 가격표에 복사하지 않고 버전 연결만 전환한다.
- 현재 지급 시간 버킷 연결은 `Style.timeBucketSetVersionId` 하나뿐이므로 같은 브랜드가 여러 제조사와 관계를 맺은 경우 관계별 시간을 안전하게 표현할 수 없다. 이 상태에서 저장 범위를 추정하거나 특정 주문만 골라 갱신하는 우회 처리는 금지하며, 버킷 변경 API는 해당 브랜드의 제조사 관계가 2개 이상이면 409로 차단한다.
- 버킷 변경 전에 같은 고객·판매방식·통화 범위의 미저장 단가가 있으면 먼저 단가를 저장하거나 취소하도록 요구한다. 버킷 저장 후 가격 재조회로 사용자 초안을 조용히 잃으면 안 된다.
- **2026-07-25 ST 버킷 FK 전환:** `StyleProcessStandard.bucketQuantity` 물리 컬럼과 `(styleProcessId,bucketQuantity)` 숫자 매칭을 제거했다. ST는 필수 `quantityBucketEntryId + quantityBucketSetVersionId` 복합 FK로 정확한 `QuantityBucketEntry`를 참조한다. 수량 표시는 relation의 `QuantityBucketEntry.bucketQuantity`를 JOIN해 얻는다.
- 버킷 버전 변경 시 유지 수량도 새 버전 entry에 연결된 새 ST 행으로 복제한다. 신규 수량만 직전 버전의 정확한 하위 entry ST에서 복사하고 `BUCKET_INHERITED_REVIEW`로 기록한다. 같은 숫자의 과거 entry, PT, 상위 버킷은 후보가 아니다.
- 운영 Railway DB의 기존 ST 15,301행을 진단한 결과 시간 버전·entry 누락은 0건이었고 모두 정확한 현재 entry PK로 백필 가능했다. 제조사 ST와 브랜드 소유 버킷이 연결된 8,424행은 정상 교차 조직 관계이므로 `StyleProcessStandard.orgId == QuantityBucketEntry.orgId`를 강제하지 않는다.
- 운영 반영 결과(커밋 `4dbb75a`): 15,301행 모두 entry+version FK가 채워졌고 null/orphan/process-org 불일치가 0건이다. `StyleProcessStandard.bucketQuantity/quantity/stSeconds` 레거시 물리 컬럼도 0건이며 Railway 백엔드 배포와 startup schema 검증이 성공했다.

#### 2026-07-25 구현 검증 및 발견된 버그 (커밋 `629635d`, 수정 완료)

- 2026-07-24 커밋 `f8a290b`("Implement versioned customer quantity buckets")로 가변 수량 버킷 뼈대가 구현됐다. 당시 신규 버킷을 `PT_DERIVED`로 채우던 동작은 2026-07-25 정책에서 **가장 가까운 하위 버킷 ST 승계 + `BUCKET_INHERITED_REVIEW`**로 변경하기로 확정했으므로 현재 요구사항으로 간주하지 않는다. 기존 ST 불변, 트랜잭션 롤백, CT 검토 게이트 구조는 유지한다.
- 같은 리뷰에서 실제 버그 2건을 발견해 커밋 `629635d`로 수정했다:
  1. `PUT /styles/:styleId`의 저장 트랜잭션 마지막 `findUniqueOrThrow`가 `timeBucketSetVersion` relation을 `include`하지 않아, **기존 스타일을 저장할 때마다 응답의 `timeBucketQuantities`가 항상 빈 배열로 돌아왔다.** 프론트가 이 응답을 그대로 폼 상태에 반영하므로 저장 직후 ST/AT 매트릭스의 수량 컬럼이 전부 사라져 보였다(새로고침하면 복구 — DB의 FK 자체는 건드리지 않아 데이터 유실은 아니었음). `include`를 추가해 해소.
  2. `POST /styles/import`(대량 등록)는 신규 스타일에 `timeBucketSetVersionId`를 전혀 설정하지 않았고 응답도 같은 `include` 누락이 있었다. `POST /styles`가 쓰던 "고객 기본 버킷 있으면 그것, 없으면 조직 표준 1-3-5 세트를 그 자리에서 생성" 로직을 `resolveDefaultTimeBucketSetVersionIdForNewStyle` 공용 함수로 추출해 재사용하도록 고쳤다. 기존 스타일을 재-import하는 경우는(PUT과 동일 원칙으로) 버킷을 건드리지 않는다. 이 엔드포인트를 호출하는 프론트 코드가 현재 없어(grep 0건) 실사용 영향은 없었다.
- 아래 `단가 관리` 상태는 커밋 `f143845` 당시 기록이며, 바로 다음 "매출 단가 실사용 구현"에서 대체됐다:
  - **매출 단가 버킷(수량 구간) 설정/저장은 실제로 동작한다** — `GET/PUT /customers/:id/quantity-buckets`에 연결되어 있고 위 뼈대 검증에 포함됨.
  - **실제 단가(가격) 입력·저장은 여전히 미구현이다** — 가격 입력 그리드는 `draftPrices` 로컬 state일 뿐이고 "단가 저장" 버튼은 여전히 `disabled`(잠금 아이콘). 이전에는 화면 상단 배너와 칩이 "전체가 UI 시안"이라고 표시해 버킷 저장까지 미구현인 것처럼 오해를 유발했다 — 2026-07-25에 안내 문구(`preview`/`noticeTitle`/`noticeBody`, ko/en/vi)를 "버킷 설정은 저장됨 / 가격 입력만 아직 시안"으로 범위를 분리해 정정했다.
  - 다음에 실제 가격표 저장 기능을 구현할 때는 `todo.md`의 "재고·수익성 0단계 후속 확인" 항목(관계형 고객 단가 테이블·API·주문 가격 스냅샷)을 참고한다.

#### 2026-07-25 매출 단가 실사용 구현

- 매출 단가 버킷과 스타일 ST/AT 시간 버킷의 연결은 완전히 분리한다. 고객 기본 매출 버킷은 `OrgRelationship.salesBucketSetVersionId`, 고객×스타일 매출 예외는 `OrgRelationshipStyleSalesBucket.quantityBucketSetVersionId`, 시간 버킷은 `Style.timeBucketSetVersionId`만 사용한다. 단가 화면에서 매출 버킷을 바꿀 때 `Style.timeBucketSetVersionId`, `StyleProcessStandard`, ST/AT 값은 절대 변경하지 않는다.
- 매출 단가는 `CustomerSalesPriceList`(고객 관계×스타일×CMT/FP×통화×버킷 버전 헤더)와 `CustomerSalesPrice`(버킷 entry별 Decimal 단가) 관계형 행으로 저장한다. 가격이 없는 버킷은 인접 버킷·다른 통화·다른 판매방식·레거시 JSON으로 추정하지 않는다.
- `CustomerSalesPrice.quantityBucketEntryId`와 가격표 헤더가 같은 `quantityBucketSetVersionId`를 가리키는지는 DB 복합 FK와 저장 트랜잭션 양쪽에서 fail-closed로 검증한다. `bucketQuantity`는 일반 가격 행에 중복 저장하지 않고 `QuantityBucketEntry` relation에서 읽는다.
- 주문은 스타일·수량·납기 같은 생산 주문 정보만 저장한다. `WorkOrder`에 판매방식이나 통화를 저장하거나 주문 화면에서 입력받지 않는다. 향후 청구 기능의 판매방식·통화는 고객 관계 기본값 또는 청구서에서 별도로 선택하며 주문의 임의 CMT/USD 기본값을 사용하지 않는다.
- 주문 잠금은 판매단가를 조회·확정하지 않는다. 향후 청구서 생성 시 스타일 전체 청구수량으로 매출 버킷을 판정하고 그 시점의 활성 가격을 관계형 청구 라인에 동결한다. 가격이 없으면 청구서 생성만 거부하며 주문·생산 기능은 차단하지 않는다.
- 단가는 `Decimal(18,4)`로 저장하고 API에서는 정확한 문자열로 전달한다. 0 또는 음수 단가는 허용하지 않으며 빈 칸은 미설정으로 저장할 수 있다.

---

## 데이터 구조 핵심

### 사원번호
- 제조사 직원의 사원번호는 공장과 무관한 조직 전체 4자리 순번이다. 예: `0001`.
- 직접 직원 등록과 가입 승인 모두 해당 조직의 현재 최대 순번 다음 번호를 자동 부여한다.
- 기존 공장 접두사와 짧은 숫자는 배포 migration에서 제거·정규화한다. 예: `HN-001` → `0001`. 접두사 제거로 같은 조직 안에서 번호가 충돌하면 먼저 생성된 직원이 번호를 유지하고 나머지는 조직 최대 번호 다음 순번을 받는다.
- 사원번호는 조직 내에서 중복될 수 없다.
- 직원의 공장 이동이나 공장 코드 변경은 사원번호를 변경하지 않는다.
- 제조사 `ADMIN`/`OPERATOR`/`ACCOUNTANT`는 실제 공장에 소속될 수도 있고 `factoryId = null`인 운영 지원팀일 수도 있다. `WORKER`만 실제 공장 소속이 필수다.

### 조직 계정 / 로그인 이메일 (2026-07-07부터 `Employee`로 통합, §47 참고)
- **`OrgMembership` 테이블은 더 이상 존재하지 않는다.** 로그인 계정/권한(과거 OrgMembership의 책임)은 이제 `Employee.orgRole`(`OrgUserRole`: ADMIN/OPERATOR/ACCOUNTANT/WORKER)과 `Employee.status`가 담당한다. 제조사든 발주처든 조직 소속 계정은 전부 `Employee` 행 하나로 표현된다.
- `Employee.orgRole`이 `ADMIN`, `OPERATOR`, `ACCOUNTANT`면 로그인 이메일이 필수다.
- `Employee.orgRole`이 `WORKER`면 이메일이 선택이다. 비어 있으면 DB에도 실제로 `NULL`로 저장하며, 가짜 내부 이메일을 만들거나 빈값처럼 숨기지 않는다.
- 소셜 로그인 후 온보딩의 기존 회사 가입 신청은 `Employee.requestedName`/`requestedAt`/`approvedAt`/`approvedBy`에 저장한다.
- `Employee.roleId`(→`AttrRole`)는 `orgRole`과 별개의 축이다 — 현장 직무(감독/봉제/다림/검수/포장 등, 조직별 커스터마이징 가능)를 나타내며 시스템 접근 권한이 아니다. 이름이 비슷해 혼동하지 않는다.
- API 경로 `/org-memberships`와 `orgMembershipId`라는 이름은 하위 호환을 위해 남아있지만 내부적으로는 전부 `Employee`를 가리킨다(추가 DB 마이그레이션 없이 나중에 이름만 정리 가능).
- **인증 소스오브트루스(2026-07-12)**: 백엔드 신원 판별은 `Authorization: Bearer <Supabase access token>` 검증 결과의 이메일만 사용한다. `x-user-email`, `/auth/context?email=...`, 요청 body/query의 이메일을 신원 대용으로 쓰지 않는다.
- `x-org-id`와 쿼리 `orgId`는 "어느 조직을 보려는가"를 고르는 힌트일 뿐이며, 실제 접근 허용 여부는 검증된 토큰 이메일이 그 조직의 활성 `Employee`이거나 `SystemUser.SYSTEM_ADMIN`인지로 다시 판정한다.
- `/auth/context`, `/org-memberships/apply`, `/onboarding/company-requests`, `/organizations` 같은 로그인 진입/온보딩 경로도 익명 이메일 입력으로 우회하지 않는다. 토큰이 없으면 401, 이메일이 토큰과 다르면 403으로 드러낸다.
- `SYSTEM_ADMIN_EMAIL`은 서버 환경변수로만 공급한다. 코드 안의 하드코딩 폴백 이메일은 금지하며, 시스템 관리자 row bootstrap도 서버 설정값이 있을 때만 수행한다.
- 프론트 로그인 화면의 dev bypass / 테스트 계정 패널은 제거했다. 프론트 API 클라이언트는 Supabase 세션의 access token을 자동으로 `Authorization` 헤더에 붙인다.

### WorkLog / WorkRecord
- **WorkLog**: 기간 헤더. `coverageStartDate`(시작), `coverageEndDate`(종료)가 소스오브트루스.
  - `displayDate` (DB 컬럼명 `workDate`, Prisma `@map("workDate")`): 목록 표시/정렬 전용 대표 날짜. 항상 `coverageEndDate`와 동일. **계산 로직 사용 금지.**
  - `lineId`가 스키마 FK 없이 `records` JSON 안에 비정규화 저장됨 (DB 조인 불가 — 구조적 한계).
- **WorkRecord**: WorkLog 하위 상세 행. 한 행 = `(workerId, styleId, styleProcessId, quantity, ctSeconds)`.
  - 작업기록은 색상/사이즈/성별을 구분하지 않는다. AJ2102 흰색 S 100장과 검은색 M 100장처럼 주문 상세가 나뉘어도 작업기록은 해당 스타일/공정에서 만든 총 수량만 기록한다.
  - `ctSeconds`는 해당 작업 상세의 계약 시간이며 성과급 산정 시간 기준이다. 전체 급여나 스케줄러 계획 길이의 기준은 아니다.
  - `effectiveCoverageStartDate/effectiveCoverageEndDate`는 WorkLog 기간과 작업자의 입사일/퇴사일을 교차해 저장한 작업자별 유효 작업기간 스냅샷이다. 월간 입력 중 중도 입사/퇴사자가 있으면 이 범위로 자동 절단하고 WorkLog 비고에 조정 내역을 남긴다.
  - `lineId Int?` 컬럼은 실제로 존재하지만 FK는 없다. `Line` 테이블과 조인 가능한 정규화 관계가 아니라 비정규화 보조 필드다.
  - 같은 작업자가 같은 기간(또는 같은 날) 여러 공정 입력 가능.
  - 스케줄러 연결의 핵심 키는 `WorkRecord.assignmentPlanId`.
  - 실제 생산/ST 매칭의 핵심 키는 `WorkRecord.styleProcessId -> StyleProcess.id -> StyleProcessStandard.bucketStSeconds`다. `processId`는 WorkRecord에 저장하지 않는다.
  - 신규 WorkLog 저장/수정에서는 모든 WorkRecord가 `assignmentPlanId`, `styleId`, `styleProcessId`를 가져야 한다. 연결 없는 작업행은 백엔드에서도 거부한다.
  - 업로드/입력의 `orderNo`, 스타일 코드, 공정 코드는 배정 카드와 `StyleProcess`를 찾기 위한 입력값일 뿐 WorkRecord 저장 컬럼이 아니다.
  - `workerName`, `customerName`, `orderNo`, `styleUid`, `styleName`, `processId`, `processCode`, `colorId`, `colorCode`는 WorkRecord에 재도입하지 않는다. 화면 표시값은 `worker`, `assignmentPlan`, `style`, `styleProcess` relation에서 읽는다.
- **스타일 → 배정 → 작업기록 ST 불변식**:
  - 작업기록은 스타일/공정을 임의로 직접 선택해 만드는 독립 데이터가 아니다. `StyleProcess/StyleProcessStandard` → `AssignmentCard/AssignmentPlan` → `WorkLog/WorkRecord` 순서로만 연결된다.
  - 배정 저장 시 해당 스타일의 모든 공정과 배정 수량 버킷에 유효한 `StyleProcessStandard.bucketStSeconds`가 있어야 `assignmentStTotalSeconds`를 계산할 수 있다. 하나라도 없으면 백엔드가 409로 배정 저장을 거부한다.
  - 작업기록 저장 시에도 실제 `AssignmentPlan`과 그 스타일 공정의 `assignmentPlanId`, `styleId`, `styleProcessId`가 모두 필요하며 누락되면 저장을 거부한다.
  - 따라서 정상 앱 흐름으로 생성된 AT 학습 대상 WorkRecord에는 ST seed가 항상 존재한다. `missingInitialSeedMetricCount`/`ST_BUCKET_SECONDS_NOT_FOUND`는 정상 업무 시나리오가 아니라 레거시 데이터, DB 무결성 훼손, 스키마 드리프트 또는 앱 우회 쓰기를 알리는 불변식 위반 진단이다. 이를 위한 별도 추정 fallback을 만들지 말고 fail-closed로 원인을 드러낸다.
- **급여 계산용**: 공정별로 몇 개 만들었는지 집계. 주문 100장이어도 실제로는 95장 또는 105장 만들 수 있음.

### 급여 정산 월 규칙 (강제)
- 급여는 해당 정산 월이 완전히 끝난 뒤에만 계산·저장한다. 현재 월과 미래 월은 `payroll month not ended`로 거부한다.
- 급여 계산 추가 화면의 기본 정산 월은 직전 월이다.
- 종료된 과거 월은 날짜가 지났다는 이유로 생성·수정·삭제를 막지 않는다. `PayrollSnapshot` 저장 여부와 달력상 월 종료 여부를 같은 `closed` 개념으로 섞지 않는다.
- 급여 스냅샷 저장이 배정의 급여 잠금 기준이므로, 삭제 시 해당 월의 잠금 동기화도 함께 되돌린다.

### WorkLog 날짜 규칙 (강제)
- 계산/판정 로직(스케줄러, 진행도, 완료일 추정)에서는 항상 기간 `[coverageStartDate, coverageEndDate]`를 기준으로 해석한다.
- 작업자별 계산에서는 WorkRecord의 `effectiveCoverageStartDate/effectiveCoverageEndDate`가 있으면 그 범위를 우선 사용한다. 이 값은 WorkLog 기간을 벗어날 수 없다.
- `displayDate`는 UI 목록 표시/정렬 용도로만 사용한다. 계산 로직의 기준 날짜로 절대 사용하지 않는다.
- `coverageEndDate || displayDate` 형태의 fallback 브릿지 로직은 신규 코드에 추가하지 않는다.
- 기간 입력(`coverageStartDate !== coverageEndDate`)은 절대 하루치로 뭉개지면 안 된다.
- 하나의 WorkLog 기간은 같은 달 안에 있어야 한다. 월 경계를 넘는 작업기록은 저장/수정/import를 거부하고 월별 WorkLog로 나눠 등록한다.
- WorkRecord가 AssignmentPlan과 연결되지 않으면(`assignmentPlanId` 없음) 기간이 정확해도 스케줄러/진행도 반영이 불가능하다.
- 작업기록이 이미 연결된 AssignmentPlan은 배정 해제/삭제로 orphan WorkRecord를 만들 수 없다. 연결된 작업기록이 있으면 해당 assignment 제거를 거부한다.
- **2026-07-11 리뷰 확인:** 현재 `lines`/`factories` 삭제 경로 중 일부가 이 원칙을 어기고 `WorkRecord.assignmentPlanId = null` 후 `AssignmentPlan`을 삭제한다. 의도된 예외가 아니라 미해결 버그로 취급한다.

### AssignmentPlan (스케줄 카드)
- 단위: 기본 `주문 × 스타일` (색상/사이즈 단위 미구현)
- `assignmentQuantity`: 계획 수량. §40(2026-07-05)부터 이 값이 항상 "생산한 만큼"과 같다는 보장은 없다 — 주문에서 스타일이 빠지면 작업기록 유무에 따라 0으로 남을 수 있다(아래 "0-수량 오버플로우" 참고).
- `assignmentStTotalSeconds`(물리 컬럼명): 스케줄러 계획 길이 계산에 쓰는 배정카드 전체 ST 총초.
- `assignmentCtTotalSeconds`(물리 컬럼명): 급여/계약 계산에 쓰는 배정카드 전체 CT 총초. 스케줄러 길이 계산에 사용 금지.
- `assignmentCtSnapshot`: assignment 저장 시점의 CT 스냅샷 JSON. `processes[].snapshotCtSeconds`와 `processes[].pieceCtSeconds`는 급여/계약 CT 기준이며, snapshot 안에 ST 복사본을 저장하지 않는다. `PUT /assignment-board-state`는 편집 가능한 배정에 대해 서버가 `AssignmentCard.styleId` FK가 가리키는 라이브 `StyleProcess`/`StyleProcessStandard` 기준으로 CT 스냅샷을 재생성하거나 기존 유효 스냅샷을 보존해야 하며, 그래도 유효한 CT를 만들 수 없으면 저장을 거부한다(조용히 `null` 저장 금지).
- **2026-07-12 적용 완료:** `PUT /assignment-board-state` 저장 경로에서 `preserveExistingAssignmentCtSnapshotsForSave` 우회는 제거됐다. 편집 가능한 assignment는 저장 직전에 서버가 `AssignmentCard.styleId` FK의 라이브 `StyleProcess`/`StyleProcessStandard` 전체를 기준으로 CT snapshot을 다시 조립하고 검증한다. incoming/existing snapshot의 공정 CT를 재사용하는 경우도 `styleProcessId` 일치 또는 현재 `processKey` 일치일 때만 허용한다. 카드/style FK가 없거나, 라이브 공정 전체를 덮는 CT를 만들 수 없거나, 재조립 결과와 현재 payload snapshot이 다르면 409로 저장을 막는다. 프론트 snapshot payload도 `styleProcessId`를 보존하며 더 이상 "현재 snapshot을 못 만들면 기존 snapshot을 통째로 재사용"하지 않는다.
- `isCompleted`: canonical `완료 확정` 플래그다. 운영 보드의 최종 완료 그룹, 읽기 전용 가드, 완료 assignment 판정의 기준으로 쓴다.
- `productionCompletedAt` / `completedAt` / `finalQuantity` / `closedQty` / `closedAt` / `closedBy` / `closeMode` / `closeBasis`: 완료 확정 시점의 수량/날짜 스냅샷이다. 현재 `PATCH /assignment-plans/:externalId/production-complete`는 `REVIEW_REQUIRED` 수량 검토를 마친 뒤 canonical 완료 상태와 이 메타데이터를 함께 기록한다.
- **카드/배정 생성 시점 (§40, 2026-07-05부터)**: `AssignmentCard`/`AssignmentPlan`은 주문을 **저장**할 때가 아니라 **잠글 때**(`POST /orders/:orderId/modification-lock`, `locked:true`) 만들어지거나 갱신된다. 잠기지 않은 주문은 카드가 아예 없다. 해제는 순수 권한 플래그라 카드/배정에 손대지 않는다.
- **0-수량 오버플로우 (§40)**: 주문에서 스타일이 빠졌는데 그 스타일에 이미 `WorkRecord`가 있으면, 카드/배정을 지우지 않고 `assignmentQuantity=0`으로만 낮춘다. 이미 생산된 수량은 전부 `overflowQuantity`(진행률 응답 필드)로 잡힌다. 배정 보드에는 별도 "확인 필요" 경고 섹션에 표시되고, 연결된 모든 작업기록의 월이 급여 잠금되면 자동으로 그 섹션에서 빠진다.

### 배정 상태 의미 (2026-08-14 갱신)
- `IN_PROGRESS` = `진행중`
- `REVIEW_REQUIRED` = `검토 필요`
- `PRODUCTION_COMPLETED` (`isCompleted === true`) = `완료 확정`
- `검토 필요`는 "주문 수량을 넘겼다" 자체가 아니라 **공정별 완료 수량이 서로 안 맞는 짜투리 상태**일 때를 뜻한다. 예: A=101, B=100, C=100이면 `REVIEW_REQUIRED`가 맞다. 반대로 모든 required 공정이 같은 수량으로 끝났고 그 공통 수량이 주문 수량 이상이면(A=B=C=101) `작업 완료`로 본다.
- `완료 확정`은 canonical 최종 완료 상태다. `production-complete` 수동 동작도 검토 결과를 반영해 이 상태를 만든다.
- 2026-07-20 정책: 급여 truth 없이 기존 데이터를 `PRODUCTION_COMPLETED`로 일괄 승격하지 않는다. `completedAt`/`productionCompletedAt` 메타데이터만으로 `완료 확정`을 추론하면 안 된다.

### ⚠️ DB 적용 메모
- 모든 스키마/데이터 변경은 `backend/migration_fix.sql`로 관리. `backend/railway.json`의 `deploy.preDeployCommand`가 `npm run railway:predeploy`를 실행하도록 설정되어 있어야 하며, 배포 로그에서 migration 실행 여부를 확인한다.
- rename 필수 컬럼(`StyleProcess.timesPerPiece`, `StyleProcessStandard.bucketQuantity/bucketStSeconds`, `AssignmentPlan.assignment*`)이 운영 DB에 없으면 백엔드 시작 시 `migration_fix.sql`을 먼저 적용하고 나서 traffic을 받는다. 비상 시 `STARTUP_APPLY_MIGRATION_FIX_ON_SCHEMA_DRIFT=false`로 자동 적용을 끌 수 있다.
- **2026-08-14 현재:** `backend/railway.json`에 `preDeployCommand: npm run railway:predeploy`가 설정돼 있다. 그래도 자동 적용을 막연히 가정하지 않고, 새 컬럼·제약은 `migration_fix.sql`과 runtime schema drift 필수 목록을 함께 갱신하며 배포 후 운영 DB에서 직접 확인한다. 스키마 누락을 레거시 조회로 우회하지 않는다.
- Prisma migration history drift로 `prisma migrate deploy`는 사용하지 않음. `prisma db push` 사용.
- `AssignmentPlan`의 close 관련 컬럼(`closedQty`, `closedAt`, `closedBy`, `closeMode`, `closeBasis`)은 additive SQL로 실DB에 반영됨.
- 시간 컬럼 리네임 (완료):
  - `AssignmentPlan.totalSeconds`/`stSeconds` → `stTotalSeconds`
  - `AssignmentPlan.contractedSeconds` → `ctTotalSeconds`
  - `AtTrainingBucket.totalSeconds` → `laborInputSeconds`
  - `WorkLog.totalContractedSeconds` → `totalCtSeconds`
- ctSnapshot JSON 내부 구 키명 정리 (2026-05-25 완료):
  - `totalAgreedSeconds` → `totalCtSeconds`
  - `totalAgreedPerPieceSeconds` → `totalCtPerPieceSeconds`
  - `agreedAt` / `agreedBy` → `updatedAt` / `updatedBy`
  - `agreedSeconds` / `agreedPerPieceSeconds` → `ctSeconds` / `ctPerPieceSeconds` (공정 행)
  - `ctAgreedSnapshot` → `ctSnapshot` (AssignmentBoardState.assignments 내부)
  - 런타임에서 구 이름을 읽는 fallback은 제거됨. 다만 저장 전 sanitize와 migration SQL은 유지된다. 신규 코드에 구 이름 쓰지 않는다.
- 새 환경 반영 시에는 해당 컬럼과 enum 2개(`AssignmentCloseMode`, `AssignmentCloseBasis`)를 먼저 생성해야 함.

---

## AT 학습 파이프라인

### 작동 방식
1. WorkLog 기간을 기준으로 버킷화하되, 월 집계 앵커는 종료일(`coverageEndDate` = `displayDate`) 사용
2. **Period Spreading**: 드문드문 입력해도 날짜 간격만큼 시간 자동 분산
   - 예) coverageEndDate: 4/1, 4/15, 4/30 → 각각 1일, 14일, 15일 기간으로 처리
3. `laborInputSeconds` = 해당 기간 작업자 출퇴근 실측 합 (없으면 `workerCount × 기본8h × 일수`)
4. 회귀 분석: `laborInputSeconds ≈ Σ(a_i × q_i + b_i)` → 공정별 `a`, `b` 학습

AT 학습의 ST seed는 위 `스타일 → 배정 → 작업기록 ST 불변식`에 의해 보장된다. 학습 로직의 단일 공정 직접 관측이나 다중 공정 fail-closed 처리는 무결성 방어 장치일 뿐, ST 없는 작업기록을 정상 입력으로 허용하거나 보완하기 위한 제품 동작으로 해석하지 않는다.

### 출퇴근 필터 (중요)
- 출퇴근 행이 있고 `workedSeconds`가 확정된 worker-day는 실측값을 사용한다. 명시적인 0초 행은 결근으로 보고 8시간으로 덮어쓰지 않는다. `workedSeconds = null`인 불완전 행은 진단에 남기고 출퇴근 누락과 같은 8시간 대체 정책을 적용한다.
- 출퇴근 행이 없는 유효 근무 worker-day는 기본 8시간을 `laborInputSeconds`에 대체 입력한다. 토요일은 근무일이며 일요일, 조직 휴일, 입사 전, 퇴사 후, 휴직 기간은 대체 대상에서 제외한다.
- 실측 및 8시간 대체 worker-day는 같은 판정 결과로 `eventCount`를 계산한다. 대체 비율은 `attendanceCoverage`/`attendanceFallbackShare`에 반영해 신뢰도를 낮춘다.
- 출퇴근 조회 범위는 학습월 문자열로 자르지 않고, 대상 WorkLog/WorkRecord의 실제 coverage 최소일~최대일을 사용한다.
- AT 출퇴근 매칭은 공장과 무관하게 조직 내 `workerId + workDate`를 사용한다. 같은 worker-day에 공장이 여러 개인 실측 행이 있으면 시간을 합산하며, WorkLog 공장과 다르다는 이유로 8시간 대체하지 않는다.
- `AtTrainingBucket` 단위는 `WorkLog × worker`다. 해당 worker의 `laborInputSeconds`는 그 worker가 기록한 공정에만 배분하며, `attendanceCoverage`도 worker bucket별로 저장한다.
- **2026-07-22 겹치는 worker-day 가드:** 같은 작업자의 같은 유효 근무일을 둘 이상의 WorkLog가 포함하면 어느 WorkLog/공정에 노동시간을 귀속할 정확한 근거가 없다. 처리 순서나 ST 비율로 임의 배분하지 않고 관련 `WorkLog × worker` bucket을 모두 학습에서 제외하며 `ambiguousOverlappingWorkerDayCount`, 제외 bucket/record 수와 샘플을 진단한다.

### 신뢰도 상태
`COLLECTING → UNRELIABLE → INSUFFICIENT → USABLE → TRUSTED → VERIFIED`
`attendanceFallbackShare`(출퇴근 미입력 비율)가 높을수록 신뢰도 하락.

### 2026-07-14 AT sync 운영 메모
- 수동 AT 갱신은 월 단위다. 스타일 화면 버튼은 `/at-sync/run-now`를 `mode: "previous"`로 호출하므로 2026-07-14 기준 대상월은 `2026-06`이다.
- `loadAtTrainingSourceWorkLogs`는 반드시 `WorkRecord.styleProcessId`를 select해서 학습 파이프라인까지 보존해야 한다. 이 값이 빠지면 실제 DB에 공정 FK가 있어도 모든 행이 `PROCESS_NOT_RESOLVED`로 제외된다.
- `AtTrainingBucket`은 수동 갱신의 freshness marker다. `GET /at-sync/status`는 대상월까지의 WorkLog/WorkRecord/Attendance `updatedAt`과 bucket `updatedAt`을 비교하고, 버킷이 최신이면 프론트 AT 갱신 버튼을 비활성화한다.
- 2026-07-14 운영 DB(org 1)에서 2026-06 기준 AT 갱신을 완료했다. `AtTrainingBucket`은 2026-04/05/06에 존재하고, org 1 `StyleProcess.atParams` 451개가 `trainedPeriod = "2026-06"` 상태다.

---

## QC 완료 흐름

```
1. QcReview.jsx: 검수 이력 입력/취소 전용
2. POST /qc-pass-events, PATCH /qc-pass-events/:id/cancel
3. AssignBoard.jsx 상세 드로어(handleConfirmProductionComplete): PATCH /assignment-plans/:externalId/production-complete 호출
4. 백엔드 completeAssignmentPlanProduction: 완료 메타데이터(`productionCompletedAt`, `closedQty`, `close*`) 기록 + `isCompleted=true`/`scheduleStatus=PRODUCTION_COMPLETED` 확정 + 일정/진행도 스냅샷 동기화
5. `READY_TO_COMPLETE` 중간 상태는 생성하지 않는다
```

### Task 1 관련 상태
- 기존 `/assignment-plans/:externalId/complete` 기반 QC hard block 시나리오는 현재 코드 경로에서 사용되지 않음.
- 현재 완료 경로(`/assignment-plans/:externalId/production-complete` → `completeAssignmentPlanProduction`)에는 `producedQuantity < finalQuantity` 하드 블록이 없음.
- `QcReview.jsx`는 검수 이력(`qc-pass-events`) 전용이며, 생산 완료 확정은 배정 보드(`AssignBoard.jsx`) 상세 드로어에서 수행한다 (2026-06-16 이전).

---

## 스케줄러 로직 분석 결과

### 이미 구현돼 있는 것
- **미배정 카드 표시**: `buildAssignmentCardsFromOrders`가 **잠긴** 주문의 카드를 생성한다(§40, 2026-07-05부터 — 예전엔 모든 주문이었으나 지금은 잠금 시점에만 생성됨). 미배정 카드는 보드 풀(pool)에 남아 있어 눈으로 확인 가능.
- **생산 완료 반영**: `completeAssignmentPlanProduction`이 `syncAssignmentSchedulesFromWorkRecordPlans` 및 `persistAssignmentPlanProgressSnapshot`을 호출해 완료 상태와 일정 정보를 갱신.
- **라인 균형**: 시각적으로 보드에서 확인 가능 (별도 지표 불필요).
- **`progressPercent` 필드**: `/assignment-plan-progress` 응답에 포함되며, 현재는 `sum(WorkRecord.quantity) / (planQuantity × processCount)` 공식으로 계산.
- **작업기록 총량 집계**: 진행도 계산 함수(`buildAssignmentPlanProgressRows`)에서 plan별 총 작업량 집계가 가능.
- **라인-월 capacity 보드**: `AssignBoard.jsx` 기본 뷰는 line-month capacity summary이며, 계획 ST는 현재 보드 assignment를 기준으로 월별 분배하고 실제 산출은 `/line-month-capacity`가 WorkLog 기간과 WorkRecord를 기준으로 집계한다.
- **rolling forecast 기준**: line-month 보드의 forecast load/carry는 저장된 예전 assignment range가 아니라 **현재 보드의 미완료 assignment queue**와 `remainingStTotalSeconds`를 기준으로 다시 계산한다. 따라서 현재 보드에서 라인 queue가 0건이면 forecast load도 0이어야 한다.
- **forecast anchor 규칙**: line-level forecast 시작점은 `nextWorkingDay(lastActualCoverageEndDateKey)`다. 아직 actual WorkLog가 하나도 없으면 fallback은 `today` 또는 그 다음 working day다. 기본 working day는 월~토, 일요일과 휴일관리 날짜만 제외한다.
- **anchor month 의미**: actual이 있는 과거 month는 history다. anchor month와 미래 month는 현재 남은 backlog를 앞으로 capacity에 fill-forward 한 rolling forecast다. 6월 capacity를 먼저 채우고 초과분은 7월, 다시 초과하면 8월로 carry한다.
- **과거(historical) month의 "계획 부하"는 forecast 공식을 쓰지 않는다(§41, 2026-07-05)**: 이미 닫힌 달은 "남은 backlog를 채운다"는 개념 자체가 성립하지 않는다 — 그 달에 못 채운 건 자동으로 다음 열린 달의 carry-in으로 넘어가기 때문이다. 그래서 과거 달의 "계획 부하"는 같은 달의 `actualOutputPercent`(실제 생산률)를 그대로 따른다. 예전엔 과거 달을 무조건 100%로 하드코딩했던 버그가 있었다 — 실데이터와 무관하게 100%가 나와 배정이 하나도 없어도 "잔여 데이터가 남아있다"는 오해를 유발했다.
- **anchor month 퍼센트 규칙**: anchor month의 `forecast load percent` 분모는 그 달 전체 capacity가 아니라 **anchor 이후 남은 forecastAvailableCapacitySeconds**다. 예: `2026-06-10~2026-06-30` 구간을 꽉 채우면 6월 cell은 `100%`로 보이고, 보조 문구로 `2026-06-10~2026-06-30` 범위를 함께 보여준다.
- **UI 최소 정보 원칙**: 라인 요약 행은 `라인명`, `인원`, `배정 작업 수(완료 제외)`, `완료 예상 시점`만 우선 표시한다. 월 cell의 carry는 시간(hours)이 아니라 **다음으로 넘어가는 날짜**로 표시한다.
- **세로형 drag/drop 작업 목록**: 라인 대기 작업과 미배정 작업은 각각 `카드 1개 = 전체폭 1행`으로 세로 스택한다. 카드에는 이미지, 고객사, 주문번호, 스타일, 수량, 진행도를 우선 표시한다.
- **배정 취소 전용 drop zone**: 운영 화면에서 `배정 취소`는 별도 박스가 아니라 라인 용량 영역과 미배정 작업 영역 사이의 세로 선으로 표시한다. 배정 카드를 드래그 중일 때는 그 선의 오른쪽 전체(미배정 작업 패널 포함)가 취소 drop zone이며, 그 안에 놓으면 미배정으로 돌아간다. 작업기록이 연결된 assignment는 취소할 수 없다.
- 라인 대기 작업 사이의 순서 변경 drop slot은 평소 `+` 박스를 노출하지 않고 얇은 여백으로 유지하며, drag over 상태에서만 삽입선을 강조한다. 배정 카드를 미배정 작업 패널 위에 실수로 drop했을 때 라인 맨 아래 삽입으로 해석되면 안 되고, 오른쪽 취소 영역으로 우선 판정되어야 한다.
- **직렬 타임라인 비노출**: 기존 `ScheduleTimeline`과 프론트 reflow 코드는 내부 호환을 위해 남아 있을 수 있지만, 운영 화면의 기본 배정 UX로는 사용하지 않는다.

### 2026-06-09 Assignment Forecast Latest Lock
- line-month board의 forecast는 저장된 `AssignmentPlan.startDate/endDate` range가 아니라 **현재 보드의 active assignment queue**를 기준으로 다시 계산한다.
- 따라서 현재 보드에서 특정 line의 active queue가 0건이면 forecast load도 0이어야 한다.
- line-level actual history는 저장된 WorkLog/WorkRecord를 기준으로 유지하고, future forecast만 현재 보드 backlog로 재시뮬레이션한다.
- forecast backlog 입력값은 `remainingStTotalSeconds`다. partially worked assignment도 original planned ST가 아니라 remaining ST만 future forecast에 기여한다.
- actual이 하나도 없는 line의 default forecast anchor는 `today` 또는 그 다음 working day다. actual이 있으면 `nextWorkingDay(lastActualCoverageEndDateKey)`를 사용한다.
- anchor month의 `forecast load percent` 분모는 full-month capacity가 아니라 **anchor 이후 남은 `forecastAvailableCapacitySeconds`**다. 예: `2026-06-10~2026-06-30` 구간을 꽉 채우면 anchor month는 `100%`로 보여야 한다.
- anchor month 보조 문구는 `Forecast from {date}`보다 실제 forecast window range (`2026-06-10~2026-06-30`)를 우선 표시한다.
- carry는 hours가 아니라 **다음으로 넘어가는 날짜**로 보여준다. 의미는 “그 달 capacity로 다 못 끝낸 backlog가 실제로 다음에 이어서 시작되는 예상 date”다.
- 라인 요약 행의 최소 표시 정보는 `라인명`, `인원`, `배정 작업 수(완료 제외)`, `완료 예상 시점`이다.
- anchor month 윗줄은 `이번달 배정된 작업`과 line-level `완료 예상`을 함께 보여준다.
- 아랫줄은 `이번달 누적 생산`이며, 오른쪽에는 해당 월 산출에 반영된 연결 작업기록의 마지막 `coverageEndDate`를 `기록 기준 YYYY-MM-DD`로 보여준다.
- 해당 월 산출에 반영된 연결 작업기록이 없으면 아랫줄 날짜 자리에 `최근 기록 없음`을 보여준다. 이 월별 날짜는 forecast anchor용 line-global `latestActualCoverageEndDateKey`와 별도 값으로 유지한다.
- `lineFreeDateKey`와 line-level ETA는 현재 queue 정렬(`startIndex/endIndex` + source order)에 기대는 추정값이다. DB canonical `queuePosition`이 아직 없으므로 card-level exact ETA보다 **line-level rough ETA**로 해석한다.
- `ready_to_complete`는 canonical completed가 아니다. backlog/queue에서는 active로 남고, `isCompleted === true`가 되기 전까지 finished로 보내지 않는다.
- ST missing assignment는 forecast에서 제외하고 warning만 준다. 따라서 line-level forecast는 과소 추정될 수 있으며, `stUnknownAssignmentCount` 경고를 함께 봐야 한다.
- 관련 핵심 파일:
  - backend: `backend/src/index.ts` (`/line-month-capacity`, anchor date, forecastLoadPercent)
  - frontend util: `frontend/src/pages/App/assign/utils/lineMonthCapacity.js`
  - frontend UI: `frontend/src/pages/App/assign/components/LineMonthCapacityBoard.jsx`
  - docs: `AGENTS.md`

### 현재 이슈 분류 가드레일 (중요)
- WorkLog 기간 입력이 존재하는데도 카드가 밀리거나 길이가 비정상 변경되면, 1차 의심 지점은 날짜 저장이 아니라 **렌더/재배치 로직(C+D)** 이다.
- WorkLog/WorkRecord 날짜 해석 이슈와 프론트 reflow/render-range 이슈를 분리해서 진단한다.
- 미완료 카드는 저장된 계획 좌표(`startIndex/endIndex`, 부분일 퍼센트)를 유지한다. progress API의 `renderStartDate/renderEndDate`는 미완료 카드 좌표에 반영하지 않는다.
- `ScheduleTimeline`은 `useRenderDateRange === true`인 완료 카드에만 render index/date range를 적용한다.
- WorkLog 저장으로 보드/플랜 스케줄 좌표를 직접 변경하는 동기화는 기본 비활성이다. 운영에서 의도적으로 켜려면 `ENABLE_WORKLOG_SCHEDULE_SYNC=true`가 필요하다.
- 생산 완료 시 보드/플랜 스케줄 좌표를 직접 변경하는 동기화도 기본 비활성이다. 의도적으로 켜려면 `ENABLE_PRODUCTION_COMPLETE_SCHEDULE_SYNC=true`가 필요하다.
- 디버깅 순서:
  1. `WorkRecord.assignmentPlanId` 연결 유효성 확인
  2. progress API의 `renderStartDate/renderEndDate`가 미완료 카드에 과적용되는지 확인
  3. AssignBoard reflow에서 완료 카드가 queue로 재배치되는지 확인
- **2026-07-11 통합 리뷰 기준 남은 우선순위**
  1. 인증/조직 컨텍스트를 클라이언트 헤더가 아니라 서버 검증 토큰 기준으로 전환
  2. 라인/공장 삭제에서 orphan `WorkRecord` 생성 금지
  3. 미완료 assignment 일반 저장에도 optimistic locking 추가
  4. `AssignBoard.jsx`의 `getTodayDayIndex` 범위 밖 fallback `0` 수정
  5. 프론트 synthetic card fallback(`cardId`/`originOrderId` 파싱 기반 카드 재구성) 제거

---

## 코딩 명세 (태스크 상태)

### Task 1: QC 완료 hard block 제거
- 상태: **해소됨 (구조 변경)**
- 근거:
  - 생산 완료 엔드포인트는 `PATCH /assignment-plans/:externalId/production-complete`
  - 완료 처리는 `completeAssignmentPlanProduction`이 담당
  - QC 화면(`QcReview.jsx`)은 검수 이력(`qc-pass-events`) 전용이며 완료 버튼 경로를 사용하지 않음
  - 현재 완료 경로에는 `producedQuantity < finalQuantity` 하드 블록이 없음

### Task 2: 진행도 계산 공식 변경
- 상태: **과거 구현 기록 — 현재 정확 계산/ST 스냅샷 정책으로 대체됨**
- 아래 `ctSnapshot`/작업기록 공정 수 fallback 설명은 현재 구현 지침이 아니다. 현재 코드는 정확한 `styleProcessId`와 동결된 ST 근거가 없으면 미계산 진단으로 드러내며, 이 fallback을 재도입하지 않는다.
- 반영 내용:
  - 함수: `backend/src/index.ts`의 `buildAssignmentPlanProgressRows`
  - `progressPercent`를 `sum(WorkRecord.quantity) / (planQuantity × processCount) × 100`으로 계산
  - `processCount`는 `ctSnapshot.processes.length` 우선, 파싱 실패/부재 시 작업기록의 공정 수로 fallback
  - `isCompleted` 또는 `completedAt`이 있으면 `progressPercent = 100`
  - `totalExpected`가 없거나 0이면 `progressPercent = null`
  - 최대 100으로 clamp
  - `producedQuantity`(Math.min 기반)는 기존 로직 유지

### Task 3: 스케줄 카드 배경 진행도 표시
- 상태: **완료**
- 반영 내용:
  - `AssignBoard.jsx`에서 `/assignment-plan-progress` 응답을 plan id 기준으로 카드 데이터에 매핑
  - 카드 렌더러(`assign/components/AssignBar.jsx`)에 진행도 배경 오버레이 추가:
    - 조건: `progressPercent > 0 && !isCompleted`
    - 스타일: `position: absolute`, `width: ${progressPercent}%`, `backgroundColor: rgba(255,255,255,0.25)`, `zIndex: 0`
  - 완료 카드(`isCompleted`)는 오버레이 없이 기존 완료 스타일 유지

---

## 구조적 문제 (우선순위순)

| # | 문제 | 위치 | 영향 |
|---|---|---|---|
| 1 | `WorkLog.records` JSON 내부 `lineId`는 FK 없이 비정규화 저장됨 (해소됨: `WorkRecord.lineId`는 이미 `Line`에 대한 실제 FK다 — `"WorkRecordLine"` relation, `schema.prisma`) | `backend/prisma/schema.prisma` | WorkLog 레벨 라인 조인은 여전히 JSON 파싱 필요, WorkRecord 레벨은 정규 JOIN 가능 |
| 2 | 재배치 로직이 프론트에 있음 | `frontend/src/pages/App/assign/AssignBoard.jsx` | 서버 이벤트에 자동 반응 불가 |
| 3 | 소스오브트루스 이중화 | 여러 곳 | WorkLog.records vs WorkRecord, ctSnapshot 등 |
| 4 | 실행 엔티티 부재 | — | 시작/중단/완료 이벤트 모델 없음 |

---

## 현재 상황 (2026-07-05 기준, 이 섹션은 자주 갱신할 것 — 오래되면 날짜만 보고도 신뢰하지 말 것)

- 2026-07-03 운영 데이터 삭제 사고(§39) 이후 `AssignmentPlan`/`AssignmentCard`가 전체 조직 0건 상태에서 복구 중. `WorkOrder`/`WorkOrderItem`/`Style`은 살아있음.
- 카드/배정 생성 로직을 저장 시점 → 잠금 시점으로 재설계(§40)했고, 이 재설계에 실제 버그가 있어 디버깅 진행 중(진단 로그 배포함, Railway 로그 대기 중 — todo.md 최신 항목 참고).
- 과거(4월) 데이터 입력은 이미 끝났고 지금은 운영 단계 — "최초 입력 중" 문구는 더 이상 유효하지 않음.
- 병렬 생산(라인에서 A+B 동시 작업)은 AT 추정에 문제 없음. 스케줄은 순차 계획이지만 현실은 병렬 — 이 특성 자체는 변하지 않음.

---

## 주요 파일 위치

| 역할 | 파일 |
|---|---|
| AT 계산/신뢰도 유틸 | `frontend/src/utils/processTime.js` |
| AT 학습 파이프라인 | `backend/src/index.ts` 내 AT 학습/동기화 로직 |
| 생산 완료 엔드포인트 | `backend/src/index.ts`의 `/assignment-plans/:externalId/production-complete` |
| 작업기록 저장 엔드포인트 | `backend/src/index.ts`의 `/work-logs` 저장/수정 라우트 |
| 스케줄 재배치 (프론트) | `frontend/src/pages/App/assign/AssignBoard.jsx` 내 스케줄 재배치 로직 |
| 진행률 계산 | `backend/src/index.ts`의 `buildAssignmentPlanProgressRows` |
| DB 스키마 | `backend/prisma/schema.prisma` |
| API 클라이언트 | `frontend/src/utils/apiClient.js` |
| 테스트 리셋 스크립트 | `backend/scripts/reset-to-baseline.js` |

---

## 기술 스택

### 프론트엔드
- React 19, React Router 7, Vite 7, MUI 7
- Drag & Drop: `@dnd-kit/core`, `@hello-pangea/dnd`
- 상태/컨텍스트: `AuthContext`, `AppContext`, `LanguageContext`
- 데이터 호출: 공통 `requestJSON` 래퍼 (캐시, 요청 스코프, 로딩 추적)

### 백엔드
- Express 5 (TypeScript), Prisma 6 + PostgreSQL
- 대형 `index.ts` + 일부 도메인 라우터 모듈 분리 구조

### 인증/인프라
- Supabase Auth (Google OAuth), Railway 배포 (프론트/백/DB 분리 서비스)
- 운영 DB와 Supabase 혼동 주의: 파일 최상단 "⚠️ DB 접속 전 필독" 참고.

---

## 프론트엔드 아키텍처

### 라우팅 (`frontend/src/router.jsx`)
보호 라우트: `ProtectedRoute` 사용. 주요 경로:
- `/workspace`, `/assignment`, `/work-history`, `/work-history-monthly`
- `/attendance`, `/payroll`, `/style`, `/order`, `/customer`
- `/line`, `/business`, `/employee`, `/profile`, `/holiday`
- 비활성화(메뉴에서 숨김): `/production-plan`, `/st-review`, `/shipment-review`, `/inventory`

### 구독 관리 접근 규칙
- `/system-setting`의 구독 관리 화면과 메뉴는 `entryType=SYSTEM`이면서 `systemRole=SYSTEM_ADMIN`인 시스템 운영 계정에만 노출한다.
- 조직 계정의 역할별 접근 정책에는 `SUBSCRIPTION`을 포함하지 않으며, 저장된 과거 정책에 값이 남아 있어도 직접 URL 접근을 허용하지 않는다.
- 구독 조회/변경 API(`GET/PATCH /organizations/:id/subscription`)도 `requireSystemAdmin` 검사를 유지한다.

### API 클라이언트 (`frontend/src/utils/apiClient.js`)
- Supabase access token을 `Authorization: Bearer`로 자동 부착한다. `x-org-id`는 대상 조직 선택 힌트로만 붙이며 권한 근거가 아니다. `x-user-email`은 보내지 않는다.
- GET 응답 캐시(TTL 기본 45초) + 중복 요청 합치기
- mutation 후 경로 단위 캐시 무효화
- `createHttpError` 구조: 서버 응답 전체가 `error.details`에 담김

### 화면 동기화
- `workspaceDataEvents` + `useWorkspaceRefreshOnEvent`: 브라우저 CustomEvent 기반
- 서버 push(WebSocket/SSE) 없음 — 다른 사용자 변경은 재조회 시점에만 반영

### 다국어
- 지원: `ko`, `en`, `vi`
- `uiMessages`, `staticOptionRegistry`로 텍스트 중앙 관리

---

## 백엔드 아키텍처

### 도메인 라우팅
모듈 라우터: `organizations`, `org-memberships`, `employees`, `factories`, `lines`, `payroll`  
나머지는 `index.ts` 직접 라우트.

### 접근 제어 (`middleware/access.ts`)
- 구독 상태(`TRIAL`, `ACTIVE`, `GRACE`) 기반 워크스페이스 접근 제어
- `entryType` 분기: `SYSTEM` / `ORG` / `ONBOARDING`
- 조직 역할별 메뉴 접근 정책은 `SystemSetting`의 `ROLE_ACCESS_POLICY`에 공용 저장한다.
- `GET/PUT /system/access-policy`는 시스템 관리자만 사용하며, `/auth/context`가 현재 정책을 각 조직 계정에 전달한다.
- 프론트의 사이드바와 보호 라우트는 같은 `accessPolicy`를 사용한다. 정책 조회와 `/auth/context`는 계정 전환 및 저장 직후 반영을 위해 GET 캐시를 사용하지 않는다.
- `생산 분석`(`/production-analysis`)과 `작업 기록`(`/work-history`)은 별도 권한 항목이다. 각각 `PRODUCTION_ANALYSIS`, `WORK_HISTORY` feature key를 사용하며, 접근 권한 화면에서 함께 토글되면 안 된다.
- `수익 분석`(`/revenue-analysis`)과 `사업체`(`/business`)도 별도 권한 항목이다. 각각 `REVENUE_ANALYSIS`, `BUSINESS` feature key를 사용하며, 접근 권한 화면에서 함께 토글되면 안 된다.
- 직원 등록/수정, 가입 승인/반려, 퇴사/재입사 같은 직원 관리 mutation API도 역할명 하드코딩이 아니라 `ROLE_ACCESS_POLICY`의 `EMPLOYEE` 권한을 사용한다.
- 직원 관리의 신규 추가는 `/org-memberships` 생성 시 employee 기본정보(이름, 공장, 직무, 급여 타입, 사번, 입사/퇴사일)를 함께 저장한다. 빈 draft row 정리용 삭제는 이름 등 핵심 프로필이 비어 있고 출퇴근/라인배정/작업기록이 없는 membership+employee 쌍에만 허용한다.
- 접근 권한 화면의 메뉴 트리는 `MainLayout`의 실제 SaaS 메뉴 blueprint를 사용하므로 그룹, 순서, 메뉴명, 비활성 상태와 현재 언어를 그대로 반영한다.

### 감사 필드
- `AsyncLocalStorage`로 요청 주체 추적, Prisma extension으로 `createdBy`/`updatedBy` 자동 주입

### 헬스체크
- `GET /health`: 프로세스 상태
- `GET /ready`: 준비 완료 전 503
- DB 연결 실패 시 재시도 (`STARTUP_DB_MAX_RETRIES` 기본 5)

---

## 핵심 API 맵

| 영역 | 엔드포인트 |
|---|---|
| 인증 | `GET /auth/context` |
| 조직/멤버십 | `GET/POST /organizations`, `PATCH /organizations/:id/subscription`, `GET/POST /org-memberships` |
| 인사/라인 | `GET/POST /employees`, `GET/POST /factories`, `GET/POST /lines`, `POST /line-assignments/assign\|unassign` |
| 주문/스타일 | `GET/POST/PUT/DELETE /orders`, `POST /orders/:orderId/modification-lock`(§40 — 잠글 때만 카드/배정 동기화), `GET/POST/PUT/DELETE /styles`, `POST /styles/import` |
| 배정 | `GET /assignment-plans`, `PATCH /assignment-plans/:externalId/production-complete`, `PATCH /assignment-plans/:externalId/final-quantity`, `GET /assignment-board-view`, `GET /assignment-cards`, `GET /line-month-capacity` |
| 배정 (deprecated) | `POST /assignment-plans/:externalId/close` (`production-complete`로 내부 위임, Deprecation 헤더 반환) |
| 검수 이력 | `GET /assignment-plans/:externalId/qc-history`, `POST /qc-pass-events`, `PATCH /qc-pass-events/:id/cancel` |
| 작업기록 | `GET/POST/PUT/DELETE /work-logs` |
| 출퇴근 | `GET/PUT /attendance-entries` |
| 급여 | `GET /payroll`, `POST /payroll/lock`, `DELETE /payroll/snapshots/:month` |
| 시스템 | `GET /system/onboarding-requests`, `PATCH /system/company-requests/:id/approve\|reject` |
| AT 동기화 | `POST /at-sync/run-now` |

---

## 환경 변수

### 프론트 `.env`
- `VITE_API_BASE_URL`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `VITE_CANONICAL_ORIGIN`
- `VITE_ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT`
- `VITE_APP_VERSION`

### 백엔드 `.env`
- `DATABASE_URL`, `DIRECT_URL`
- `PORT`
- `BUSINESS_TIME_ZONE`
- 코드 기본 보정: `DIRECT_URL ||= DATABASE_URL`, `PRISMA_CLIENT_ENGINE_TYPE ||= "binary"`
- `WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER`는 `.env.example`에만 있고 실제 코드 어디서도 읽지 않는 죽은 설정이다(2026-07-05 grep으로 확인). 실제로 작업기록 수량이 배정 수량 대비 초과되는 걸 막는 코드는 없다.
- `Factory.managementStartDate`는 스케줄러/계획부하 계산과 무관하다. 작업기록 엑셀 임포트 시 "이 날짜 이전 데이터는 거부"하는 검증에만 쓰인다(2026-07-05 확인). 스케줄 계산의 유일한 기준점은 §25/§34의 anchor(마지막 실제 작업기록 다음 근무일)다.

---

## 기능 상태

| 영역 | 상태 |
|---|---|
| 로그인/권한/온보딩 | 운영 가능 |
| 조직/멤버십/구독 | 운영 가능 |
| 주문/스타일/고객 | 운영 가능 |
| 라인/작업자 배치 | 운영 가능 |
| 배정 보드 | 운영 가능 (고도화 중) |
| 작업기록(일/월) | 운영 가능 |
| 출퇴근 | 운영 가능 |
| 급여 | 운영 가능 |
| 재고 | 프로토타입 |
| ST Review / Shipment Review | 플레이스홀더 |
| 생산계획 보드 | 코드 구현됨, 메뉴 비활성화 |
| 대시보드 | 플레이스홀더 |
| 휴일 관리 | `/holidays` API와 `OrganizationHoliday` 관계형 행이 소스오브트루스. localStorage는 1회 이전 후 삭제하는 레거시 입력만 읽음 |

---

## 테스트 기준 데이터 (Baseline v1.9)

- Baseline ID: `test-baseline-v1.9` (Captured: 2026-03-10)
- 단일 진입점: `backend/scripts/reset-to-baseline.js`
- 별도 seed/reset 스크립트 추가 금지

### 계정
- 시스템 관리자: `system-admin@test.local` (리셋 시 보존)
- TSMF 조직: `manufacturer-admin/operator/accountant@test.local`
- TSBR 조직: `brand-admin/operator/accountant@test.local`
- 작업자: `line1-worker01~20@baro.local`, `line2-worker01~20@baro.local` (각 라인 20명)

### 기준 데이터
- 공장: `Sample Factory` (목표 월급: 8,000,000 VND, 초당 10.68 VND)
- 라인: `Sample Line 1`, `Sample Line 2`
- 스타일 3개: `25SS-T001` (공정 8개), `25SS-P002` (9개), `25FW-J003` (10개)
- 공정: `P01~P10`
- 컬러: WHITE, BLACK, NAVY, GRAY-MEL, LT-BLUE, MID-BLUE, INDIGO
- 리셋 시 WorkOrder/AssignmentCard/AssignmentPlan 삭제, WorkLog/WorkRecord는 보존
- 리셋 스크립트는 `WorkOrder`를 새로 만들지 않는다(직접 확인, `reset-to-baseline.js`에 관련 코드 없음). §40(2026-07-05)부터 카드는 주문을 **잠글 때만** 생성되므로, 리셋 후 배정 보드에서 카드를 보려면 테스트용 주문을 만든 뒤 반드시 잠가야 한다 — 저장만으로는 더 이상 카드가 생기지 않는다.

### 회귀 테스트
```
npm run test:time-date
npm run test:regression
```
- `test:quantity-change`(`scripts/quantity-change-regression.test.mjs`, 대상 `frontend/src/utils/quantityChangeBoard.mjs`)는 2026-07-08 삭제했다. §39에서 프로덕션 호출부(`OrderList.jsx`의 이중 저장 경로)가 제거된 뒤 계속 죽은 코드/테스트로 남아 있었고(§39/§45/§46/todo.md에 반복 기록), 테스트 자체도 ST bucket 없이 공정의 `pt` 값만으로 카드 status가 `'ST'`가 되길 기대해 이 문서의 ST/PT/CT 분리 원칙과 어긋났다. `package.json`의 `test:quantity-change` 스크립트와 `test:regression`의 참조도 같이 제거했다.

---

## Railway 배포

### 구조
- `backend` 서비스: Root Directory `/backend`, Config `/backend/railway.json`, Healthcheck `/health`
- `frontend` 서비스: Root Directory `/frontend`, Config `/frontend/railway.json`, Healthcheck `/health`
- DB: Railway Postgres
- Auth: Supabase Auth

### 주의사항
- `DATABASE_URL`과 `DIRECT_URL`은 Railway Postgres 연결 문자열 또는 Railway variable reference로 설정
- Prisma 스키마는 `DIRECT_URL` 기준 동작
- Railway 도메인 Target Port는 수동 고정하지 말고 기본 감지값 사용
- `VITE_*` 값은 빌드 시점에 포함 → 변경 시 프론트 재배포 필요

### 502 트러블슈팅 순서
1. `/backend/railway.json` 적용 확인
2. 배포 로그에서 `API running on http://0.0.0.0:<PORT>` 확인
3. `https://<backend-domain>/health` → `{"ok":true}` 확인
4. `VITE_API_BASE_URL` 맞추고 프론트 재배포

---

## 기술 부채

1. `backend/src/index.ts` 단일 파일 비대화 — 도메인 경계 흐림
2. 실시간 동기화 부재 — 다중 사용자 동시 편집 시 서버 push 없음
3. 휴일 관리의 레거시 localStorage 이전 경로는 운영 브라우저 데이터가 모두 이전된 뒤 제거 가능
4. 플레이스홀더 다수 — 권한, 검토 화면 미완성

---

## 유지보수 체크리스트

기능 변경 시 최소 확인:
- 권한: `SYSTEM / ORG / ONBOARDING` 분기 영향
- 구독 상태: `TRIAL/ACTIVE/GRACE/SUSPENDED` 접근 영향
- 캐시: `apiClient` 무효화 맵 반영 여부
- 다국어: `ko/en/vi` UI 메시지 누락 여부
- 데이터: Prisma schema/마이그레이션/리셋 스크립트 동기화
- 회귀: `test:regression` 통과 여부
- 문서: `AGENTS.md` 업데이트 여부
- 배포 준비: 변경 후 검증 결과를 확인하고, 관련 변경분을 커밋한 뒤 원격 브랜치에 푸쉬한다.
- **커밋/푸쉬 자동화 (2026-07-09 사용자 확정)**: 이 저장소에서는 코드 변경(버그 수정, 기능 추가 등)을 완료하고 검증(빌드/테스트)까지 통과하면, 커밋과 `git push`를 사용자에게 다시 물어보지 않고 바로 수행하는 것이 표준 절차다. 매번 "커밋/푸쉬 할까요?"라고 재확인하지 않는다. 단, 아래는 여전히 예외로 확인 후 진행한다:
  - `git push --force`, `git reset --hard`, 브랜치/커밋 삭제 등 되돌리기 어려운 파괴적 작업
  - 원인 분석만 요청받았거나 사용자가 명시적으로 "커밋하지 마"/"제안만 해봐"라고 한 작업
  - main이 아닌 다른 브랜치 전략(PR 생성 등)이 필요할 수 있는 큰 변경

---

## Time Naming Examples

### 핵심 규칙
- `quantityBucket`: ST 조회용 수량 버킷 key다.
- `timesPerPiece`: 공정을 설명하는 메타데이터다. 예: `주머니 달기 2회`, `May miệng túi x2`.
- `standardProcessStSeconds`: 스타일 표준표에서 조회한 공정 row 전체의 1장 기준 ST다.
- `snapshotProcessCtSeconds`: assignment snapshot에 저장된 공정 row 전체의 1장 기준 CT다.
- `resolvedProcessStSeconds`: 화면/저장 직전 실제 계산에 사용되는 공정 row 전체의 1장 기준 ST다.
- `pieceStTotalSeconds`: 한 벌 기준 전체 ST 합이다.
- `pieceCtTotalSeconds`: 한 벌 기준 전체 CT 합이다.
- `assignmentStTotalSeconds`: assignment 전체 수량 기준 ST 합이다.
- `assignmentCtTotalSeconds`: assignment 전체 수량 기준 CT 합이다.
- `cardStTotalSeconds`: card 전체 수량 기준 ST 합이다.

### 예시 1: 반복횟수가 이름 안에 들어간 공정
- 공정명: `주머니 달기 2회`
- `timesPerPiece = 2`
- `standardProcessStSeconds = 500`

이 의미는 아래와 같다.
- `주머니 달기 2회`라는 공정 row 전체가 1장 기준 `500초`
- 계산은 `500 × 수량`
- 계산을 `500 × 2 × 수량`으로 하면 안 된다

### 예시 2: 선택 방식 공정
- 대상=`주머니`
- 동작=`달기`
- 반복횟수=`2`
- `standardProcessStSeconds = 500`

이 의미는 아래와 같다.
- `주머니 + 달기 + 2회` 조합 전체가 공정 row 하나다
- `500초`는 그 row 전체의 1장 기준 시간이다
- 반복횟수는 표준화/번역/표현용 메타데이터이며 ST/PT/CT에 다시 곱하지 않는다

### 예시 3: 한 벌 기준 ST 합
- 공정 A: `12초`
- 공정 B: `주머니 달기 2회`, `500초`
- 공정 C: `8초`

이때 한 벌 기준 합은 아래와 같다.
- `pieceStTotalSeconds = 12 + 500 + 8 = 520초`

### 예시 4: assignment 전체 ST 합
- `pieceStTotalSeconds = 520초`
- assignment 수량 = `100장`

이때 assignment 전체 합은 아래와 같다.
- `assignmentStTotalSeconds = 520 * 100 = 52000초`

### 예시 5: split 정책
- `100장` card를 `60장`, `40장`으로 split하면
- 각 assignment는 자기 수량 버킷 기준 ST를 다시 조회해 계산한다
- 단, 공정 row 시간 자체를 `timesPerPiece`로 다시 곱하지는 않는다

### 예시 6: CT의 의미
- 사용자가 CT를 안 바꾸면 `snapshotProcessCtSeconds = resolvedProcessStSeconds`
- 사용자가 급여 보정을 위해 CT를 올리면 그 공정 row 전체 CT만 바뀐다
- CT를 올려도 ST 표준값 자체가 바뀌는 것은 아니다

### 예시 7: AT의 의미
- 공정 AT 모델: `AT(q) = a*q + b`
- AT도 반복횟수 메타데이터를 다시 곱하는 모델이 아니다
- 실제 작업기록으로 학습된 공정 row 전체 시간 모델이다

### 신규 문서/리뷰에서 피할 이름
- `totalSt`
- `totalSeconds`
- scope 없는 `process.quantity`

대신 아래처럼 쓴다.
- `cardStTotalSeconds`
- `assignmentStTotalSeconds`
- `pieceStTotalSeconds`
- `timesPerPiece`

---

## 2026-06-04 Time Quantity Latest Lock

이 섹션은 시간/수량 개념에 대한 최신 잠금 규칙이다.
위 문서의 예전 예시나 과거 구현 메모와 충돌하면 이 섹션을 우선한다.

### 1. `quantity`는 하나가 아니다

반드시 아래 축을 분리해서 읽는다.

- `timesPerPiece`
  - 공정을 설명하는 메타데이터다.
  - 예: `주머니 달기 2회`, `May miệng túi x2`
  - 시간 계산 변수로 다시 곱하지 않는다.

- `bucketQuantity`
  - ST 표준 조회용 수량 버킷 key다.
  - 예: `40`, `60`, `100`

- `cardQuantity`
  - 원본 카드가 몇 장인가를 뜻한다.

- `assignmentQuantity`
  - 실제 배정된 assignment가 몇 장인가를 뜻한다.

- `producedQuantity`
  - 작업기록에서 실제 몇 장 생산했는가를 뜻한다.

### 2. 시간 필드의 기준 단위

PT/ST/CT는 모두 "공정 row 1개를 1장 수행하는 전체 시간"이다.

예:
- 공정명: `주머니 달기 2회`
- `timesPerPiece = 2`
- `bucketStSeconds = 500`

이 의미는 아래와 같다.
- `주머니 달기 2회`라는 공정 row 전체가 `500초`
- 계산은 `500 × 수량`
- `500 × 2 × 수량`이 아니다

### 3. 공정 row 예시

스타일 `AJ1972`에 아래 공정 row가 있다고 가정한다.

- `주머니 상침`: `12초`
- `주머니 달기 2회`: `500초`
- `어깨 봉제`: `8초`

한 벌 기준 ST 합은

- `pieceStTotalSeconds = 12 + 500 + 8 = 520초`

즉:
- `timesPerPiece`가 `2`여도 ST를 다시 곱하지 않는다
- 반복 의미는 이름/표현/번역용 메타데이터다

### 4. assignment 전체 ST 합 예시

위 예시에서 `assignmentQuantity = 60`이면

- `assignmentStTotalSeconds = 520 * 60 = 31200초`

즉:
- 한 벌 기준 합은 `pieceStTotalSeconds`
- assignment 전체 합은 `assignmentStTotalSeconds`

### 5. split 정책

`100장` 카드/assignment를 `60장`과 `40장`으로 split할 때 기존 총초를 비율로 나누지 않는다.

올바른 방식:
1. `60장` 버킷 기준 ST를 다시 조회
2. `40장` 버킷 기준 ST를 다시 조회
3. 각각 새 `pieceStTotalSeconds`를 계산
4. 각각 새 `assignmentStTotalSeconds`를 계산

즉 split은 "비율 분배"가 아니라 "split 수량 기준 재조회"다.

### 6. CT snapshot 정책

CT는 assignment snapshot 전용값이다.

- 기본은 `ST = CT`
- 필요하면 특정 assignment에 한해 CT를 올릴 수 있다
- CT는 급여 계산 기준이다
- CT는 스케줄 길이 계산 기준이 아니다
- CT 행 값도 공정 row 전체의 1장 기준 시간이다

최신 구조:
- snapshot은 CT 중심 구조다
- ST는 snapshot에 영구 저장하지 않는다
- ST는 최신 전역 표준(`StyleProcessStandard.bucketStSeconds`)에서 다시 읽어 계산한다

저장 설계:
- persisted snapshot은 CT만 저장
- ST 수정값은 저장 요청 payload의 write-only draft로 전달
- 백엔드는 그 draft로
  1. `StyleProcessStandard.bucketStSeconds` 역반영
  2. `pieceStTotalSeconds` / `assignmentStTotalSeconds` 재계산
  3. persisted snapshot에는 ST를 남기지 않음
- `PUT /assignment-board-state`의 최종 CT 저장 책임은 서버 검증이다. 프론트가 보낸 `assignmentCtSnapshot`이나 프론트 `styles` 캐시를 그대로 최종 신뢰하지 않고, 편집 가능한 배정은 해당 `AssignmentCard.styleId` FK로 라이브 스타일 공정을 조회해 CT 스냅샷을 새로 만들 수 있어야 한다. 기존 DB에 유효한 스냅샷이 있는데 클라이언트가 빈/null 스냅샷을 보내면 기존 값을 보존한다. 라이브 기준으로도 만들 수 없고 기존 유효 스냅샷도 없으면 409로 저장을 막고 진단 로그를 남긴다.

### 7. ST 수정 정책

assignment 상세에서 ST를 수정하면
그 값은 해당 assignment에만 머무는 값이 아니다.

정책:
- assignment 상세 ST 수정
- 최신 표준 ST로 간주
- `StyleProcessStandard`에 역반영

### 8. 필드 canonical naming

버킷별 ST 저장값:
- `bucketStSeconds`

버킷별 ST 배열:
- `stBuckets`

assignment CT snapshot 공정 CT:
- `snapshotCtSeconds`

assignment CT snapshot 전체 CT 합:
- `assignmentCtTotalSeconds`

한 벌 기준 ST / CT 합:
- `pieceStTotalSeconds`
- `pieceCtTotalSeconds`

card 전체 ST 합:
- `cardStTotalSeconds`

assignment 전체 ST / CT 합:
- `assignmentStTotalSeconds`
- `assignmentCtTotalSeconds`

WorkLog 헤더 CT 합:
- `workLogCtTotalSeconds`

AT 모델 계수:
- `atModelParams`

runtime 조회값:
- `exactStSeconds`

### 9. 2026-05-26 추가 잠금

아래는 2026-05-26 사용자 확정 답변이다.

- `AssignmentPlan.ctSnapshot`은 물리 DB 컬럼명, Prisma field, API key, 프론트 접근자까지
  전부 `assignmentCtSnapshot`으로 맞춘다
- `AssignmentBoardState.assignments[].ctSnapshot` key도 같이 `assignmentCtSnapshot`으로 바꾼다
- `style.processes[].stValues`는 `stBuckets`로 바꾼다
- `style.processes[].stValues[].quantity`는 `bucketQuantity`로 바꾼다
- `style.processes[].stValues[].seconds`는 `bucketStSeconds`로 바꾼다
- nested snapshot JSON의 `totalCtSeconds`는 `assignmentCtTotalSeconds`로 바꾼다
- snapshot은 최종적으로 CT-only 구조로 정리한다
  - persisted snapshot에는 ST를 남기지 않는다
  - ST 수정값은 저장 요청 payload의 write-only draft로만 전달한다
  - 백엔드는 그 draft로 전역 ST 역반영과 ST 총합 재계산을 수행한다
- 저장 시 ST draft가 없으면 전역 ST 역반영은 skip한다
- assignment는 저장 시점의 공정/표준 구성을 고정한다
  - 이후 스타일 공정이 바뀌어도 기존 assignment는 자동 갱신하지 않는다
  - 다만 assignment 자체에 구조 변경이 생기면 최신 스타일 공정/표준 기준으로 다시 생성한다
  - 구조 변경 예:
    - 배정 취소
    - 배정 이동
    - 날짜 변경
    - 수량 변경
    - split
    - merge
- 완료된 assignment는 읽기 전용이다
  - 상세 열람은 가능
  - 저장/수정/이동/split/merge/cancel은 불가
- `assignmentStTotalSeconds`의 최종 계산 책임은 백엔드 저장 시점에 둔다
  - 프론트 계산값은 참고 입력일 수 있어도 최종 저장값은 백엔드가 재계산해서 확정한다

### 10. 피해야 할 이름

- `quantity` 단독 사용
- `totalSt`
- `totalSeconds`
- scope 없는 `stSeconds`
- scope 없는 `ctSeconds`

최신 문서/리뷰/신규 코드에서는 반드시 scope와 기준을 함께 적는다.

### 11. 2026-05-26 후속 잠금

- 완료 assignment 판정의 단일 소스는 `isCompleted === true`다
  - `completedAt`, `closedAt`은 보조 표시용으로만 쓴다

- `PUT /assignment-board-state` payload에 완료 assignment가 포함되는 것 자체는 정상이다
  - 보드 저장 payload에는 완료/미완료 assignment가 함께 들어올 수 있다
  - 완료 assignment가 DB 기존값과 동일하면 백엔드는 기존값을 그대로 보존하고 나머지 미완료 변경만 저장한다
  - 완료 assignment의 write 필드가 DB 기존값과 하나라도 다르면 요청 전체를 `409`로 reject한다
  - 완료 항목만 조용히 skip하지 않는다
  - 이유: 완료 assignment 변경분이 들어온 것은 프론트 버그 또는 동시성 문제이므로 저장 성공처럼 보이면 안 된다
  - 완료 assignment 변경 감지 대상 write 필드는 `toAssignmentPlanWriteData()`가 저장하는 실데이터 필드 전체다
    - 포함: `lineId`, `cardId`, `orderNo`, `customer`, `label`, `colorId`, `colorName`, `previewUrl`, `imageUrl`, `thumbnailUrl`, `quantity`, `originOrderId`, `basis`, `ctTotalSeconds`, `assignmentCtSnapshot`, `color`, `stripeColor`, `assignmentStTotalSeconds`, `startIndex`, `endIndex`, `startDayOffsetPercent`, `startDayPercent`, `endDayPercent`
    - 제외: `updatedAt`, `version`, `versionUpdatedAt`, `dbId`, `createdAt` 같은 서버/동기화 메타 필드
    - 완료 상태 자체(`isCompleted`, `completedAt`, `finalQuantity`)는 board save가 쓰지 않으며 전용 완료 endpoint 소관이다

- ST draft가 없고 구조 변경도 없으면 기존 `assignmentStTotalSeconds`를 유지한다
  - 예:
    - assignment를 열어서 CT만 바꾸고 저장
    - ST는 수정하지 않음
    - split / merge / 이동 / 날짜 변경 / 수량 변경도 없음
    - 이 경우 기존 `assignmentStTotalSeconds` 유지

- ST draft가 있거나 구조 변경이 있으면 백엔드가 최신 표준 ST로 재계산한다
  - 구조 변경 예:
    - split
    - merge
    - 배정 이동
    - 날짜 변경
    - 수량 변경
    - 배정 취소 후 재생성

- 단순 이동/날짜 변경도 구조 변경으로 본다
  - 수량이 그대로여도
  - 라인 이동 또는 날짜 변경이 있으면
  - 백엔드가 최신 표준 ST로 다시 계산한다

- 예전 assignment를 단순 열람할 때는 예전 공정 구성을 그대로 유지한다
  - 스타일 공정이 나중에 바뀌어도 자동 재매핑하지 않는다
  - 실제 배정 변경을 할 때만 최신 공정/표준 기준으로 다시 생성한다
  - snapshot 공정이 현재 StyleProcess DB에 없으면
    - 해당 공정 행은 읽기 전용으로 표시한다
    - 삭제/자동 재매핑하지 않는다
    - 과거 급여 기준이 바뀌면 안 되기 때문이다

- 스타일 자체는 삭제 불가를 전제로 본다
  - 다만 스타일의 공정은 추가/삭제/수정 가능하다

- 라인 인원 변경만 발생했을 때는 `assignmentStTotalSeconds`를 재계산하지 않는다
  - 라인 인원 변경은 ST 변경 사유가 아니다
  - 대신 라인 capacity / 일정 / reflow 재계산 대상으로 본다
  - 라인 인원은 날짜 기준 이력으로 추적한다
    - 직원 퇴사일
    - 라인 이동일
    - 라인 편성 변경일
    에 따라 해당 날짜부터 capacity / reflow 계산에 반영한다

- reflow로 밀린 다른 assignment의 `startIndex/endIndex` 변경도 구조 변경으로 본다
  - 사용자가 A를 이동해서 B, C가 밀리면
  - B, C도 최신 표준 ST 재계산 대상이다

- `stDrafts`가 PUT body에 아예 없거나 빈 객체(`{}`)면 같은 뜻으로 본다
  - 둘 다 "ST 수정 없음"이다
  - 둘 다 전역 ST 역반영 skip 처리한다
  - `stDrafts: null`은 잘못된 payload로 보고 reject한다
  - `stDrafts`에 assignment/snapshot에 없는 processKey가 오면
    - 해당 key만 무시하고 나머지는 정상 처리한다
    - 저장 전체를 실패시키지 않는다
    - 프론트에는 어떤 공정 key가 무시됐는지 안내 토스트를 보여준다

- 백엔드 구조 변경 감지 기준은 아래 4개다
  - `quantity`가 DB 기존 값과 다름
  - `lineId`가 DB 기존 값과 다름
  - `startIndex` 또는 `endIndex`가 DB 기존 값과 다름
  - 해당 `externalId`가 DB에 없음
  - 위 중 하나라도 해당하면 구조 변경으로 간주하고 `assignmentStTotalSeconds` 재계산 대상이다
  - `coverageStartDate/coverageEndDate`는 WorkLog 기간 필드이며 assignment 구조 변경 감지 기준이 아니다
  - scheduler assignment의 날짜/위치 기준은 `AssignmentPlan.startIndex/endIndex`다

- 백엔드가 `assignmentStTotalSeconds`를 재계산하면 그 값은 반드시 세 군데에 같은 값으로 반영한다
  - `AssignmentBoardState.assignments[]`
  - `AssignmentPlan.assignmentStTotalSeconds`
  - `PUT /assignment-board-state` 응답 payload
  - 프론트가 보낸 `stTotalSeconds`를 board state에 먼저 저장하고 DB plan만 나중에 재계산하면 안 된다
  - 이유: 저장 직후 프론트 상태와 DB plan 값이 달라져 다음 저장/충돌 감지가 오염된다
  - PUT 1회 안에서 여러 assignment가 재계산되면 Style/StyleProcess/StyleProcessStandard 조회는 batch/cache로 묶는다
  - reflow cascade로 밀린 B, C, D도 구조 변경이면 재계산 대상이며, 성능 때문에 제외하지 않는다

- snapshot ST 제거 전에는 `StyleProcessStandard` 백필이 선행되어야 한다
  - 기존 활성 assignment의 `assignmentCtSnapshot.processes[].stSeconds`를 읽어 `StyleProcessStandard.bucketStSeconds`로 일회성 upsert한다
  - 백필 대상은 완료/미완료를 포함한 활성 assignment이며, 삭제/취소된 assignment는 제외한다
  - 백필 검증 전에는 `assignmentCtSnapshot.processes[].stSeconds`와 `assignmentCtSnapshot.totalStPerPieceSeconds`를 제거하지 않는다
  - 2026-06-02 Phase 7에서 백필 검증 통과 후 위 두 snapshot ST 복사 필드는 제거됐다
  - 자연스럽게 PUT이 돌며 채워지기를 기다리는 방식은 금지한다
  - 이유: 한 번도 PUT되지 않은 assignment는 기존 sync 경로를 타지 않아 ST 표준 row가 비어 있을 수 있다

- `final-quantity` 차단 기준은 최종적으로 `isCompleted === true` 단독으로 본다
  - 단, 이 정책 전환 전에 운영 DB에서
    - `isCompleted = false`
    - `completedAt IS NOT NULL`
    레코드가 있는지 먼저 확인한다
  - 있으면 데이터 정합성 정리 후 전환한다
  - 정합성 정리 방식:
    - `isCompleted = false`
    - `completedAt IS NOT NULL`
    레코드는 `isCompleted = true`로 올려서 완료 상태로 맞춘다
    - `completedAt`을 지우지 않는다

### 12. 2026-05-26 Phase 2 implementation status

- Implemented in code:
  - Frontend board save sends write-only `stDrafts` in `PUT /assignment-board-state`.
  - Backend rejects invalid `stDrafts` payloads, including `stDrafts: null`.
  - Backend ignores `stDrafts` process keys that are not present in the assignment snapshot and returns `ST_DRAFT_PROCESS_IGNORED` warnings for frontend toast display.
  - Backend updates `StyleProcessStandard` only from explicit `stDrafts`; board save no longer reverse-syncs every `snapshot.processes[].stSeconds`.
  - Backend recalculates `stTotalSeconds` before saving `AssignmentBoardState`, so board state JSON, `AssignmentPlan`, and the PUT response share the same recalculated value.
  - Backend treats `quantity`, `lineId`, `startIndex`, `endIndex`, or missing DB plan row as structural ST recalculation triggers.
- Still not implemented in this phase:
  - Physical rename of DB columns or JSON keys.
  - Removal of `snapshot.processes[].stSeconds` or `snapshot.totalStPerPieceSeconds`.
  - Frontend split/merge visual calculation cleanup; backend save now protects persisted values, but UI-side ratio/sum cleanup remains a later phase.

### 13. 2026-05-26 Phase 3 implementation status

- Implemented in code:
  - Frontend split/merge card state now recalculates `stTotalSeconds`, `totalPt`, `totalAt`, and `totalSt` from current style processes when the style is available.
  - Split assignment state resets CT (`ctTotalSeconds`, `ctSnapshot`) and recomputes schedule range from the recalculated remaining `stTotalSeconds`.
  - Merge assignment state resets CT (`ctTotalSeconds`, `ctSnapshot`) and recomputes schedule range from the merged quantity's recalculated `stTotalSeconds`.
  - If the style/process source is unavailable, split/merge keeps a fallback path using the previous scaled or summed values. Backend Phase 2 recalculation remains the persisted source of truth.
- Still not implemented in this phase:
  - Backend/API endpoint dedicated to previewing split/merge recalculated totals before save.
  - Physical rename of DB columns or JSON keys.
  - Removal of `snapshot.processes[].stSeconds` or `snapshot.totalStPerPieceSeconds`.

### 14. 2026-05-27 Phase 5A implementation status

- Scope:
  - This phase covers only Style/process JSON naming.
  - Assignment snapshot/card JSON rename and DB column rename remain separate later phases.
- Implemented in code:
  - `Style.processes[].quantity` is now written as `timesPerPiece`.
  - `Style.processes[].stValues` is now written as `stBuckets`.
  - `Style.processes[].stValues[].quantity` is now written as `bucketQuantity`.
  - `Style.processes[].stValues[].seconds` is now written as `bucketStSeconds`.
  - Frontend/backend read paths keep dual-read fallback for old Style JSON keys:
    `timesPerPiece ?? quantity`, `stBuckets ?? stValues`,
    `bucketQuantity ?? quantity`, and `bucketStSeconds ?? seconds`.
  - `backend/migration_fix.sql` includes a bulk JSON migration for `Style.processes`.
- Still not implemented in this phase:
  - `AssignmentPlan.ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentBoardState.assignments[].ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentCard.payload.quantity/totalSt/totalPt/totalAt` JSON rename.
  - `StyleProcessStandard.quantity/stSeconds` DB column rename.
  - `AssignmentPlan.quantity/stTotalSeconds/ctTotalSeconds` DB column rename.
  - Removal of Style JSON dual-read fallback.

### 15. 2026-05-27 Phase 6A implementation status

- Scope:
  - This phase covers only `StyleProcessStandard` physical column naming.
  - AssignmentPlan/AssignmentBoardState/AssignmentCard rename remains pending.
- Implemented in code:
  - Prisma schema uses `StyleProcessStandard.bucketQuantity`.
  - Prisma schema uses `StyleProcessStandard.bucketStSeconds`.
  - The unique input is now `styleProcessId_bucketQuantity`.
  - Backend reads/writes StyleProcessStandard through `bucketQuantity` and `bucketStSeconds`.
  - `backend/migration_fix.sql` includes idempotent physical rename SQL:
    `quantity -> bucketQuantity`, `stSeconds -> bucketStSeconds`.
- Deployment note:
  - `railway:predeploy` runs `prisma generate`, then `migration_fix.sql`, then `db push`.
  - Therefore Prisma schema must match the final physical DB column names for this phase.
  - Do not use `@map("quantity")` or `@map("stSeconds")` after the migration SQL renames the columns.
- Still not implemented in this phase:
  - `AssignmentPlan.ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentPlan.quantity/stTotalSeconds/ctTotalSeconds` column rename.
  - `AssignmentCard.payload` JSON key rename.
  - Removal of snapshot ST fields.

### 16. 2026-05-27 Phase 6B implementation status

- Scope:
  - This phase covers only `StyleProcess.processQuantity -> timesPerPiece` physical column naming.
  - AssignmentPlan/AssignmentBoardState/AssignmentCard rename remains pending.
- Implemented in code:
  - Prisma schema uses `StyleProcess.timesPerPiece`.
  - Backend StyleProcess storage writes `timesPerPiece`.
  - Backend StyleProcess reads and ST recalculation use `timesPerPiece`.
  - `backend/migration_fix.sql` includes idempotent physical rename SQL:
    `processQuantity -> timesPerPiece`.
- Boundary:
  - Frontend local variables named `processQuantity` are not DB columns and may remain local calculation variables.
  - Assignment CT snapshot `processes[].quantity` remains pending until snapshot JSON rename.
  - Legacy input fallback still accepts `processQuantity` from old JSON/API payloads.

### 17. 2026-05-27 Phase 6C implementation status

- Scope:
  - This phase covers top-level assignment CT snapshot naming:
    `AssignmentPlan.ctSnapshot -> assignmentCtSnapshot`.
  - `AssignmentBoardState.assignments[].ctSnapshot -> assignmentCtSnapshot` is migrated and new writes use `assignmentCtSnapshot`.
- Implemented in code:
  - Prisma schema uses `AssignmentPlan.assignmentCtSnapshot`.
  - Backend reads assignment snapshots with dual-read fallback:
    `assignmentCtSnapshot ?? ctSnapshot`.
  - Backend writes AssignmentPlan and AssignmentBoardState with `assignmentCtSnapshot`.
  - Frontend writes assignment board state with `assignmentCtSnapshot`.
  - `backend/migration_fix.sql` physically renames the DB column and migrates board-state JSON keys.
- Boundary:
  - Snapshot nested keys are handled by Phase 6D, not by this phase:
    `totalCtSeconds`, `totalCtPerPieceSeconds`, `processes[].quantity`,
    `processes[].ctSeconds`, and `processes[].ctPerPieceSeconds`.
  - Snapshot ST fields are still present until the final backfill/removal phase.

### 18. 2026-05-27 Dual-read cleanup backlog

- Dual-read fallback is temporary migration protection, not permanent application logic.
- Do not remove dual-read fallback in the same phase/commit that introduces a rename or migration.
- Remove fallback only after production data has been migrated and verified.
- Cleanup must be a separate follow-up commit so regressions can be isolated from rename/migration work.
- Before cleanup, verify there are no remaining records that require old-key reads:
  - `Style.processes[].stValues`
  - `Style.processes[].stValues[].quantity`
  - `Style.processes[].stValues[].seconds`
  - `Style.processes[].quantity`
  - `Style.processes[].processQuantity`
  - `AssignmentBoardState.assignments[].ctSnapshot`
  - `AssignmentBoardState.assignments[].ctAgreedSnapshot`
  - `assignmentCtSnapshot.totalCtSeconds`
  - `assignmentCtSnapshot.totalCtPerPieceSeconds`
  - `assignmentCtSnapshot.processes[].quantity`
  - `assignmentCtSnapshot.processes[].ctSeconds`
  - `assignmentCtSnapshot.processes[].ctPerPieceSeconds`
  - old `AssignmentCard.payload` keys:
    `quantity`, `totalPt`, `totalAt`, `totalSt`, `stTotalSeconds`,
    `totalSeconds`, `stSeconds`, `contractedSeconds`
- Cleanup targets after verification:
  - `stBuckets ?? stValues`
  - `bucketQuantity ?? quantity`
  - `bucketStSeconds ?? seconds`
  - `timesPerPiece ?? quantity/processQuantity`
  - `assignmentCtSnapshot ?? ctSnapshot`
  - `assignmentCtTotalSeconds ?? totalCtSeconds`
  - `pieceCtTotalSeconds ?? totalCtPerPieceSeconds`
  - `snapshotCtSeconds ?? ctSeconds`
  - `pieceCtSeconds ?? ctPerPieceSeconds`
- Snapshot ST fallback was removed in Phase 7 after the StyleProcessStandard backfill verification passed.

### 19. 2026-05-27 Phase 6D implementation status

- Scope:
  - This phase covers nested JSON keys inside `assignmentCtSnapshot`.
  - It does not remove snapshot ST fields.
- Implemented in code:
  - Snapshot processes write `timesPerPiece`, `snapshotCtSeconds`, and `pieceCtSeconds`.
  - Snapshot totals write `pieceCtTotalSeconds` and `assignmentCtTotalSeconds`.
  - Frontend/backend normalizers keep dual-read fallback for old nested keys:
    `quantity`, `ctSeconds`, `ctPerPieceSeconds`, `totalCtPerPieceSeconds`, and `totalCtSeconds`.
  - `backend/migration_fix.sql` migrates nested CT keys inside both
    `AssignmentPlan.assignmentCtSnapshot` and
    `AssignmentBoardState.assignments[].assignmentCtSnapshot`.
- Still not implemented in this phase:
  - Snapshot ST field removal.
  - AssignmentCard payload JSON rename.
  - AssignmentPlan `quantity/stTotalSeconds/ctTotalSeconds` physical column rename.

### 20. 2026-05-31 Phase 6E preflight implementation status

- Scope:
  - This phase prepares for snapshot ST removal but does not remove snapshot ST fields.
- Implemented:
  - Historical note (superseded on 2026-07-20): an earlier phase treated
    `isCompleted=false AND completedAt IS NOT NULL` as a row to auto-promote to
    completed. That is no longer current policy because `completedAt` can mean a
    manual `검토 필요 -> 작업 완료` override.
  - Backend completion checks now use `isCompleted === true` as the assignment completion source.
  - `backend/migration_fix.sql` backfills missing `StyleProcessStandard.bucketStSeconds`
    from active assignment snapshots:
    `assignmentCtSnapshot.processes[].stSeconds`.
  - The backfill preserves existing positive `StyleProcessStandard.bucketStSeconds`
    values and only fills missing/zero standards.
  - The migration emits a notice with:
    `unmatched_processes` and `missing_or_zero_standards`.
  - `ProductionPlanBoard` local process repeat naming was cleaned up to `timesPerPiece`.
- Still blocked:
  - Do not remove `assignmentCtSnapshot.processes[].stSeconds` or
    `assignmentCtSnapshot.totalStPerPieceSeconds` until the backfill notice reports
    zero unmatched processes and zero missing/zero standards in production.
  - Before starting snapshot ST removal, deployment logs must be checked and recorded:
    - `unmatched_processes = 0`
    - `missing_or_zero_standards = 0`
  - If either count is non-zero, stop Phase 7 and inspect the cause first.
    Common causes are `cardId/originOrderId` styleId parsing mismatch or
    snapshot process keys that no longer match `StyleProcess`.

### 21. 2026-05-31 Phase 6F implementation status

- Scope:
  - This phase covers `AssignmentCard.payload` JSON key rename only.
  - It does not remove snapshot ST fields.
- Implemented:
  - Persisted cards now write canonical card keys:
    `cardQuantity`, `cardPtTotalSeconds`, `cardAtTotalSeconds`,
    `cardStTotalSeconds`.
  - Backend card storage strips legacy ambiguous card keys before saving:
    `quantity`, `totalPt`, `totalAt`, `totalSt`, `stTotalSeconds`,
    `totalSeconds`, `stSeconds`, `contractedSeconds`.
  - Frontend board code keeps runtime compatibility aliases after read normalization,
    but PUT payloads send canonical card keys only.
  - `backend/migration_fix.sql` migrates existing `AssignmentCard.payload`
    JSON keys to canonical card keys.
- Still blocked:
  - Do not remove dual-read/runtime compatibility aliases until production
    migration has been applied and verified in a separate cleanup commit.
  - Do not remove `assignmentCtSnapshot.processes[].stSeconds` or
    `assignmentCtSnapshot.totalStPerPieceSeconds` in this phase.

### 22. 2026-06-02 Phase 7 preflight verification status

- Scope:
  - This phase adds an executable verification gate before snapshot ST field removal.
  - It does not remove snapshot ST fields.
- Implemented:
  - Backend script: `npm run verify:snapshot-st-backfill`.
  - The script checks:
    - active snapshot ST process row count
    - `styleLookupFailures`
    - `unmatchedProcesses`
    - `missingOrZeroStandards`
    - `completionInconsistencyRows`
  - Phase 7 can start only when all blocker counts are zero.
- Important:
  - `styleLookupFailures` is stricter than the migration notice because it catches
    `cardId/originOrderId` styleId parsing failures before `StyleProcess` matching.
  - If the script fails, do not remove `assignmentCtSnapshot.processes[].stSeconds`
    or `assignmentCtSnapshot.totalStPerPieceSeconds`.

### 23. 2026-06-02 Phase 7 snapshot ST field removal status

- Scope:
  - This phase removes only persisted ST copies from `assignmentCtSnapshot`.
  - It does not remove `StyleProcessStandard.bucketStSeconds`.
  - It does not remove normal rename dual-read fallback for old CT/card/style keys.
- Implemented:
  - New assignment snapshots no longer write `processes[].stSeconds`.
  - New assignment snapshots no longer write `totalStPerPieceSeconds`.
  - Frontend/backend snapshot normalizers output CT-only process rows:
    `timesPerPiece`, `snapshotCtSeconds`, and `pieceCtSeconds`.
  - Backend ST recalculation no longer reads snapshot ST fallback; it uses
    `StyleProcessStandard.bucketStSeconds` with PT fallback only where policy allows.
  - `backend/migration_fix.sql` removes existing snapshot ST copy fields from
    both `AssignmentPlan.assignmentCtSnapshot` and
    `AssignmentBoardState.assignments[].assignmentCtSnapshot`.
- Boundary:
  - `stDrafts` remains the only board-save path for editing ST.
  - `assignmentStTotalSeconds`/`stTotalSeconds` remains scheduler length data and is not removed.
  - Dual-read cleanup for migrated CT/card/style keys remains a later dedicated cleanup commit.

### 24. 2026-06-02 AssignmentPlan physical column rename status

- Scope:
  - This phase renames only `AssignmentPlan` physical DB/Prisma fields for assignment totals and assignment quantity.
  - It does not rename board state JSON compatibility keys in API payloads.
  - It does not remove normal dual-read fallback.
- Implemented field names:
  - `AssignmentPlan.quantity` -> `AssignmentPlan.assignmentQuantity`
  - `AssignmentPlan.stTotalSeconds` -> `AssignmentPlan.assignmentStTotalSeconds`
  - `AssignmentPlan.ctTotalSeconds` -> `AssignmentPlan.assignmentCtTotalSeconds`
- Runtime/API boundary:
  - Public assignment/board payloads may still expose compatibility keys:
    `quantity`, `stTotalSeconds`, `ctTotalSeconds`.
  - Backend maps those compatibility keys to the canonical Prisma fields at DB write/read boundaries.
  - `AssignmentBoardState.assignments[]` may still use compatibility total keys for now.
- Migration:
  - `backend/migration_fix.sql` performs idempotent three-state column handling:
    old-only, old+new, and new-only.
  - Existing `AssignmentPlan` values are preserved via `COALESCE(new, old)` before dropping old columns.
- Maintenance scripts:
  - Scripts that touch `AssignmentPlan`, `StyleProcess`, or `StyleProcessStandard` must use canonical Prisma fields:
    `assignmentQuantity`, `assignmentStTotalSeconds`, `assignmentCtTotalSeconds`,
    `timesPerPiece`, `bucketQuantity`, `bucketStSeconds`.
- Still separate:
  - Removal of compatibility payload aliases and dual-read fallback is a later cleanup commit after production migration verification.

### 25. 2026-06-04 Scheduler completion planning direction

- Status:
  - Product planning lock. This section records the chosen UX/operation direction before implementation details.
- Completion options considered:
  - `Option 1`: one finishing process on style acts as the completion signal.
  - `Option 2`: user always marks completion manually from assignment/dashboard.
  - `Option 3`: system auto-detects completion from work records, and user only corrects exceptions.
- Chosen direction:
  - Use `Option 3`.
  - Reason:
    - BARO should stay simple for operators.
    - Routine completion state changes should happen automatically from work records.
    - Users must still be able to override mistakes or exceptional cases.
- Current planning policy:
  - The system should auto-switch an assignment to completed when work-record-based progress reaches `>= 100%` of the planned/order quantity.
  - Users must be able to toggle final `completed / incomplete` state from both the dashboard and the assignment board.
  - The dashboard should act primarily as a tracking/report + exception-handling screen, not as a mandatory completion-click flow.
- Follow-up development items after this planning lock:
  - Card progress visualization from work records.
  - Scheduler card length re-adjustment.
  - Scheduler card order/position re-adjustment.
  - Warning UI for overflow or process-quantity imbalance.
- Refined completion policy (2026-06-05):
  - Auto completion/rollback must use only `WorkRecord` rows with explicit `assignmentPlanId`.
  - Work records without `assignmentPlanId` are reference/warning data only; they must not drive official completion state.
  - Official completion quantity should follow the minimum across required process-group totals.
  - Overflow production does not block completion, but must raise a visible warning for review.
  - Before payroll settlement lock, completion state may auto-change again when work logs are corrected.
  - After payroll settlement lock, completion state is frozen; no automatic rollback is allowed.
- Separate emergency recovery concept (2026-06-05):
  - Normal completion rollback and scheduler recovery are different features.
  - Normal rollback is routine app behavior from work-log recalculation before payroll lock.
  - Emergency recovery is a system-admin-only safety tool for scheduler corruption or bad recalculation.
- Emergency recovery must not delete historical cards, work logs, or completion history.
- Emergency recovery should let admins treat all work up to a checkpoint date as closed for scheduler purposes, then reopen scheduling from the next date.
- Example: if scheduler calculation became corrupted after `2026-04-30`, admin may restart scheduler usage from `2026-05-01` without deleting April history.

### 26. 2026-06-05 Meaning Exactness Lock

- AI/code review policy:
  - Canonical naming is not enough by itself.
  - The value stored in that field must also match the exact domain meaning.
  - "Mostly similar" or "close enough" fallback is not acceptable when the scope is different.
- Strict rule:
  - Never populate an assignment-scoped field with WorkLog/WorkRecord meaning as a substitute.
  - Never populate a WorkLog/WorkRecord field with assignment-scoped meaning as a substitute.
  - If the exact meaning is unknown, store `null` or add a new explicit concept.
- Concrete lock:
  - `assignmentQuantity` must mean the planned assignment quantity only.
  - `WorkRecord.quantity` must mean the recorded produced quantity only.
  - `assignmentQuantity = WorkRecord.quantity` is forbidden as a fallback.
  - `assignmentCtTotalSeconds` must mean assignment-level CT total only.
  - `totalCtSeconds` on `WorkLog` must mean WorkLog header CT total only.
- Implementation guidance:
  - When a legacy row has no linked assignment, do not synthesize fake assignment quantity/CT/ST values from work-record values.
  - Keep the assignment-scoped field `null` and treat the row as legacy/unlinked instead.
  - If product behavior needs a visible placeholder concept, add a new explicitly named field instead of overloading an existing canonical field.
- Variable naming guidance:
  - Local/runtime variable names should also reflect exact scope when they carry domain meaning.
  - Example: prefer `workLogCtTotalSeconds` over ambiguous `totalCtSeconds` for a WorkLog-header aggregate variable.

### 27. 2026-06-05 Auto Completion Phase 1 Lock

- WorkLog 저장/수정/삭제는 `assignment isCompleted === true`만으로 차단하지 않는다. 이 차단은 구 생산 현황/수동 완료 레거시로 본다.
- assignment 공식 진행도/완료 판정은 `WorkRecord.assignmentPlanId`가 명확한 행만 사용한다. orphan/추정 매칭 WorkRecord는 공식 완료 근거에서 제외한다.
- 작업기록 기반 자동 완료는 `AssignmentPlan.closedBy = "system:auto-worklog"` 표식으로 남긴다.
- 작업기록 기반 자동 롤백은 위 표식으로 자동 완료된 assignment에만 적용한다. 수동/QC 완료 assignment는 이 자동 롤백이 덮어쓰지 않는다.
- 구 생산 결과 경로 `/production-result`는 2026-06-16 완전히 삭제됐다 (라우트, 페이지, FEATURE_KEYS, 메뉴 권한 전부 제거). 같은 날 별도의 레거시 메뉴 "생산 현황"(`/batch-progress`)도 함께 삭제됐다 — 자세한 내용은 36번 섹션 참고.

### 28. 2026-06-05 Auto Completion Phase 2 Payroll Lock

- 급여 잠금은 assignment 카드별 완료 월 기준으로 판정한다.
- 완료 월은 `AssignmentPlan.productionCompletedAt`를 우선 사용하고, 없으면 `closedAt/completedAt`로 fallback한다.
- 그 완료 월에 `PayrollSnapshot`이 이미 있으면 해당 assignment는 payroll-locked 상태로 본다.
- payroll-locked assignment는 WorkLog 생성/수정/삭제로 변경할 수 없다.
- payroll-locked 상태의 auto-completed assignment는 이후 작업기록 합계가 줄어도 자동 롤백하지 않는다.
- payroll-locked assignment는 `/assignment-plans/:externalId/production-complete`로 수동 재확정할 수 없다.
- progress row는 `isPayrollLocked`, `payrollLockMonth`를 노출할 수 있고, UI는 이 값을 경고/버튼 차단에 사용한다.
- 이 잠금 규칙은 이후 시스템 관리자용 비상 복구 기능과 별개다.

### 28A. 2026-06-18 Board Visibility Follow-up (2026-08-14 상태 정책으로 대체됨)

- Historical completion statuses at that time were:
  - `IN_PROGRESS`
  - `REVIEW_REQUIRED`
  - `READY_TO_COMPLETE`
  - `PRODUCTION_COMPLETED`
- This block is retained only as implementation history. Current code must follow the 2026-08-14 completion-state rules at the top of this file and must not restore `READY_TO_COMPLETE`.
- Historical UI grouping was:
  - `queued` = still actively in progress
  - `review_required` = progress reached 100% but process quantity exactness needs review
  - `ready_to_complete` = `작업 완료` (`READY_TO_COMPLETE`)
  - `completed` = `완료 확정` (`PRODUCTION_COMPLETED` / `isCompleted === true`)
- 운영 보드 후속 정책:
  - `완료 확정` 카드는 급여 기능 전까지는 완료 확정 목록에 계속 보일 수 있다.
  - 급여 기능 이후에는 연결된 모든 `WorkRecord` 월이 급여 정산/잠금된 시점에 운영 보드에서 제외한다.
- Hiding `PRODUCTION_COMPLETED` assignments from operational boards after payroll is intentionally deferred.
- Reason for defer:
  - payroll detail UX and historical lookup/report requirements are not finalized yet
  - current priority is preserving canonical status semantics and visible grouping first
- Follow-up implementation target:
  - decide whether post-payroll hiding should be frontend-only, API-default filtering, or both
  - once payroll UX is fixed, document the default visibility contract for `/assignment-board-view` and `/line-month-capacity`

### 29. 2026-06-05 Scheduler Length Adjustment Phase 1 Lock

- 이 섹션은 `카드 길이 계산 기준`만 잠근다.
- 카드 순서 재정리(reflow)와 실제 저장 좌표 반영 정책은 아래 `Scheduler Serial Reflow Lock`을 따른다.
- 완료 카드는 기존 완료 로직을 그대로 사용한다. 실제 완료 날짜 기준 표시를 유지한다.
- 미완료 카드는 작업기록 진행률에 따라 길이 조정 대상이 될 수 있다.
- 단, 진행률이 `0%`인 미완료 카드는 길이를 조정하지 않고 원래 계획 길이를 유지한다.
- 진행률이 `0% 초과`이고 `100% 미만`인 미완료 카드는 spillover 길이 조정 대상이다.
- spillover 연장 기준은 실제 속도 예측이 아니라 `계획 길이 기준`이다.
- 기본 개념:
  - `planDays = 원래 계획 길이`
  - `progress = producedQuantity / baselineQuantity`
- `extension = progress > 0 && progress < 1 ? ceil((1 - progress) * planDays) : 0`
- `new visible span = planDays + extension`
- 이 단계의 목적은 `a,b 완료 + c 10%/90%`처럼 미완료 카드에 남은 비율이 얼마든, 작업기록 수정 때마다 남은 일부를 다음 날짜/다음 달로 자연스럽게 넘겨 보이게 하는 것이다.
- 앞 카드가 빨리 끝나서 뒤 카드 시작일이 당겨지는 문제는 길이 공식만으로는 해결되지 않으며, 실제 적용 정책은 아래 직렬 reflow 규칙을 따른다.

### 30. 2026-06-05 Scheduler Serial Reflow Lock

- BARO 스케줄러는 라인 단위로 `무조건 직렬`로 본다. 한 라인의 카드들은 순차 체인처럼 앞 카드의 결과가 뒤 카드 시작에 전파된다.
- 따라서 앞 카드가 늦어지면 뒤 카드들도 모두 같이 밀리고, 앞 카드가 빨리 끝나면 뒤 카드들도 같이 당겨진다.
- 이 reflow는 render-only 표현이 아니라 실제 저장 좌표에도 반영하는 방향을 기본으로 한다.
- 즉 `AssignmentBoardState.assignments[].startIndex/endIndex`와 대응 `AssignmentPlan.startIndex/endIndex`는 직렬 재계산 결과로 업데이트될 수 있다.
- 단, 급여 잠금된 카드와 관리자 복구로 닫힌 과거 구간은 `anchor`로 고정한다. reflow는 그 뒤의 미잠금 카드에만 전파된다.
- period 입력이 있어도 보드 해석은 직렬 체인을 우선한다. 실제 현장 세부 병렬성보다 운영 보드의 순차 계획/재배치를 우선한다.
- 다만 period 입력만으로는 정확한 중간 전환 시점(예: 4/18 종료, 4/19 시작)을 알 수 없으므로, reflow 규칙은 추정 가능한 단일 기준으로 deterministic하게 계산해야 한다.
- 이후 길이/순서 재조정 phase에서는 `카드 길이 계산`과 `라인 전체 직렬 reflow`를 분리해서 설계한다.
### 31. 2026-06-05 WorkLog Completed Assignment Selection Lock

- 완료된 assignment는 새 WorkLog/WorkRecord에서 신규 선택 대상으로 쓰지 않는다.
- `work-log-context`가 내려주는 assignment 목록에서는 `isCompleted === true`인 카드를 제외한다.
- 프론트 WorkDetail의 assignment 선택 목록도 완료 카드를 제외한 상태를 유지한다.
- 다만 이미 해당 completed assignment에 연결되어 저장된 기존 WorkLog/WorkRecord는 예외다.
  - 급여 잠금 전에는 기존 연결 기록의 정정(수정/삭제)을 허용한다.
  - 이 예외는 “기존 연결 유지”에만 해당한다.
  - completed assignment로의 신규 연결 생성은 금지한다.
- 운영 의미:
  - 완료는 “이 카드에 새 작업을 더 쌓지 않는다”는 뜻이다.
  - 완료 후 추가 생산이 필요하면 먼저 assignment를 미완료로 되돌린 뒤 작업기록을 추가한다.

### 32. 2026-06-05 Scheduler Purpose Lock

- 스케줄러의 1차 목적은 과거 실제 작업 날짜를 정밀 복원하는 것이 아니다.
- 스케줄러의 1차 목적은 현재 기준으로:
  - 각 라인에 일이 얼마나 남아 있는지
  - 각 라인이 언제 비는지
  - 어느 라인에 일이 부족한지
  를 보여주는 것이다.
- 카드 길이 계산의 기준 작업량은 `assignmentStTotalSeconds`다.
- WorkLog/WorkRecord는 실제 시간값이 아니라 progress 계산의 근거다.
- 따라서 스케줄러는 `remainingStSeconds = assignmentStTotalSeconds × (1 - progress)`를 중심으로 남은 일감과 라인 비는 시점을 계산한다.
- CT는 성과급 산정과 계약을 위한 시간 기준이므로 스케줄러 길이 계산에 쓰지 않는다.
- AT는 ST 보정 참고값이지 스케줄러 길이의 직접 기준이 아니다.

### 33. 2026-06-05 Scheduler Remaining Work Summary Lock

- `assignment-plan-progress` 응답은 스케줄러용 workload summary 필드를 함께 노출할 수 있다.
- canonical scheduler summary field:
  - `plannedStTotalSeconds`
  - `remainingStTotalSeconds`
  - `completedStTotalSeconds`
  - `operationalProgressRatio`
- `remainingStTotalSeconds = assignmentStTotalSeconds × (1 - operationalProgressRatio)`를 기본 규칙으로 사용한다.
- 완료 assignment는 `remainingStTotalSeconds = 0`으로 본다.
- 라인 요약은 같은 라인의 미완료 assignment들의 `remainingStTotalSeconds` 합으로 계산한다.
- 1차 UI 목표:
  - 이 라인에 일이 얼마나 남았는지
  - 이 라인이 언제 비는지
  - 현재 보이는 기간 안에서 일을 얼마나 더 넣을 수 있는지

### 34. 2026-06-06 Scheduler Predictive Reflow Lock

- 현재 스케줄러 재배치는 `과거 실제 작업일 복원`이 아니라 `오늘 이후 남은 일감 재배치`를 기준으로 한다.
- 미완료 assignment의 직렬 reflow 기준 작업량은 `remainingStTotalSeconds`다.
- `remainingStTotalSeconds`가 있으면 기존 계획 구간에서 이미 지나간 사용량을 다시 차감하지 않는다.
- 즉 진행 중 카드의 미래 점유는 `전체 ST`가 아니라 `남은 ST`만 다시 라인 뒤에 쌓는다.
- reflow 시작점은 기본적으로 `today index`다. 오늘 이전에 끝난 카드/구간은 고정한다.
- 완료 assignment는 신규 WorkLog 선택 대상이 아니며, 스케줄러 reflow에서도 미래 작업량을 소비하지 않는다.
- 현재 구현은 완료 카드의 과거 위치를 새로 복원하는 것이 아니라, 완료/과거 구간은 anchor로 두고 오늘 이후 미완료 카드만 다시 배치한다.
- 같은 규칙을 보드 렌더와 저장 전 재배치에 같이 적용한다.
- 따라서 사용자가 보는 미래 라인 점유와 실제 저장되는 미래 좌표가 서로 다른 방향으로 벌어지지 않게 유지한다.
### 35. 2026-06-06 Scheduler Remaining Work Conservative Lock

- `remainingStTotalSeconds`는 낙관적으로 계산하지 않는다.
- scheduler 남은 일감 계산에는 아래 두 비율을 모두 계산한다.
  - `producedRatio = producedQuantity / plannedQty`
  - `totalDoneRatio = totalDone / totalExpected`
- canonical remaining progress는 아래다.
  - `progressForRemaining = min(producedRatio, totalDoneRatio)`
- canonical remaining workload는 아래다.
  - `remainingStTotalSeconds = plannedStTotalSeconds * (1 - progressForRemaining)`
- 이유:
  - 공정 불균형이 있으면 `totalDoneRatio`는 높아도 실제 완성 가능한 수량(`producedQuantity`)은 낮을 수 있다.
  - line free date 계산은 항상 더 보수적인 쪽을 우선한다.
- fixed / anchor 카드 기준:
  - completed 카드이거나
  - 과거 구간에 있고 `remainingStTotalSeconds <= 0`인 카드만 fixed로 본다.
- 미완료 카드가 `remainingStTotalSeconds > 0`이면, 저장된 end date가 과거에 있어도 reflow queue에 남겨서 미래로 다시 배치한다.
- 아래 상태는 scheduler warning 대상으로 본다.
  - orphan WorkRecord (`assignmentPlanId` 없음)
  - `assignmentStTotalSeconds` 미산정 또는 0
  - period-only 기반 low-confidence free-date estimate
  - `producedRatio`와 `totalDoneRatio` 차이가 큰 공정 불균형

### 36. 2026-06-16 Manual Production Completion Relocated to Assignment Board

- 수동 생산완료 확정 UI를 `AssignBoard.jsx` 상세 드로어로 이전했다. `handleConfirmProductionComplete`가 기존 백엔드 엔드포인트(`PATCH /assignment-plans/:externalId/production-complete`)를 그대로 호출한다.
- 진입 경로(둘 다 동일한 `handleConfirmProductionComplete`를 호출):
  - 빠른 경로: 배정 보드에서 미완료 카드 우클릭 → 컨텍스트 메뉴의 "수동 완료" → `window.prompt`로 확정 수량 입력.
  - 상세 경로: 우클릭 → "Open Detail" → 상세 드로어 하단의 "수동 완료" 패널에서 확정 수량 입력 후 확정.
- 백엔드 `completeAssignmentPlanProduction`과 급여 잠금/중복완료 체크 로직은 변경하지 않았다.
- 완료된 assignment를 다시 미완료로 되돌리는 "되돌리기" 기능은 이번 범위에 포함하지 않았다 (백엔드에 reopen 엔드포인트가 없고, 완료 assignment는 읽기 전용 원칙을 유지).
- 구 레거시 메뉴 "생산 현황"(`menu.batchProgress`, 경로 `/batch-progress`, `frontend/src/pages/App/BatchProgress.jsx`)은 완전히 삭제했다. 이 메뉴는 이미 `disabled: true` + `/workspace` 리다이렉트 상태였고, 그 안의 `handleConfirmClose`가 production-complete를 호출하는 유일한 코드였는데 메뉴 비활성화로 사실상 도달 불가능했던 고아 코드였다.
- `QcReview.jsx`의 "제작 완료 확정은 배치 진행 메뉴에서 처리합니다" 안내 문구는 "배정 화면 상세에서 처리합니다"로 갱신했다.

### 37. 2026-07-02 구동 오류 위험 지점 점검 (미수정 — 향후 조치 필요)

- 이 섹션은 코드 리뷰/조사만 수행한 결과이며 아직 수정하지 않았다. 다음에 이 영역을 건드릴 때 아래 항목부터 재확인한다.
- 심각도 높음 (데이터 오염 / 급여·스케줄 오계산):
  1. `backend/src/index.ts`의 `syncWorkRecordRefs`(6009-6019 부근) — `styleProcess.findMany`에 `orgId` 필터가 없다. 바로 위 `style.findMany`는 `orgId`로 스코프되어 있는데 이 조회만 빠져 있어, 다른 조직의 `styleProcessId`가 섞여 들어오면 타 테넌트 공정명/코드가 WorkRecord에 저장될 수 있다 (멀티테넌시 유출 가능성).
  2. `completeAssignmentPlanProduction`(20899-21037)과 `PATCH /assignment-plans/:externalId/final-quantity`(21338-21386) — `isCompleted`를 읽어서 체크한 뒤 별도로 `update`하는데, update의 `where`에 `isCompleted: false` 재확인이 없다. 동시 요청(빠른 완료 vs 상세 드로어 완료, 섹션 36 참고) 시 완료된(읽기 전용이어야 할) plan이 다시 덮어써질 수 있다. §9의 "완료된 assignment는 읽기 전용" 원칙과 충돌한다.
  3. `resolveWorkRecordProcessBucketKeyForAssignmentSchedule`(7147-7155 부근, `buildAssignmentPlanProgressRows`에서 사용) — `styleProcessId`가 없는 WorkRecord를 `processCode` 문자열로 bucket fallback한다. "정확 계산 원칙"이 금지한 processCode 재탐색이 진행률 계산 경로에 남아있다. 서로 다른 스타일의 동일 processCode가 진행률을 섞을 수 있다.
  4. `frontend/src/pages/App/assign/AssignBoard.jsx`의 `isAssignmentSchedulerCompleted`(2030-2034)와 이를 쓰는 reflow 전체 — `isPayrollLocked`/`payrollLockMonth`를 전혀 참조하지 않는다. §29/§35가 못박은 "급여 잠금 카드는 anchor로 고정"이 프론트 reflow에는 구현돼 있지 않아, 잠금된 카드가 화면에서 재배치되고 그 좌표가 저장 요청에 실릴 수 있다.
  5. `toAssignmentPlanWriteData`(`backend/src/index.ts:12837` 부근) — `updatedAt: item.updatedAt ?? new Date()`. 클라이언트가 이전 GET에서 받은 `updatedAt`을 그대로 되돌려보내면(보드 저장 payload 구조상 흔함) 매 저장마다 과거 타임스탬프가 유지되어 실질적으로 "마지막 수정 시각"이 갱신되지 않는다.
  6. ~~`PUT /assignment-board-state`의 `shouldSyncPlans` 블록 — board JSON은 트랜잭션 안, `AssignmentPlan` relation sync는 트랜잭션 밖.~~ **해소됨 (2026-07-06 재확인)**: 코드에 `shouldSyncPlans`라는 블록 자체가 더 이상 없고, `AssignmentCard`/`AssignmentPlan`/`AssignmentBoardState` 갱신이 전부 하나의 `prisma.$transaction` 안에서 실행된다. 이 항목을 처음 적었을 때 이미 최신 코드가 아니었던 것으로 보인다 — DB 설계 원칙 섹션의 해당 항목도 같이 정정함.
- 심각도 중간 (크래시 / 화면 오류):
  7. `AssignBoard.jsx` 드롭 핸들러(6070-6076 부근) — `dayIndex = Number(dayIndexRaw)`를 `=== null`로만 가드하여 `NaN`을 통과시킨다. `startIndex`/`endIndex`에 `NaN`이 저장될 수 있다.
  8. `AssignBoard.jsx`의 `getAssignmentStartKey`(2008-2011) — `startIndex`가 없는 카드 하나가 `NaN`을 반환해 6곳의 `.sort()` comparator를 오염시켜 라인 전체 카드 순서가 깨질 수 있다.
  9. `AssignBoard.jsx`의 `getTodayDayIndex`(1864-1868) — 오늘 날짜가 현재 보이는 범위 밖이면 `0`을 반환한다. 미래 달만 보고 있을 때 reflow 기준점이 인덱스 0(과거)으로 잘못 설정될 수 있다.
  10. `frontend/src/pages/App/assign/components/AssignBar.jsx`의 `getDurationDays`(9-17)와 `ScheduleTimeline.jsx`의 `assignLanes`(108-126) — 위 NaN 인덱스가 전파되면 각각 "NaNd" 배지 표시, 레인 스택 로직 무한/오작동으로 이어질 수 있다. `ScheduleTimeline`은 현재 운영 UI에서 미사용이지만 코드는 남아있다.
  11. `backend/src/payroll/payroll.service.ts`(477-492 부근) — 급여 화면의 공정별 항목 breakdown을 `processCode || processName || "unknown"`으로 그룹핑한다. 급여 합계 자체는 그 전에 `ctSeconds × quantity`로 정확히 계산되므로 급여 금액 오류는 아니지만, 같은 코드를 쓰는 서로 다른 공정이 화면상 한 줄로 합쳐져 보일 수 있다.
- 확인 결과 문제 없음으로 배제한 항목: JSON 배열 접근은 `ensureArray()`/`Array.isArray` 가드가 일관 적용됨, 진행률/보드 저장 핫패스는 `Map` 기반 조인이라 O(n·m) 루프 없음, 남아있는 dual-read fallback(`assignmentCtSnapshot ?? ctSnapshot`, `stBuckets ?? stValues` 등)은 이 문서가 "정리 대기 중"이라고 이미 명시한 것과 정확히 일치하고 snapshot ST 필드는 신규 write 경로에서 확인상 이미 제거됨(§18/§23과 일치), 프론트 reflow에서 이름 기반(코드/이름 매칭) join은 발견되지 않음.
- 위 목록의 1번(`syncWorkRecordRefs` orgId 필터 누락)은 2026-07-02에 별도로 수정됨 — `styleProcess.findMany`에 `orgId`를 추가해 타 테넌트 `styleProcessId` 유입을 차단했다. 나머지 항목(2~11번)은 여전히 미수정 상태다.

### 38. 2026-07-02 WorkOrder.items / Style.processes JSON 쓰기·읽기 fallback 제거

- 위 "DB 설계 원칙" 섹션의 이중 저장 표에 정리된 대로, `WorkOrder.items`와 `Style.processes` JSON을 신규 저장 경로에서 완전히 끊고 응답/계산 경로의 fallback도 제거했다. `WorkLog.records`는 애초에 레코드 데이터를 복제한 적이 없어(헤더 메타데이터 `{lineId,lineName}`만 저장) 응답 조립 함수의 2단계 JSON fallback만 제거했다.
- 구현 중 계획을 일부 조정했다: `Style.processes → StyleProcess` 백필은 raw SQL로 새로 만들지 않았다. `buildStyleProcessStorageDrafts`/`resolveStyleProcessStorageCode`가 processCode 결정에 다단계 fallback(명시 code → storageCode → composition 기반 생성 → name 기반 생성 → `PROC_N`)과 로컬라이즈드 이름 합성을 쓰고 있어, 이를 SQL로 재구현하면 todo.md에 기록된 과거 백필 사고(실제 로직과 미묘하게 다른 백필이 데이터를 틀어지게 한 뒤 검증 없이 DROP)를 반복할 위험이 컸다. 대신 이미 프로덕션에서 검증된 자가치유 함수(`ensureStyleProcessStorageForStyles` → `syncStyleProcessStorageForStyle`, `GET /styles?includeProcesses=1` 호출 시 자동 실행)를 그대로 백필 메커니즘으로 유지했다. `WorkOrderItem`은 JSON 항목 구조가 평탄해 raw SQL 백필이 안전하다고 판단해 원안대로 진행했다.
- 발견해서 같이 고친 latent 버그: `PUT /orders/:orderId`가 부분 업데이트 시 누락된 필드를 `existing`(직전 조회한 주문)으로 채우는데, `items`만 `existing.items`(JSON 컬럼)를 fallback으로 읽고 있었다. `existing` 조회에 `workOrderItems` relation이 `include`돼 있지 않았던 것과 겹쳐, JSON 쓰기를 끊는 순간부터는 `items` 없는 저장 요청마다 기존 주문 품목이 통째로 사라질 뻔했다. `existing` 조회에 `workOrderItems` relation을 추가하고, fallback도 relation 기반으로 바꿔서 고쳤다(`backend/src/index.ts`의 `normalizeOrderPayload`, `PUT /orders/:orderId`).
- 신규 검증 스크립트:
  - `npm run verify:workorder-item-backfill` — 실제 데이터 검증. `WorkOrder.items`에 항목이 있는데 `WorkOrderItem` 행이 없는 주문 수를 센다. 0이어야 컬럼 DROP을 진행할 수 있다.
  - `npm run verify:style-process-backfill` — 진단 전용(백필 아님). `Style.processes`에 항목이 있는데 `StyleProcess` 행이 0개인 스타일 수를 센다. 0이 아니어도 실패는 아니며, 그 styleId들에 대해 `GET /styles?includeProcesses=1`을 한 번 호출(또는 스타일 편집 화면에서 재저장)하면 자가치유 백필이 실행돼 카운트가 줄어든다.
  - 두 스크립트 모두 이 개발 환경에는 운영 `DATABASE_URL` 접근 권한이 없어 실행하지 못했다 — 운영 배포 전 반드시 Railway DB를 대상으로 실행해서 확인해야 한다(`todo.md` 참고).
- `migration_fix.sql`에 `Step 0d-5`로 `WorkOrderItem` 백필 SQL을 추가했다(idempotent, 이미 relation이 있는 주문은 건드리지 않음).
- 컬럼(`WorkOrder.items`, `Style.processes`) 자체는 이번 패스에서 DROP하지 않았다. 두 verify 스크립트가 운영 DB에서 0을 보고한 뒤 별도 후속 커밋으로 DROP한다.
- 참고: `production-result`(생산 결과, `menu.productionResult`)는 이번 항목과 다른, 별도로 먼저 삭제된 플레이스홀더 메뉴다.

### 39. 2026-07-03 주문 잠금 / AssignmentCard 동기화 재설계 (운영 데이터 삭제 사고 대응)

- 사고: 주문 잠금 해제가 그 주문의 `AssignmentPlan`/`AssignmentCard`를 무조건 전부 삭제하도록 되어 있었고(작업기록 있으면 해제 자체를 막는 가드가 있었지만, 작업기록을 먼저 지우면 그 가드가 무력화됨), 실제로 이 순서로 조작이 일어나 운영 `AssignmentPlan` 25건과 `WorkRecord` 전체가 삭제됐다. 백업 없어 복구 불가. 상세 경위와 FK/Join 검토는 `todo.md`의 "2026-07-03 주문 잠금-배정카드 동기화 재설계" 항목 참고.
- 최종 설계 (현재 코드 상태, 이 문서 우선):
  - **잠금/해제는 순수 편집 권한 플래그다.** `POST /orders/:orderId/modification-lock`은 `modificationLockedAt/By`를 켜고 끄는 것 외에 `AssignmentCard`/`AssignmentPlan`을 전혀 건드리지 않는다. 잠금 시점에 카드를 만들거나 갱신하지 않는다.
  - **카드 생성/갱신/제거는 주문 저장(`PUT /orders/:orderId`, `POST /orders`) 시점에 즉시 반영된다.** 잠금까지 미루지 않는다 — 수량이 바뀌면 그 저장에서 바로 카드 수량도 갱신된다.
  - **작업기록이 연결된 스타일의 카드는 주문에서 제거할 수 없다.** `PUT /orders/:orderId`는 `WorkOrderItem`을 실제로 쓰기 전에, 빠지는 스타일의 카드에 연결된 `AssignmentPlan`이 작업기록을 갖고 있는지 먼저 확인한다(`findOrderStyleRemovalBlockers`, cardId 정확 일치 — 다른 스타일까지 걸리는 prefix 매칭 아님). 걸리면 아무것도 쓰지 않고 `409 { ok:false, error, issues:[{styleId,styleCode,styleName,code:"STYLE_HAS_WORK_RECORDS",message}] }`로 저장 전체를 막는다. 안전하면 `WorkOrderItem` 교체 + 카드 정리 + `AssignmentPlan` 정리를 하나의 `$transaction`으로 원자적으로 처리한다.
  - **`DELETE /orders/:orderId`도 같은 가드를 쓴다**(주문 삭제 = 그 주문의 모든 스타일이 한꺼번에 빠지는 것과 동치이므로). 이전에는 "해제가 먼저 카드/배정을 지워준다"는 우연한 전제 때문에 삭제 자체에는 이 가드가 없었다 — 그 우연한 전제가 사라졌으므로 명시적으로 추가했다.
  - 프론트(`frontend/src/pages/App/order/OrderList.jsx`)는 이 409+`issues` 응답을 작업기록 엑셀 임포트 실패와 같은 패턴(짧은 토스트 + 스타일/사유 표를 보여주는 `Dialog`)으로 표시한다.
  - `OrderList.jsx`의 `handleSave`가 주문 저장 후 별도로 `/assignment-board-view`를 다시 불러와 `reconcileBoardStateForQuantityChanges`로 카드를 재계산해 `PUT /assignment-board-state`를 또 호출하던 경로는 제거했다 — 실패해도 조용히 삼켜지는 이중 저장 경로였고, 이제 카드 동기화는 백엔드 저장 트랜잭션 하나가 전담한다. `frontend/src/utils/quantityChangeBoard.mjs`(`reconcileBoardStateForQuantityChanges`)와 그 전용 테스트(`scripts/quantity-change-regression.test.mjs`)는 2026-07-08 삭제 완료(`test:quantity-change` 스크립트도 제거).
- 알려진 구조적 한계 (이번 범위에서 고치지 않음): `AssignmentCard.cardId`와 `AssignmentPlan.cardId`/`originOrderId`는 DB FK가 아니라 `${orderId}::${styleId}` 문자열 관례로만 연결되어 있다. 이번 수정은 이 관례를 애플리케이션 코드로 정확히 지키도록 만든 것이지, FK 자체를 추가한 것은 아니다. `AssignmentPlan.cardId`/`originOrderId`에는 인덱스도 없다 — 데이터가 늘어나면 이번에 추가한 저장 시점 가드 조회가 순차 스캔이 될 수 있으므로 `@@index([orgId, cardId])` 추가를 후속 과제로 남긴다.
- 운영 DB 복구 메모: 이 재설계 배포 후 기존 주문을 한 번씩 저장(또는 잠금 토글)하면 살아있는 `WorkOrderItem`을 기준으로 `AssignmentCard`가 다시 채워진다. `AssignmentPlan`(실제 라인 배정)은 자동 복구되지 않으므로 배정판에서 카드를 라인에 다시 드래그해야 한다.
- **정정 (2026-07-05)**: 위 "저장(또는 잠금 토글)하면 다시 채워진다"는 부정확했다. 실제 코드 확인 결과 `POST /orders/:orderId/modification-lock`은 잠금/해제 어느 쪽이든 `rebuildAssignmentCardsForOrgIds`를 전혀 호출하지 않는다 — 카드가 다시 채워지는 유일한 경로는 주문 **저장**(`PUT /orders/:orderId`)뿐이었다. 이 항목 자체는 아래 40번 재설계로 다시 대체된다.

### 40. 2026-07-05 카드 생성 시점을 주문 잠금으로 재변경 + 스타일 제거를 수량 0 오버플로우로 처리 (백엔드+보드 UI 구현 완료, 브라우저 미검증)

- 이 섹션은 바로 위 39번의 "카드 생성/갱신은 저장 시점에 즉시 반영한다, 잠금까지 미루는 설계는 반려한다"는 규칙을 **대체**한다. 다음 세션은 이 카드 생성 타이밍에 대해서는 39번이 아니라 이 40번을 따른다. (39번의 다른 원칙 — 잠금 해제는 순수 플래그라는 것, `DELETE /orders/:orderId` 가드, 프론트 이중저장 제거 등은 그대로 유효하다.)
- 배경: 39번 설계·배포 이후 실사용 관점에서, "잠금 = 생산 확정" 의미로 카드 생성을 다시 잠금 시점에 묶고 싶다는 요청이 있었다. 동시에 "작업기록이 이미 있는 스타일은 주문에서 못 뺀다"는 39번의 하드 블록이, 실제로는 이미 작업이 진행된 뒤에 고객 요청으로 물량이 줄어드는 정상적인 현장 상황을 시스템이 못 받아주는 문제로 확인되어 같이 재설계했다.
- 확정된 설계 (2026-07-05 사용자 결정 — **아직 코드에 반영되지 않음**, 구현 시 이 섹션의 "미해결 질문"부터 해소하고 상태를 갱신할 것):
  - **카드 생성/갱신은 주문 잠금(`POST /orders/:orderId/modification-lock`, `locked:true`) 시점에만 일어난다.** `PUT /orders/:orderId`(저장)는 `WorkOrderItem`만 갱신하고 `AssignmentCard`/`AssignmentPlan`에는 손대지 않는다. `PUT /orders/:orderId`는 이미 잠긴 주문의 저장을 409로 거부하므로, 실제 편집 흐름은 항상 "해제 → 수정(저장, 카드 영향 없음) → 재잠금(그 시점에 카드/배정 갱신)"이다.
  - **잠금 해제(`locked:false`)는 여전히 순수 플래그다.** 해제 시점에 카드/배정에 어떤 변경도 가하지 않는다 — 이 부분은 39번과 동일하게 유지, 어제 사고를 재발시키지 않기 위한 핵심 안전장치다. 해제 중에도 보드에는 마지막 잠금 시점의 카드가 그대로 남는다.
  - **작업기록이 이미 연결된 배정(AssignmentPlan)도 잠금 시점에 수량이 갱신될 수 있다.** 기존 `refreshUnlinkedAssignmentPlanSnapshotsForOrg`가 "작업기록이 연결된(linked) 플랜은 절대 건드리지 않는다"고 보호하던 것을 완화한다 — linked 플랜도 최신 주문 수량으로 `assignmentQuantity`(및 구조 변경이므로 `assignmentStTotalSeconds`)를 갱신 대상에 포함하되, `isCompleted===true`이거나 급여 잠금(`isPayrollLocked`)된 플랜은 여전히 건드리지 않는다. 급여 잠금 배제는 §28 급여 잠금 원칙의 자연스러운 확장이며 별도 협의 없이 이 문서에서 고정한다.
  - **주문에서 스타일이 통째로 빠지고 그 스타일에 이미 작업기록이 있어도, 더 이상 저장/잠금을 막지 않는다.** 39번의 `findOrderStyleRemovalBlockers` 하드 블록(`409 STYLE_HAS_WORK_RECORDS`)은 폐기한다. 대신: 그 스타일의 `AssignmentCard`/`AssignmentPlan`은 삭제하지 않고 그대로 두되 `assignmentQuantity`(및 카드 수량)를 `0`으로 갱신한다. 이미 생산된 수량은 전부 "초과 생산"으로 계산된다 — `overflowQuantity = producedQuantity - assignmentQuantity`는 `buildAssignmentPlanProgressRows`에 이미 구현되어 있고 음수/0-분모 클램프도 이미 되어 있어(§35 관련 로직 확인, `producedRatio`/`operationalProgressRatio`가 0/0 상황에서 `null`로 안전하게 빠짐) 별도 신규 계산식이 필요 없다. 이 관점에서 "스타일 완전 제거"는 "수량을 0으로 줄이는 일반적인 수량 변경"의 극단값일 뿐이며, 위 문단의 "linked 플랜 수량 갱신 허용"과 같은 파이프라인을 그대로 탄다.
  - **의미**: 계획 수량이 0인데 생산 기록이 있는 배정 = "주문에서는 빠졌지만 실제로는 만든 것"이며, 이는 데이터 오류가 아니라 정상 상태로 취급한다.
  - **급여 영향 없음 (코드로 이미 확인됨)**: `backend/src/payroll/payroll.service.ts`는 `assignmentQuantity`를 전혀 참조하지 않고 `WorkRecord.quantity`/`ctSeconds` 기준으로만 급여를 계산한다(grep 확인). 배정 계획 수량이 0으로 바뀌어도 이미 기록된 작업기록의 급여는 그대로 지급된다 — "급여는 생산한 수량만큼 지급한다"는 전제가 이미 코드로 보장되어 있다.
  - **AT 학습 영향 없음**: AT 파이프라인은 WorkLog/WorkRecord/출퇴근 데이터를 입력으로 쓰고 `AssignmentPlan.assignmentQuantity`를 참조하지 않는다.
  - **청구/정산(billing)은 이 저장소에 아직 구현되어 있지 않다** (grep 확인, 관련 코드 0건). 수량 0으로 남은 배정을 실제 매출/청구에 반영하는 것은 시스템이 자동으로 하지 않는다 — 고객과 협의 후 사람이 주문을 다시 수정해서(그 스타일을 실제 합의된 최종 수량으로 재추가) 주문 상태를 정산 현실과 맞추는 수동 프로세스로 남긴다. 향후 청구 기능을 만들 때는 "계획 수량 0이지만 작업기록이 있는 배정"을 반드시 별도로 조회해서 노출해야 한다 — 누락하면 매출이 조용히 유실된다.
  - **`DELETE /orders/:orderId`는 스타일 제거와 다르게 취급한다 (2026-07-05 정정)**: `AssignmentPlan.workOrderId`는 `onDelete: SetNull`이라 주문이 삭제돼도 배정 행 자체는 안 지워지고 `workOrderId`만 `NULL`이 되는 것까지는 안전하다. 하지만 스타일 하나만 빠지는 경우와 달리, 주문을 통째로 삭제하면 "나중에 고객과 합의된 뒤 그 주문을 다시 열어서 반영"할 원본 주문 자체가 사라진다(재정산 경로가 없어짐). 그래서 **주문 삭제는 스타일 제거와 다르게, 작업기록이 연결돼 있으면 삭제 자체를 계속 하드 블록으로 막는다** — 기존 `DELETE /orders/:orderId` 가드는 그대로 유지한다. 사람이 재정산 흐름을 타고 싶으면 먼저 각 스타일을 개별적으로 주문에서 빼서(0-수량 처리) 작업기록 연결을 끊은 뒤에 주문 자체를 삭제해야 한다.
- 2026-07-05 확정 (구현 착수 전 미해결 질문이었던 것들 — 사용자 답변으로 확정됨):
  - **0-수량 보존 기준**: 그 배정에 연결된 `WorkRecord`가 **실제로 하나라도 존재할 때만** 카드/배정을 0-수량으로 보존한다. 라인에 드래그만 해놓고 `WorkRecord`가 하나도 없는 빈 배정은 스타일이 빠지면 그냥 평소처럼(현재 동작 그대로) 삭제한다. `buildAssignmentCardsFromOrders`는 현재 `order.workOrderItems`에 없는 스타일은 애초에 순회 대상에서 제외된다(`backend/src/index.ts:10544` 이하) — 잠금 처리 파이프라인에 "이 주문에 대해 이전에 존재했던 카드 중, 지금 item에는 없지만 `WorkRecord`가 연결된 것"을 찾아 0-수량 항목을 강제로 주입하는 로직을 새로 만들어야 한다(현재 코드에 없음).
  - **UI 노출 방식**: 배정 보드에 평소 카드 목록과 분리된 **별도 경고 섹션**(예: "확인 필요")을 신설한다. 이 섹션에 표시할 항목이 하나도 없으면 섹션 자체를 렌더링하지 않는다(빈 섹션 노출 금지).
  - **경고 섹션에서 항목이 빠지는(필터되는) 기준**: 그 배정에 연결된 **모든** `WorkRecord`의 소속 월이 전부 급여 잠금(그 달 `PayrollSnapshot` 존재)되면 그 시점에 목록에서 제외한다. **주의**: 이건 "완료 확정 카드가 급여 지급되면 완료 확정 목록에서 빠진다"는 기존 로직을 재사용하는 게 아니라 **신규 구현**이다 — 실제로 그런 필터는 아직 존재하지 않는다(`lineMonthCapacity.js`의 완료 목록 빌더는 `isPayrollLocked`/`payrollLockMonth`를 전혀 참조하지 않음, §28A에도 "post-payroll hiding은 의도적으로 미뤄짐"이라고 이미 명시돼 있었음). 또한 기존 `isPayrollLocked`는 "완료 월 1개"를 전제로 계산되는데(§28), 0-수량 배정은 `plannedQuantity=0`이라 진행률 계산이 분모 0으로 `null`이 되어 전통적인 "진행률 100%→자동완료" 경로를 못 탈 가능성이 높다 — 그래서 이 신규 필터는 완료 월 1개가 아니라 **연결된 모든 WorkRecord 각각의 월이 전부 급여 잠금됐는지**를 별도로 계산해야 한다.
  - **비차단 안내**: 하드 블록을 없애는 대신, 저장/잠금은 그대로 통과시키되 "이 스타일은 이미 작업기록이 있어 완전히 삭제되지 않고 0개 배정으로 남았습니다" 같은 비차단 토스트를 보여준다.
- **해소됨**: `AssignmentPlan.workOrderId`는 스키마 확인 결과 `onDelete: SetNull`이었다(Cascade 아님) — 다만 위 "DELETE는 스타일 제거와 다르게 취급" 결정으로 이 경로 자체를 애초에 타지 않기로 했으므로(작업기록 있으면 여전히 삭제 자체를 막음) 실질적 영향은 없다.

### 2026-07-05 구현 현황

- **백엔드 구현 완료** (`backend/src/index.ts`, `npm run build` 통과):
  - `syncAssignmentPlansForOrderLock({ orgId, order, db })` 신규 함수 — `findOrderStyleRemovalBlockers` 바로 아래 위치. 주문의 현재 `WorkOrderItem` 수량(`resolveOrderStyleQuantityMap`)과 그 주문에 속한 기존 `AssignmentPlan`(`buildAssignmentPlanOrderMatchWhereOr`로 cardId/workOrderId 매칭)을 비교해 스타일별로 처리한다.
  - 같은 `cardId`를 공유하는 `AssignmentPlan`이 2개 이상(라인 분할/split)인 경우는 **의도적으로 건드리지 않는다** — 총량 변경분을 여러 split에 어떻게 재분배할지 결정된 바가 없어서다(알려진 한계, 아래 남은 일 참고).
  - 수량 0으로 남기는 케이스: `AssignmentPlan.assignmentQuantity/assignmentStTotalSeconds`를 0으로 갱신하고, 대응하는 `AssignmentCard.payload`에 `cardQuantity:0, type:"DELTA"`를 심어 이후 `rebuildAssignmentCardsForOrgIds`가 돌아도 카드가 삭제되지 않고 살아남게 한다(`mergeAssignmentCardsWithSaved`의 기존 DELTA 카드 보존 규칙을 그대로 재사용 — 신규 메커니즘 추가 안 함).
  - 수량이 바뀌었지만 스타일이 그대로 남아있는 경우: `ensureStyleStandardsForQuantities` + `loadStyleProcessRowsByStyleId` + `calculateAssignmentStTotalSecondsFromStyleRows`(보드 저장 경로가 쓰는 것과 동일한 버킷 조회 함수)로 새 수량 기준 ST를 재계산한다. 버킷을 못 찾으면(`null`) `assignmentQuantity`만 갱신하고 `assignmentStTotalSeconds`는 이전 값을 그대로 둔다 — §35 "ST 미설정시 경고만" 방침과 동일하게 저장을 막지 않는 쪽을 택함.
  - `isCompleted === true`이거나 급여 잠금(`annotateAssignmentPlanRowsWithPayrollLocks`로 계산한 `isPayrollLocked`)인 플랜은 위 처리에서 전부 제외.
  - `PUT /orders/:orderId`: `findOrderStyleRemovalBlockers` 호출, 409 하드 블록, 트랜잭션 안 카드/배정 정리, 끝의 `rebuildAssignmentCardsForOrgIds` 호출을 전부 제거 — 이제 `WorkOrderItem`만 갱신하는 순수 저장이다.
  - `POST /orders/:orderId/modification-lock`: `locked:true`로 바뀌는 전이에서만 `syncAssignmentPlansForOrderLock`을 `$transaction`(30s timeout)으로 감싸 실행한 뒤 `rebuildAssignmentCardsForOrgIds`를 호출한다. 응답 JSON에 `zeroedStyles`(0-수량으로 남은 스타일 목록, 프론트 토스트용) 필드를 추가했다. `locked:false`(해제)는 손대지 않았다 — 여전히 순수 플래그.
  - **2026-07-06 정정**: `syncAssignmentPlansForOrderLock`이 처음엔 `orgId: organization.id`(잠금 버튼을 누른 요청자의 조직) 단일 값으로만 호출됐다. 그런데 배정(`AssignmentPlan`)은 제조사(seller) 쪽 전용 개념이고, 주문 잠금은 발주사(buyer)든 제조사든 아무나 누를 수 있다(주문 자체가 양쪽이 공유하는 개념 — 사용자 확인). 그래서 발주사가 잠그면 `orgId: buyer.id`로 조회해 실제 `AssignmentPlan`이 있는 제조사 쪽은 건드리지 못하고 조용히 0건으로 스킵되는 버그였다. `rebuildAssignmentCardsForOrgIds`(바로 아래줄)는 원래부터 buyer+seller 양쪽을 다 도는데 `syncAssignmentPlansForOrderLock`만 한쪽으로 좁혀져 있던 비대칭이었다. `affectedOrgIds`(buyer+seller) 각각에 대해 `syncAssignmentPlansForOrderLock`을 돌리고 `zeroedStyles`를 styleId 기준으로 합치도록 고쳤다 — 배정이 없는 쪽 org는 `plans.length === 0`으로 즉시 no-op이라 안전하다.
  - `rebuildAssignmentCardsForOrg`의 주문 조회에 `modificationLockedAt: { not: null }` 필터를 추가했다 — 이게 없으면 스타일 저장/색상 동기화 등 다른 트리거가 돌 때마다 잠기지 않은 주문의 카드까지 다시 생겨서 "카드는 잠금 시점에만" 원칙이 깨진다(구현 중 직접 발견해서 같이 고침, 원래 계획에는 명시 안 돼 있었음).
  - 이제 아무 데서도 안 쓰는 `findOrderStyleRemovalBlockers`/`summarizeOrderStyleRemovalIssues` 삭제. `DELETE /orders/:orderId`는 별도의 자체 인라인 가드(`ORDER_HAS_WORK_RECORDS`)를 계속 쓰고 있어 영향 없음.
- **프론트엔드 일부 구현 완료** (`npm run build` 통과):
  - `frontend/src/pages/App/order/OrderList.jsx`의 `performOrderLockToggle`: 잠금 성공 응답의 `zeroedStyles`가 비어있지 않으면 비차단 경고 토스트(`orderPageText.zeroedStylesPrefix`/`zeroedStylesGeneric`, ko/en/vi 전부 작성)를 띄운다.
  - 기존 저장 실패 시 이슈 다이얼로그(`saveIssueRows`/`extractOrderSaveIssueRows`)는 그대로 유지 — `DELETE`가 여전히 같은 모양의 `issues` 배열을 반환하므로 삭제 실패 표시에는 계속 쓰인다. `PUT` 저장은 이제 이 경로를 타지 않는다(더 이상 이 에러를 반환하지 않음).
- **2026-07-05 후속: 보드 UI 경고 섹션 구현 완료**:
  - 병합 경로를 끝까지 추적함: `AssignBoard.jsx`가 `/assignment-plan-progress`를 별도로 불러와 `assignmentProgressById`에 저장하고, `resolveAssignmentProgressState({assignment, progressRow})`(`AssignBoard.jsx:2150`)가 화이트리스트 방식으로 필드를 골라 `applySchedulerProgressToAssignments`에서 `{...item, ...progressState}`로 병합한다. 이 병합된 assignment 객체가 `lineMonthCapacity.js`의 `buildLineQueueForecast` 입력이 된다.
  - `buildAssignmentPlanProgressRows`(`backend/src/index.ts:19468`)의 반환 객체에 `isZeroQuantityOverflow`(`(baselineQuantityRaw==null||<=0) && producedQuantity>0`)와 `isFullyPayrollSettled`(그 플랜에 연결된 **모든** WorkRecord의 월이 전부 급여 잠금됐는지, 새 `workRecordMonthsByPlanId`/`workRecordPayrollLockedMonthSet`로 계산 — 기존 `isPayrollLocked`는 완료 월 1개 전제라 재사용 불가) 두 필드를 추가.
  - `resolveAssignmentProgressState`(`AssignBoard.jsx:2150`)의 화이트리스트에 두 필드 추가.
  - `lineMonthCapacity.js`의 `buildLineQueueForecast`: `isZeroQuantityOverflow && !isFullyPayrollSettled`인 assignment를 큐/리뷰/완료 분류보다 먼저 가로채 별도 `zeroQuantityOverflowAssignments` 버킷(`queueStatus:'zero_quantity_overflow'`)에 담는다. 조건을 만족 안 하면(=급여 정산 완료) 자연히 이 버킷에서 빠진다 — 사용자가 요청한 "정산 다 되면 필터" 동작.
  - `LineMonthCapacityBoard.jsx`: "완료 확정 목록" 섹션 바로 아래에 `row.zeroQuantityOverflowAssignments.length > 0`일 때만 렌더되는 "확인 필요" 섹션 추가(항목 없으면 섹션째로 안 보임 — 다른 섹션과 달리 "없음" 문구도 안 넣음). `AssignmentDetailCard`에 `zero_quantity_overflow` 상태 분기 추가: 드래그 불가(`isLocked`) 처리, 경고색 칩/배경, "주문에서 빠짐 - 이미 N개 생산됨" 푸터.
  - `uiMessages.js`에 `assign.zeroQuantityOverflowHeader`/`zeroQuantityOverflowStatusCompact`/`zeroQuantityOverflowCompact` ko/en/vi 전부 추가.
  - `npm --prefix backend run build`, `npm --prefix frontend run build` 둘 다 통과.
- **아직 남은 것**:
  - split(같은 cardId를 공유하는 배정이 여럿인 경우) 수량 재분배 정책 — 결정된 바 없어 `syncAssignmentPlansForOrderLock`이 그대로 스킵함(구현 현황 참고).
  - 실제 브라우저로 "잠금 시 카드/수량이 갱신되는지", "스타일 제거 후 재잠금 시 0수량+토스트가 뜨는지", "보드에 확인 필요 섹션이 뜨고 급여 정산되면 사라지는지"는 개발 서버 미기동 상태에서 코드 작성 + `tsc`/`vite build` 통과만 확인했다. 다음에 반드시 실제로 눌러서 확인할 것.

### 41. 2026-07-05 "계획 부하" 과거 달 100% 하드코딩 버그 수정 (완료)

- §37 진단(코드 리뷰만, 미수정) 이후 사용자가 배포된 화면에서 실제로 재현 — `AssignmentPlan`이 0건인 상태에서도 LINE #1 6월 "계획 부하"가 계속 100%로 표시됨.
- 원인: `frontend/src/pages/App/assign/utils/lineMonthCapacity.js`의 `plannedLoadPercent` 계산이 과거("historical") 달에 한해 `roundPercent(lineMonthlyCapacitySeconds, lineMonthlyCapacitySeconds)`(분자=분모 항등식)로 **항상 100%**를 반환했다. 실제 `AssignmentPlan`/작업기록 데이터를 전혀 참조하지 않는 계산이라, 배정이 하나도 없어도 100%가 나왔다. 화면 캡션(`assign.capacitySummaryHint`)에도 "과거 기록월은 100% 기준으로 표시"라고 이 동작이 그대로 문서화되어 있었다 — 의도된 동작이었지만, 어제 사고로 배정 데이터가 전부 사라진 뒤에는 "잔여 데이터가 남아있다"는 오해를 유발하는 잘못된 설계였다.
- 수정: 과거 달의 `plannedLoadPercent`는 이제 같은 달의 `actualOutputPercent`(실제 작업기록 기반 생산률)를 그대로 따른다 — 이미 지난 달은 "계획"이라는 개념 자체가 의미 없고, 실제로 무엇을 만들었는지만 의미가 있다는 논리. 백엔드 요약(`backendRow`)이 없는 폴백 분기도 동일하게 수정(기존엔 이 분기가 달 종류 구분 없이 무조건 100%였음 — 오히려 더 나쁜 상태였음).
  - `monthSummaryByKey.set(...)` 메인 분기: `resolvedActualOutputPercent`를 로컬 상수로 뽑아서 `actualOutputPercent`/`plannedLoadPercent` 양쪽에 재사용.
  - 백엔드 요약 없는 폴백 분기(`months.map`): 동일 패턴 적용.
  - `uiMessages.js`의 `assign.capacitySummaryHint`(ko/en/vi) 캡션 문구를 새 동작에 맞게 갱신.
- `npm --prefix frontend run build` 통과. 실제 브라우저 확인은 아직 안 함 — 다음에 확인 필요.

### 42. 2026-07-05 AssignmentCard가 사고 이전부터 계속 0건이던 진짜 원인 발견 및 수정 (완료)

- §40 배포 후에도 사용자가 주문을 잠가도 카드가 안 생긴다고 재현 — 진단 로그(`console.error`, Railway 배포 로그로 직접 확인)로 추적한 결과 `styles=41 lockedOrders=2` 등 입력 데이터는 전부 정상인데 `buildAssignmentCardsFromOrders`의 결과물 `baseCards=0`으로 확정.
- **진짜 원인**: `buildAssignmentCardsFromOrders`와 `collectStyleQuantityRequirementsFromOrders`가 스타일 조회 맵을 `Style.code`(문자열) 기준으로 만들어놓고, 조회 키로는 `item.styleId`(숫자 FK)를 그대로 `resolveOptionalString()`에 넣어 사용했다. `resolveOptionalString(value, fallback)`은 `value`가 실제 문자열일 때만 값을 반환하고, 숫자가 들어오면 무조건 `fallback`을 반환하도록 구현되어 있다(`backend/src/utils/common.ts:48`). 그 결과 `item.styleId`(항상 숫자)는 매번 빈 문자열/`null`로 변환됐고, `if (!styleId) return;` 가드에 걸려 **모든 주문 항목이 예외 없이 스킵**됐다 — 잠금 여부와 무관하게 카드가 원천적으로 하나도 안 만들어지는 구조였다.
- 이건 §39의 "사고 전부터 AssignmentCard가 이미 0건이었다"는 관찰의 실제 원인이었다. 당시엔 "delete 후 upsert 루프가 원자적이지 않아서"라고 추정하고 `$transaction`으로 감쌌는데(§39, 여전히 유효한 별개의 안전장치), 그건 증상을 완화할 뿐 근본 원인이 아니었다.
- 수정: 두 함수 모두 스타일 조회 맵을 `Style.id`(숫자) 기준 `Map<number, Style>`로 바꾸고, `item.styleId`를 `toPositiveIntOrNull()`로 직접 비교하도록 변경. `Style.id`는 단일 행을 유일하게 식별하므로, 기존에 있던 "코드가 같은 여러 후보 중 주문 고객사/스타일명으로 가장 비슷한 것 고르기"(`resolveStyleCandidateForAssignmentCard`) 로직 자체가 더 이상 필요 없어 삭제했다 — FK 조회는 항상 정확히 하나의 결과만 나오기 때문이다.
- 같은 버그가 있던 `refreshUnlinkedAssignmentPlanSnapshotsForOrg`(스타일 변경 시 미연결 배정 CT/ST 스냅샷 갱신)의 `styleByStyleId`도 같은 방식으로 고쳤다. 이 함수는 `AssignmentPlan`이 0건이라 지금 당장 영향은 없었지만, 카드가 다시 생기고 라인 배정이 시작되면 바로 문제가 될 뻔했다.
- 운영 DB 실데이터로 재현·검증: E14-4 주문의 워크오더아이템을 수정된 로직으로 그룹핑하면 스타일 3개(S-ZIR04V/S-ZIQPQO/S-ZIQDTZ) 카드가 정상적으로 나옴을 확인.
- `npm --prefix backend run build` 통과.
- **후속 정정 (2026-07-25):** 이 문단이 언급하던 `loadAssignmentDisplayReferenceMaps`, `findOrderItemByAssignmentIdentity`, `resolveAssignmentDisplayFallback` 표시 복구 폴백은 후속 FK+join 정리에서 모두 삭제됐다. 현행 코드에 남은 미해결 헬퍼로 취급하지 않는다.
- 브라우저 실제 확인 아직 안 함 — 사용자가 재배포 후 잠금 테스트로 확인 예정.
- **2026-07-05 후속 발견 (같은 버그 패턴, 카드 생성은 됐지만 필드가 비어있던 문제)**: 카드는 실제로 생성됐지만 "고객사"가 전부 `-`로 비어있었다. 원인은 §42와 완전히 같은 클래스: `buildAssignmentCardsFromOrders`의 `customer` 필드가 `order?.customerName ?? order?.customer`를 읽고 있었는데, 이 쿼리의 `select`는 애초에 그런 flat 필드를 조회하지 않는다(`buyerOrg`/`customerOrg` relation만 조회함) — FK+join 자체는 이미 정상인데 그 join 결과를 읽는 코드가 안 붙어있던 것. `order?.customerOrg?.name ?? order?.buyerOrg?.name`로 수정. 운영 데이터로 "THE SAN"(더산) 정상 노출 확인.
- 같은 조사 중 `workOrderId: toPositiveIntOrNull(order?.id)`도 발견 — 이 쿼리의 `select`에 `id`가 아예 없어서 `order?.id`가 항상 `undefined`였다. `select`에 `id: true` 추가로 수정.
- **일반화된 교훈**: 이 카드 생성 경로에서 지금까지 찾은 버그 5건(styleId 3곳 + customer + workOrderId)이 전부 "FK+join(relation)은 정상인데, 그 결과를 읽는 코드가 리팩터링 이전의 존재하지 않는 flat 필드를 그대로 참조"하는 동일 패턴이었다. 이 함수(`buildAssignmentCardsFromOrders`)와 그 주변 헬퍼가 오랫동안 실행 자체가 안 됐거나(카드가 항상 0건이라 아무도 필드 값을 눈으로 확인 못함) 조용히 틀린 값만 내고 있었기 때문에 이렇게 오래 안 걸리고 남아있었던 것으로 보인다. 이 함수를 또 건드릴 일이 있으면 `order?.X`/`item?.X` 형태로 접근하는 모든 필드가 실제로 그 쿼리의 `select`에 있는지부터 먼저 대조할 것.
- **2026-07-05 UI 후속 (카드는 생성됐지만 화면에서 이해하기 어려웠던 문제) — 수정 완료**:
  - **수량이 안 보임**: 데이터는 정상이었다(`resolveCardQuantity`가 `cardQuantity`를 올바르게 읽음). 원인은 `CompactBoardCard.jsx`의 `flexWrap: { xs: 'wrap', lg: 'nowrap' }` — 이 브레이크포인트는 뷰포트 너비 기준이라, 뷰포트가 넓어도 "미배정 작업" 사이드바처럼 컨테이너 자체가 좁으면 `nowrap`이 그대로 적용돼 수량 필드가 `overflow:hidden` 밖으로 밀려나 안 보였다. `flexWrap: 'wrap'`(고정)로 변경 — 공간이 충분하면 원래처럼 한 줄로 보이고, 좁으면 자연스럽게 줄바꿈된다.
  - **고객사 이름이 영어로만 나옴**: `buildAssignmentCardsFromOrders`의 `customer` 필드가 `.name`(영어)만 보내고 있었다. `customerNameKo`/`customerNameVi`를 카드 payload에 추가하고, 프론트에 `resolveCardCustomerDisplay(card, languageCode)` 헬퍼를 만들어 미배정 카드 목록(`UnassignedCardItem`)에 적용했다.
  - **남은 범위(미해결)**: 이미 라인에 배치된 배정(`AssignmentPlan`)의 `customer`는 DB에 단일 문자열 컬럼(`customer String?`)만 있고 `customerNameKo`/`Vi` 대응 컬럼이 없다 — 카드를 라인으로 드래그해서 배정이 생성되는 시점에 굳어진 언어 그대로 계속 보인다. 완전히 고치려면 (a) `AssignmentPlan`에 로케일 컬럼을 추가하거나 (b) `workOrderId` FK로 매번 join해서 읽는 방식 중 하나를 결정해야 한다 — 이번엔 손 안 댔고 사용자 확인 후 별도 작업으로 진행 예정.

### 43. 2026-07-05 AssignmentPlan.assignmentCardId 실제 FK 추가 (cardId 문자열 관례 대체, 1단계 완료)

- 배경: 사용자가 "구조적 문제" 목록에 있던 `AssignmentCard.cardId`/`AssignmentPlan.cardId`의 "문자열이 우연히 같은 값이라는 관례" 연결을 실제 FK로 바꾸자고 제안. 예전엔 `AssignmentCard`가 주문 잠금/스타일 저장 때마다 통째로 재계산되는 캐시 성격이라 FK를 걸면 정상적인 재계산 때마다 깨질 위험이 있어서 미뤄뒀었는데, §40에서 이미 "작업기록 연결된 카드는 절대 삭제 안 함" 보호가 들어가 있어서 지금은 안전하게 추가할 수 있는 상태로 확인.
- 구현 (`backend/prisma/schema.prisma`, `backend/migration_fix.sql` Step 0k, `backend/src/index.ts`):
  - `AssignmentPlan.assignmentCardId Int?` 추가, `AssignmentCard.id`로의 실제 FK(`onDelete: SetNull`, workOrderId FK인 Step 0i와 동일 패턴).
  - `cardId`(문자열)는 마이그레이션 기간 동안 읽기 호환용으로 그대로 유지 — 아직 안 지움.
  - `migration_fix.sql`에 additive 컬럼 + 백필(`AssignmentCard.orgId`+`cardId` 매칭) + 인덱스 + idempotent 제약조건 추가(Step 0i와 동일 구조).
  - `toAssignmentPlanWriteData(item, cardIdToAssignmentCardId?)`가 이제 두 번째 인자로 `cardId 문자열 -> AssignmentCard.id` 조회 맵을 받아 `assignmentCardId`를 채운다.
  - `PUT /assignment-board-state`(cardId를 쓰는 유일한 생성/수정 지점, `assignmentPlan.create/updateMany` 둘 다 여기서만 일어남 — 전체 12개 `assignmentPlan.create/update` 호출부를 다 뒤져서 확인함)가 저장 1회당 이 맵을 한 번만 배치 조회해서 create/update 양쪽에 동일하게 전달한다.
  - `npm run build` 통과.
- **의도적으로 안 한 것**:
  - 운영 DB에 직접 DDL 실행은 안 함(세션 중 시도했으나 자동 분류기가 정상적으로 차단 — 정해진 `migration_fix.sql`+predeploy 파이프라인 밖에서 운영 스키마를 직접 바꾸려던 것이라 막힌 게 맞음). 다음 백엔드 배포 때 predeploy가 자동 적용한다.
  - **2026-07-06 정정**: 위 가정이 틀렸다. 사용자가 `railway.json`의 `preDeployCommand`를 의도적으로 꺼둔 상태라 배포해도 `migration_fix.sql`이 자동 적용되지 않았고, 그 결과 이 컬럼이 운영 DB에 계속 없는 채로 남아 `PUT /assignment-board-state`가 503(`missing column: assignmentCardId`)으로 전부 실패하는 장애가 실제로 발생했다. 사용자 명시적 확인 하에 이번엔 운영 DB에 Step 0k SQL을 직접 실행해서 복구했다(컬럼/인덱스/FK 추가, 백필은 현재 `AssignmentPlan`이 0건이라 영향 없음). 시작 시 필수 컬럼 체크 목록(`hasField` 목록, 파일 상단)에도 `assignmentCardId`가 빠져있어 이 드리프트를 못 걸렀던 것도 같이 추가함. **pre-deploy가 꺼져 있는 한 앞으로 `migration_fix.sql`에 추가되는 모든 신규 단계는 자동 적용되지 않는다** — 새 마이그레이션을 추가할 때마다 운영 DB에 수동으로 같은 SQL을 직접 실행해야 한다는 뜻이다. pre-deploy를 왜 껐는지(원래 뭐가 안 됐는지)는 아직 확인 안 됨 — todo.md 참고.
  - `onDelete`는 `Restrict`가 아니라 `SetNull`을 선택함 — 이번이 첫 롤아웃이라 혹시 놓친 예외 케이스가 있어도 카드 재계산 전체가 하드 실패하기보다는 조용히 링크만 끊어지는 쪽을 우선함. 안정성이 확인되면 나중에 `Restrict`로 강화하는 걸 검토할 수 있음.
  - **후속 정정 (2026-07-25):** 당시 범위 밖이던 문자열 기반 조회·표시 복구 헬퍼는 이후 삭제됐고 현재 읽기 경로는 FK join으로 전환됐다.
  - `cardId` 문자열 컬럼 제거는 안 함 — 읽기 경로 전환 검증 끝난 뒤 별도 phase에서.
- **다음 단계 (미착수)**: 운영 배포 후 `assignmentCardId` 백필이 실제로 몇 건 채워졌는지 확인(`npm run` 검증 스크립트 신설 여지 있음, 기존 `verify:workorder-item-backfill` 패턴 재사용 가능) → 읽기 경로를 하나씩 FK 기반으로 전환 → `cardId` dual-read 제거 → 컬럼 DROP.

### 44. 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 전면 재설계 — Phase A (스키마+백필만, 완료)

- 배경: 사용자가 Railway DB 화면에서 `AssignmentCard.payload` JSON을 직접 보고, FK+join으로 만들어달라고 반복 요청했음에도 실제로는 스타일명/스타일코드/고객사명/이미지URL 등이 전부 텍스트로 중복 저장되고 있는 걸 발견. `AssignmentPlan`도 같은 문제(게다가 `styleId` FK 컬럼이 있는데 어떤 저장 경로도 채운 적이 없어 100% NULL)라고 지적. 세 번의 코드 조사 + Plan 에이전트 설계를 거쳐 4단계 계획을 확정(Phase A~D), 이번 세션은 **Phase A만** 구현.
- **명명 규칙**: 새 FK는 `customerId`가 아니라 `buyerOrgId`(`Organization` 참조) — `WorkOrder.buyerOrgId`와 동일한 이름. `WorkOrder.buyerOrgId`/`customerId`는 저장 시점에 항상 같은 값으로 맞춰짐(`normalizeOrderPayload`, `backend/src/index.ts:5334-5341` 부근)이 확인되어 `buyerOrgId`를 기준으로 삼음.
- **Phase A 구현 내용** (`backend/prisma/schema.prisma`, `backend/migration_fix.sql` Step 0l, `backend/src/index.ts`):
  - `AssignmentCard`에 `styleId Int?`(→Style), `workOrderId Int?`(→WorkOrder), `buyerOrgId Int?`(→Organization, named relation `AssignmentCardBuyerOrg`) 추가. `payload` JSON에 이미 있던 값(styleId/workOrderId는 그대로, buyerOrgId는 workOrderId를 통해 join)을 실제 컬럼으로 승격.
  - `AssignmentPlan`에 `buyerOrgId Int?`(→Organization, named relation `AssignmentPlanBuyerOrg`) 추가. `styleId` 컬럼 자체는 이미 있었음(Step 0j, 2026-07-01) — 이번엔 컬럼 추가가 아니라 백필만.
  - `Organization`에 `buyerAssignmentCards`/`buyerAssignmentPlans` named 역관계 추가(기존 unnamed `assignmentCards`/`assignmentPlans`와 공존, `WorkOrder.buyerOrg`가 쓰는 것과 동일한 named-relation 패턴). `Style`/`WorkOrder`에도 `assignmentCards AssignmentCard[]` 역관계 추가.
  - `migration_fix.sql` 맨 위(기존 Step 0k보다 위)에 **Step 0l** 추가: `AssignmentCard.styleId`/`workOrderId`는 `payload->>'styleId'`/`'workOrderId'`에서 직접 백필(이미 검증된 정수라 모호함 없음), `buyerOrgId`는 방금 채운 `workOrderId`로 `WorkOrder`를 join해서 `COALESCE(buyerOrgId, customerId)`로 백필. **`AssignmentPlan.styleId`/`buyerOrgId`는 반드시 `assignmentCardId`를 통해서만 백필**(`AssignmentPlan.assignmentCardId → AssignmentCard.styleId/buyerOrgId`, 독립 재추정 금지) — `assignmentCardId`가 없는 옛 행은 null로 남김(Step 0k와 동일 원칙).
  - 시작 시 필수 컬럼 체크(`assertGeneratedPrismaClientShape`, `hasField` 목록)에 이번에 추가한 4개 컬럼 전부를 **같은 커밋**에 추가 — 어제 아침 사고(§43)가 정확히 이 항목을 빼먹어서 났으므로 반드시 같이 넣음.
  - 별개지만 같이 처리: `resolveAssignmentPlanStyleMetaById`(`backend/src/index.ts:6160` 부근)가 `payload?.styleUid`를 읽던 오타를 `payload?.styleId`로 수정 — `AssignmentCard.payload`는 애초에 `styleUid`라는 키를 가진 적이 없어서 이 폴백 분기가 지금까지 항상 조용히 아무것도 매칭 못 하고 있었음.
  - `npm run prisma:validate`/`prisma:prepare-client`/`npm run build` 전부 통과.
- **Phase A 이후 진행 상황**: Phase B(쓰기 연결)/C(조회 join 전환)/D(죽은 컬럼 삭제)는 아래 §45에서 모두 완료.
- **운영 배포 시 필수**: pre-deploy가 꺼져 있으므로(§43 참고) 배포해도 이 Step 0l이 자동 적용되지 않는다 — 반드시 운영 DB에 직접 접속해 수동으로 SQL을 실행하고, `information_schema.columns`로 컬럼 생성을 직접 확인해야 한다. 자동 적용을 가정하지 말 것.

### 45. 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 전면 재설계 — Phase B/C/D (완료)

- §44 Phase A(스키마 추가 + 백필)에 이어 나머지 세 단계를 같은 세션에서 완료.
- **Phase B (신규/수정 저장 경로가 새 FK를 채우도록 연결)**:
  - `buildAssignmentCardsFromOrders`: 카드 payload에 `buyerOrgId` 추가.
  - `syncAssignmentCardsForOrg`의 upsert(create/update 양쪽): `styleId`/`workOrderId`/`buyerOrgId` 추가.
  - `syncAssignmentPlanWorkOrderRefs`: 이미 조회하고 있던 `matchedWorkOrder.buyerOrgId`를 반환 객체에 포함.
  - `PUT /assignment-board-state`의 `matchedAssignmentCards` 조회를 확장해 `cardId -> {id, styleId, buyerOrgId}` 맵으로 만들고, `toAssignmentPlanWriteData`가 이 맵에서 `styleId`/`buyerOrgId`를 채움(독립 재추정 금지, Phase A와 동일 원칙).
- **Phase C (조회 경로를 join 기반으로 전환, 깨진 자가치유 로직 제거)**:
  - `toAssignmentCardFromStoreRow`/`loadAssignmentCardsForOrg`: `select`에 `style`/`workOrder`/`buyerOrg` relation을 포함시키고, `styleName`/`styleCode`/`previewUrl`/`orderNo`/`customer`/`customerNameKo`/`customerNameVi` 등을 "join 값 우선, 없으면 기존 문자열 폴백" 방식으로 전환. 응답 JSON 필드명은 그대로 유지(프론트 수정 불필요).
  - `toAssignmentPlanResponse`, `ASSIGNMENT_PLAN_SELECT_CORE`/`_LEGACY`, `GET /assignment-plans`, `buildAssignmentPlanProgressRows`, `buildAssignmentPlanCloseResponse`, `toWorkLogContextAssignmentResponse`에 동일한 join-우선 처리(`orderNo`/`customer`/`label`/`previewUrl`) 적용.
  - `resolveAssignmentPlanStyleMetaById`의 `styleUid` 오타는 Phase A에서 이미 수정됨(§44 참고).
  - **깨진 자가치유 로직 완전 제거**: `repairAssignmentPlanDisplayRows`, `assignmentPlanNeedsDisplayRepair`, `ASSIGNMENT_PLAN_DISPLAY_FIELDS`와 `GET /assignment-plans`/`GET /assignment-board-state`의 호출부 2곳을 삭제. **후속 정정 (2026-07-25):** 당시 유지한다고 적은 write-time 표시 복구 함수와 공유 헬퍼도 이후 전부 삭제됐다. 현행 코드에는 존재하지 않는다.
- **Phase D (죽은 컬럼 삭제)**:
  - 삭제 대상: `AssignmentPlan.colorId`(+FK), `colorName`, `color`, `stripeColor`, `imageUrl`, `thumbnailUrl`. (`AssignmentCard.colorId/colorName/gender`는 애초에 실제 DB 컬럼이 존재한 적이 없어 — payload JSON 안의 죽은 키였을 뿐 — 스키마/migration 변경 대상이 아니었고, Phase A에서 이미 `buildAssignmentCardsFromOrders`의 `colorId: null, colorName: null, gender: null` 세 줄만 제거함.)
  - `schema.prisma`: 위 6개 필드와 `AssignmentPlan.attrColor` relation, `AttrColor.assignmentPlans` 역관계, `@@index([colorId])` 제거.
  - `migration_fix.sql` 맨 위에 **Step 0m** 추가(Step 0l보다 위): `DROP CONSTRAINT IF EXISTS "AssignmentPlan_colorId_fkey"` + 6개 컬럼 `DROP COLUMN IF EXISTS`. 이 6개는 (a) `colorId`/`colorName` — 프론트가 실제 색상값을 보낸 적이 없어 항상 null(색상/성별은 배정 단위에서 추적하지 않는다는 도메인 규칙, §37 참고), (b) `color`/`stripeColor` — 이름과 달리 원단 색상이 아니라 CT/ST/PT/AT 기준별 화면 색상 코딩용 write-only 값(프론트는 조회 시 매번 `basis`로 재계산), (c) `imageUrl`/`thumbnailUrl` — `Style`에 별도 썸네일 필드가 없어 join해도 `previewUrl`과 같은 값의 세 번째 사본이 될 뿐이라 삭제로 결정(§44 계획 참고). 백필 대상이 아니므로(원래부터 죽은 값) Phase A류 별도 verify 스크립트 없이 코드 감사로 충분하다고 판단.
  - 코드에서 이 6개 필드를 쓰거나 읽던 모든 지점 정리: `toAssignmentPlanWriteData`(쓰기 제거), `ASSIGNMENT_PLAN_SELECT_CORE`/`_LEGACY`/`COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT`(select에서 제거), `toAssignmentPlanResponse`/`GET /assignment-plans`/`buildAssignmentPlanProgressRows`/`buildAssignmentPlanCloseResponse`/`toWorkLogContextAssignmentResponse`(응답 필드는 하위호환을 위해 정적 값 `null`/`""`으로 고정), `syncAssignmentPlanColorRefs` 함수 전체와 `resolveAssignmentPlanColorName` 함수 전체 삭제(둘 다 이 6개 필드 전용이었고 실사용 시 항상 no-op였음이 확인됨), `syncGlobalCategorySection`(AttrColor 이름 변경 시 `AssignmentPlan.colorName`을 역전파하던 블록) 삭제.
  - `assertGeneratedPrismaClientShape`의 `hasField` 체크를 "있으면 문제"로 반전 추가(6개 전부, `Style.uid still present`와 동일 패턴).
  - `npm run prisma:prepare-client` + `npm run build`(backend) 통과 확인. 당시 `test:quantity-change`의 서브테스트 1개(`'PT' !== 'ST'`)가 실패했으나, 해당 죽은 코드/테스트는 2026-07-08 삭제되어 현재 `npm run test:regression`에는 포함되지 않는다.
- **응답 하위호환**: `colorId`/`color`/`stripeColor`는 `null`/`""`, `colorName`/`imageUrl`/`thumbnailUrl`은 `""`로 고정 응답. 프론트가 이 필드들을 실제로 다시 읽는 곳이 없음을 이미 확인했으므로(§37 조사) 정적 값으로 고정해도 동작에 영향 없음.
- **운영 DB 적용 완료 (2026-07-06)**: `DATABASE_PUBLIC_URL`로 직접 접속해 적용 전 6개 컬럼 존재 + 전부 non-null 0건(및 `AssignmentPlan` 전체 0행, §39 사고 이후 미복구 상태와 일치)을 먼저 확인한 뒤 Step 0m SQL을 실행했고, 재조회로 6개 컬럼이 모두 사라졌음을 확인했다. Phase A~D 전체 완료.

### 46. 2026-07-06 AssignmentCard/AssignmentPlan FK+Join 전면 재설계 — Phase E (완료, orderNo/customer/label/previewUrl + payload 순수 중복 텍스트 정리)

- 배경: §45(Phase A~D) 완료 직후 사용자가 Railway DB 화면에서 `AssignmentPlan` 테이블을 다시 확인하고 `orderNo`/`customer`/`label`/`previewUrl`/`cardId`가 여전히 컬럼으로 남아있는 것과 `AssignmentCard.payload`에 `styleCode`/`styleName`/`previewUrl`/`customerNameKo`/`customerNameVi`/`cardAtTotalSeconds` 등이 여전히 저장되는 것을 지적("결론적으로 시킨거 하나도 반영이 안되어 있어"). 확인 결과 정당한 지적이었다 — Phase A~D는 "새 FK 추가 + 읽기는 join 우선"까지만 했고, 원래 있던 텍스트 컬럼/payload 키를 실제로 끊어내는 마지막 단계(Phase A~D 계획 문서의 "Phase D"가 처리한 색상 계열과 달리, `orderNo/customer/label/previewUrl`은 스킵됨)를 안 밟았었다.
- **Supabase 착시 아님, 실제 결과 재확인**: `mainline.proxy.rlwy.net:31661`(Railway) 재접속으로 Phase D의 6개 색상 컬럼은 실제로 사라졌음을 재확인. 사용자가 지적한 `orderNo/customer/label/previewUrl`은 Phase D 범위 밖이라 실제로 남아있던 것이었다(착시가 아니라 진짜 미완료).
- **cardId는 이번 범위에서 제외**: 다른 3+1개 필드와 달리 `cardId`는 순수 중복 텍스트가 아니라 카드 upsert의 유일 키(`@@unique([orgId, cardId])`)이자 122곳 이상의 매칭 로직이 참조하는 값이다. `assignmentCardId`(정수 FK)로 이론상 완전히 대체 가능하지만 그 전환은 훨씬 큰 별도 작업이라 이번엔 손대지 않음(사용자에게 설명 후 동의됨).
- **createdBy는 이번 재설계와 무관**: 스키마 전체 26개 테이블에 공통인 감사(audit) 필드 패턴(`AsyncLocalStorage`로 요청 주체 이메일 자동 주입)이며, FK로 안 건 이유는 계정 삭제 후에도 "누가 만들었는지" 기록을 남기기 위한 의도적 전역 설계로 보임 — AssignmentPlan/Card 이슈와 별개, 바꾸려면 전체 테이블에 영향 주는 별도 작업.
- **AssignmentPlan.orderNo/customer/label/previewUrl 컬럼 완전 삭제**:
  - `schema.prisma`에서 4개 필드 제거.
  - `migration_fix.sql` 맨 위(Step 0m보다 위)에 **Step 0n** 추가: 4개 컬럼 `DROP COLUMN IF EXISTS`. Phase D의 색상 컬럼과 달리 이 4개는 **이번 세션 전까지는 실제로 매 저장마다 값이 채워지고 있었다** — "원래부터 죽은 값"이 아니므로 migration 주석에 이 차이를 명시하고, 실행 전 운영 `AssignmentPlan` 행 수 재확인을 권고 문구로 남김(작성 시점 기준 0행 확인됨, §39/40/42 사고 이후 미복구 상태와 일치).
  - **쓰기 중단**: `toAssignmentPlanWriteData`, `COMPLETED_ASSIGNMENT_PLAN_WRITE_SELECT`/`buildCompletedAssignmentWriteComparable`(완료 assignment 구조변경 감지 대상에서도 제외 — 더 이상 실제 write 필드가 아니므로), `normalizeAssignmentPlanPayload`(customer/label/previewUrl 및 이미 죽어있던 colorId/colorName/imageUrl/thumbnailUrl/color/stripeColor까지 같이 정리 — `orderNo`는 `syncAssignmentPlanWorkOrderRefs`의 주문 매칭 입력값으로 여전히 필요해 유지), `syncAssignmentPlanWorkOrderRefs`(반환 객체에서 orderNo/customer 출력 제거, workOrderId/buyerOrgId만 반환)에서 전부 제거.
  - **2026-07-20 정합성 메모**: 완료 assignment 변경 감지는 `toAssignmentPlanWriteData()` / `buildCompletedAssignmentWriteComparable()` 기준의 실데이터 필드만 본다. `orderNo`, `customer`, `label`, `previewUrl`, `colorId`, `colorName`, `imageUrl`, `thumbnailUrl`, `color`, `stripeColor` 같은 join-only/read-only display 필드는 비교 대상이 아니다.
  - **읽기를 join-only로 전환**: `toAssignmentPlanResponse`/`GET /assignment-plans`/`buildAssignmentPlanProgressRows`/`buildAssignmentPlanCloseResponse`/`toWorkLogContextAssignmentResponse`의 `?? plan.orderNo` 같은 컬럼 폴백을 전부 제거하고 `workOrder.orderNumber`/`buyerOrg.name`/`style.name`/`style.imageUrls[0]` join 값만 사용(없으면 `""`).
  - **select 상수 정리**: `ASSIGNMENT_PLAN_SELECT_CORE`/`_LEGACY`에서 4개 스칼라 필드 제거. **`_LEGACY`에도 `workOrder`/`style`/`buyerOrg` relation을 새로 추가**(기존엔 CORE에만 있었음) — `workOrderId`/`styleId`/`buyerOrgId`는 시작 시 `hasField` 게이트로 항상 존재가 보장되므로, "레거시(스키마 드리프트 허용)" select에서도 안전하게 relation을 쓸 수 있다고 판단.
  - **`ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE`라는 공유 상수를 신설**(`ASSIGNMENT_PLAN_SELECT_CORE` 바로 위): `select`가 아니라 `include`가 필요한 개별 `findUnique`/`findFirst` 호출부(전체 스칼라 컬럼 + 표시용 relation이 동시에 필요한 곳)에서 재사용.
  - **이번에 처음 발견한, Phase C 문서에는 없던 실제 버그**: `completeAssignmentPlanProduction`과 `PATCH /assignment-plans/:externalId/final-quantity`의 완료 처리 트랜잭션 안 `tx.assignmentPlan.findUnique({ where: { id: plan.id } })` 2곳이 `select`/`include` 없이 스칼라 전체만 가져오고 있어서, `buildAssignmentPlanCloseResponse`의 "join 우선" 로직이 이 두 응답 경로에서는 **항상 폴백(저장된 텍스트 컬럼)만 타고 join은 한 번도 실행된 적이 없었다**. 이번에 `include: ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE`를 추가해서 실제로 join이 동작하도록 고쳤다 — Phase C가 "구현했다"고 문서화했던 것과 실제 동작이 달랐던 사례.
  - **work-logs 엑셀 임포트의 `orderNo` WHERE 필터를 relation 필터로 전환**: `where: { orderNo: { in: planOrderNos } }` → `where: { workOrder: { orderNumber: { in: planOrderNos } } }`. `orderNo`는 단순 표시값이 아니라 이 경로에서 실제 **쿼리 매칭 키**로 쓰이고 있었다(발견 당시 반드시 처리해야 했던 항목). 같은 함수(`resolveWorkLogImportAssignmentCandidate`) 내부의 인메모리 매칭 비교(`plan?.orderNo`, `plan?.label`)도 `plan?.workOrder?.orderNumber`/`plan?.style?.name`로 변경, `resolveAssignmentPlanStyleQueryValues`의 스타일 매칭 후보 목록도 동일하게 수정.
  - **급여 잠금 검증(`validateAssignmentPlanPayrollLock`)/CT snapshot 검증(`validateWorkLogAssignmentPlanCtSnapshot`)/`formatAssignmentPlanLabel`의 select**도 `orderNo/label` 스칼라 대신 `ASSIGNMENT_PLAN_DISPLAY_JOIN_INCLUDE`로 교체. `formatAssignmentPlanLabel` 자체도 join 값을 읽도록 수정.
  - **AT 학습 파이프라인(`loadAtTrainingSourceWorkLogs`)의 `WorkRecord.assignmentPlan` nested select**: `{ customer: true, orderNo: true }` → `{ workOrder: { select: { orderNumber: true } } }`로 교체(`customer`는 애초에 이 함수 안에서 소비된 적이 없는 죽은 select 필드였음도 같이 확인/정리). 소비 지점(`record.assignmentPlan?.orderNo`)도 `record.assignmentPlan?.workOrder?.orderNumber`로 수정.
  - **작업기록 응답용 `loadWorkRecordResponseDisplayContext`**: `db.assignmentPlan.findMany`의 select를 `{orderNo,customer,label}` → `{workOrder:{orderNumber},buyerOrg:{name},style:{name}}`로 교체하고, `assignmentPlanMetaById`에 담기 직전 join 값을 `orderNo`/`customer`/`label` 키로 재조립(`hydrateWorkRecordResponseDisplayFields`가 이 필드명을 그대로 읽으므로 소비 지점은 무수정) — 이 경로는 실사용되는 작업기록 표시 데이터라 Phase D의 "완전히 죽은 값" 케이스들과 달리 신중하게 처리함.
  - `findAssignmentPlansWithSelectFallback`의 `selectAttempts` 타입을 `ReadonlyArray<Record<string, true>>` → `ReadonlyArray<Record<string, any>>`로 완화(relation을 포함한 select 객체를 받을 수 있도록, TS 빌드 에러 원인이었음).
- **AssignmentCard.payload 순수 중복 텍스트 정리**: `stripLegacyAssignmentCardPayload`(write-time sanitizer, `normalizeAssignmentCardsForStore`가 저장 직전 호출)에서 `styleCode`/`styleName`/`previewUrl`/`orderNo`/`dueDate`/`customer`/`customerNameKo`/`customerNameVi`를 저장 payload에서 제거하도록 확장. `toAssignmentCardFromStoreRow`(Phase C에서 이미 join-우선으로 구현됨)가 이 필드들을 `style`/`workOrder`/`buyerOrg` relation에서만 읽게 되므로 응답 필드 자체는 그대로 유지된다(값의 출처만 payload JSON에서 join으로 완전히 바뀜). **범위에서 제외한 것**: `styleId`/`workOrderId`/`buyerOrgId`(실제 FK 값이라 원래도 중복이 아니었고, `toAssignmentCardFromStoreRow`가 이 3개는 override 없이 payload spread로 그대로 반환하므로 지우면 응답에서 사라짐 — 유지), `cardQuantity`/`cardPtTotalSeconds`/`cardAtTotalSeconds`/`cardStTotalSeconds`/`processCount`/`status`(Style.processes × 수량으로 계산되는 **집계값**이지 순수 텍스트 복사가 아니라서 이번 phase 범위 밖으로 명시적으로 남김 — recompute-on-read로 갈지 계속 저장할지는 별도 정책 결정 필요).
- 검증: `npm run prisma:prepare-client` + `npm --prefix backend run build` 통과. 당시 `test:quantity-change`의 동일한 1개 서브테스트(`'PT' !== 'ST'`)가 실패했으나, 해당 죽은 코드/테스트는 2026-07-08 삭제되어 현재 회귀 스위트에는 남아 있지 않다.
- **운영 DB 적용 완료 (2026-07-06)**: `DATABASE_PUBLIC_URL`로 직접 접속해 적용 전 4개 컬럼 존재 + 전부 non-null 0건(및 `AssignmentPlan` 전체 0행, §39 사고 이후 미복구 상태와 일치)을 먼저 확인한 뒤 Step 0n SQL을 실행했고, 재조회로 4개 컬럼이 모두 사라졌음과 `AssignmentPlan` 최종 컬럼 목록이 `schema.prisma`와 정확히 일치함을 확인했다. Phase A~E 전체 완료.

### 47. 2026-07-07 OrgMembership → Employee 계정 테이블 통합 (Codex 구현, 완료 — 상세 리뷰로 검증됨)

- 배경: `OrgMembership`(로그인 계정/권한)과 `Employee`(제조사 현장 인사정보)가 별도 테이블로 나뉘어 있던 것을, Codex에게 "Employee를 모든 Organization 소속 계정의 canonical table로 승격하고 OrgMembership을 제거"하는 방향으로 구현시켰다. 사전에 이 방향에 대한 설계 리뷰(위험 지점, 이름 충돌, partial index 필요 여부, 단계별 순서)를 별도로 거친 뒤 진행됨.
- **최종 스키마**: `Employee`에 `email`(nullable), `orgRole`(`OrgUserRole` enum: ADMIN/OPERATOR/ACCOUNTANT/WORKER — 시스템 접근 권한), `status`(`EmployeeStatus` enum: PENDING/ACTIVE/REJECTED/SUSPENDED/TERMINATED, DB 물리 enum 이름은 `@@map("OrgMembershipStatus")`로 유지), `requestedAt`/`requestedName`/`approvedAt`/`approvedBy`가 추가됨. 기존 `Employee.roleId`(→`AttrRole`, 조직별 커스터마이징 가능한 현장 직무 — 감독/봉제/다림/검수/포장 등)는 **리네임하지 않고 그대로 유지** — `orgRole`(시스템 권한)과 `roleId`(현장 직무)는 이름이 비슷해 보이지만 서로 다른 축이며, 이름 하나로 합치지 않은 것이 맞는 선택이었다.
- **unique 제약**: `@@unique([orgId, email])`, `@@unique([orgId, employeeNo])` 둘 다 **일반(non-partial) Prisma 유니크**로 선언됨 — Postgres는 원래 UNIQUE 제약에서 NULL끼리 서로 다르게 취급하므로 "값이 있을 때만 유일"이 별도 partial index 없이 자동으로 충족된다(`Factory.factoryCode`처럼 raw SQL partial index로 우회할 필요가 없었음).
- **마이그레이션(`migration_fix.sql` Step 0o)**: 기존 `OrgMembership` 행을 `orgMembershipId`로 매칭되는 `Employee`에 백필하고, 매칭되는 `Employee`가 없는 행(주로 발주처 계정, 그리고 갓 온보딩된 조직의 첫 ADMIN 계정)은 새 `Employee` 행으로 INSERT한 뒤, `orgMembershipId` FK/컬럼을 제거하고 마지막에 `DROP TABLE IF EXISTS "OrgMembership"`. 순서가 안전하게(백필 → FK 제거 → 테이블 삭제) 짜여 있고 전부 `IF EXISTS`로 멱등 처리됨. `emp+%@baro.local` 형태의 가짜 이메일도 이 백필 중 NULL로 정리됨(가짜 이메일 금지 원칙 준수).
- **audit FK**: `Employee.createdByEmployeeId`/`updatedByEmployeeId`(nullable, self-referencing) 추가. `requestActor.ts`의 AsyncLocalStorage store에 `employeeId` 필드를 추가해서, `middleware/access.ts`가 요청당 한 번 수행하던 기존 Employee 조회 결과를 그대로 그 store에 mutate로 채워넣고(`setCurrentRequestActorEmployeeId`), `db.ts`의 Prisma extension이 그 값을 읽어 `createdByEmployeeId`/`updatedByEmployeeId`를 자동 채운다 — **추가 DB 조회 없이** 기존 인증 조회를 재사용하는 구조로, 26개+ 테이블 저장 경로를 하나도 직접 건드리지 않았다. 문자열 `createdBy`/`updatedBy` 스냅샷은 그대로 유지(SystemUser/배치 작업처럼 Employee가 없는 행위자를 위해 필수).
- **시작 시 스키마 드리프트 게이트**: `hasField("Employee","orgRole")`/`("Employee","status")` 필수 체크 추가, `modelByName.has("OrgMembership")` "있으면 문제" 역방향 체크 추가, `STARTUP_FORBIDDEN_RUNTIME_TABLES = ["OrgMembership"]`로 물리 테이블 자체의 부재까지 별도로 재확인(3중 방어).
- **API 하위호환**: `org-memberships/orgMembership.routes.ts` 파일/폴더명과 `/org-memberships` 라우트 경로는 그대로 유지하되 내부 구현은 100% `prisma.employee`로 교체됨(파일 안에 `prisma.orgMembership.*` 호출 0건 확인). 응답 필드도 `role: employee?.orgRole ?? "WORKER"`처럼 프론트가 원래 기대하던 이름(`role`)을 그대로 유지하는 얇은 매핑을 API 경계에서 해줘서 프론트 수정이 거의 필요 없었다(`frontend/src/pages/App/employee/EmployeeBoard.jsx`는 무수정으로 계속 동작).
- **사후 검증 (Codex, todo.md 기록)**: 세션 전용 `DATABASE_PUBLIC_URL`로 직접 접속해 `information_schema`로 `OrgMembership` 테이블 부재, `Employee.orgMembershipId` 컬럼 부재, `Employee`의 신규 계정 컬럼(`email`/`orgRole`/`status`/`requestedName`/`approvedAt`) 존재를 확인하고 마이그레이션 후 `Employee` 행 수(20건)까지 todo.md에 기록함 — 이 세션에서 확립한 운영 DB 검증 관행을 그대로 따름.
- **별도 세션에서 사후 전수 검토 수행 (레거시/숨은 폴백 여부 확인)**: `prisma.orgMembership.*` 호출 전체 재검색(0건), `middleware/access.ts`의 `context.orgMembership`/`toOrgMembershipCompat`이 실제로는 이미 조회한 Employee를 재포장만 하는 순수 함수임을 확인(추가 쿼리·구 테이블 접근 없음), `payroll.service.ts`의 `employee.membership.*` 접근이 전부 `employee.*`로 평탄화됐음을 diff로 확인 — **기능적으로 숨겨진 폴백이나 레거시 테이블 참조는 발견되지 않았다.**
- **발견된 유일한 실제 결함 (같은 세션에서 즉시 수정, 커밋 `72f608e`)**: `backend/src/work-records/workRecord.shared.ts`(이번 통합 작업과 무관하게 몇 주 전부터 있던 별도 모듈)의 `WORK_RECORD_WITH_REFS_INCLUDE` 상수가 §46에서 이미 삭제된 `AssignmentPlan.orderNo/customer/label`을 여전히 select하고 있어서, `GET /work-logs?includeRecords=1`(작업기록 목록 화면)이 매번 500 에러를 내고 있었다. **이건 Codex의 실수가 아니라 §46 작업 중 `backend/src/index.ts`만 grep하고 별도 디렉토리(`src/work-records/`)를 놓친 내 실수였다.** `workOrder.orderNumber`/`buyerOrg.name`/`style.name` join으로 교체하고, 유일한 소비처(`hydrateWorkRecordResponseDisplayFields`)도 join 경로를 읽도록 같이 수정.
- **사소한 네이밍 잔재 (기능 문제 아님, 정리 안 함)**: `context.orgMembership`/`toOrgMembershipCompat` 함수명, `index.ts` 일부의 `membershipStatus`/`membershipRole` 지역 변수명(실제로는 `worker.status`/`worker.orgRole`를 읽음), `org-memberships` 폴더/라우트 경로 — 전부 이름만 옛 관습이고 실제 데이터 흐름은 Employee 기준. todo.md에 "나중에 API 이름 정리 가능(추가 DB 마이그레이션 불필요)"이라고 이미 기록돼 있음.

### 49. 2026-07-13 작업기록 import 중복 판정이 스타일 단위라 서로 다른 주문을 오탐하던 문제 (완료)

- 증상: 6월 작업기록 엑셀 업로드 시 "같은 작업일자에 작업자/스타일/공정이 중복되었습니다 (worker#92 / S-UYKJKN / StyleProcess#465; ...466; ...467 (+1 more))" 오류로 저장이 막힘. 화면에 뜬 "26 JUN / 2행"은 실제 문제 행이 아니라 그룹 대표 행(anchor row)이었다 — 이 파일은 기간(coverageStartDate~coverageEndDate)이 01/06~30/06으로 전체 로우가 동일해 391행 전체가 사실상 한 그룹으로 처리됐고, 실제 중복은 213~216행/368~371행이었다.
- **확정된 원인**: `buildWorkRecordWorkerStyleProcessSignature`(`backend/src/index.ts`)가 중복 판정 서명을 `workerId::styleMetricKey(=styleId 기반)::processMetricKey`로 만들고 있었다. 스타일은 여러 주문에서 재사용될 수 있는데(예: 스타일 `AJ2016`이 주문 `L16-2`(130장)와 `L16-3`(200장) 양쪽에 쓰임), 이 서명에는 주문(=AssignmentPlan) 구분이 전혀 없어서 "같은 작업자가 같은 스타일의 같은 공정을 서로 다른 두 주문에서 정당하게 작업한 것"을 "같은 행을 실수로 두 번 입력한 것"과 구분하지 못하고 막았다. 실제로 두 주문의 수량(130 vs 160)도 서로 달라 복붙 실수가 아니라 각자 다른 주문의 실제 작업이었다(운영 DB 확인: styleId=19(AJ2016)에 대해 `AssignmentPlan` id 326(L16-2, 130장)/332(L16-3, 200장)/340(L16-4, 200장)로 전부 별개 배정임을 확인).
- **수정**: 서명의 스타일 축을 `styleId`에서 `assignmentPlanId`로 교체했다 — `${workerId}::assignmentPlan:${assignmentPlanId}::${processMetricKey}`. `AssignmentPlan` 단위가 이미 "주문 × 스타일"이므로(§9) 이 축 하나로 주문+스타일을 동시에 구분한다. 이 시점에는 `WorkRecord.assignmentPlanId`가 이미 필수 검증을 통과한 뒤이므로(§WorkLog/WorkRecord 규칙, 비어 있으면 그 앞 단계에서 이미 저장을 거부함) 항상 채워져 있다고 가정해도 안전하다.
- **의도적으로 허용하는 케이스**: 같은 주문(=같은 assignmentPlanId)의 같은 공정을 여러 작업자가 나눠 입력하는 것은 정상이다. 중복 서명에 `workerId`가 포함되어 있으므로 C01을 3명이 나눠 만들면 3개 행 모두 허용된다. 주문량 초과/부족 생산은 중복 검사에서 솎아내지 않고 진행률/정산/검수 계열의 별도 기능에서 드러내야 한다.
- **여전히 막히는 케이스(의도된 동작)**: 같은 작업자가 같은 주문(=같은 assignmentPlanId)의 같은 공정을 두 번 입력하면 여전히 중복으로 막는다 — 이건 진짜 실수(복붙/중복 업로드)일 가능성이 높은 케이스라 보호를 유지했다.
- **2026-07-13 후속 수정(Codex)**: 수기 작업기록 화면(`WorkDetail.jsx`)의 프론트 중복 검사도 백엔드와 동일하게 `workerId + assignmentPlanId + styleProcessId` 기준으로 맞췄다. 이전 프론트 로직은 아직 `worker + style + process` 기준이라, 백엔드는 허용하는 "같은 스타일의 서로 다른 주문"을 저장 버튼 앞에서 막을 수 있었다.
- **2026-07-13 후속 수정(Codex)**: `/work-logs/import`에서 `DUPLICATE_WORK_RECORD`가 발생할 때 가능한 경우 `groupAnchorRow` 대신 실제 중복 record에 대응하는 엑셀 행을 이슈 위치로 붙인다. 다만 CT 스냅샷/급여 잠금/라인 검증 같은 그룹 단위 검증은 여전히 대표 행 위치를 쓸 수 있으며, 이건 별도 범위로 남긴다.
- 검증: `npm --prefix backend run build`, 루트 `npm run test:regression` 통과. 운영 DB 조회로 L16-2/L16-3/L16-4가 서로 다른 `AssignmentPlan.id`임을 직접 확인.

### 48. 2026-07-09 배정 CT 스냅샷이 클라이언트 메모리 상태를 그대로 신뢰하던 문제 (신규 배정 생성 시점 검증 추가, 완료)

- **2026-07-10 정정/후속 완료**: 아래 7/9 결론 중 "`validateNewAssignmentPlanCtSnapshotProcesses`는 로그만 남기고 저장은 통과"라는 완화책은 최종 안전장치로 부족했다. 현재 코드는 `PUT /assignment-board-state`에서 편집 가능한 배정의 CT 스냅샷을 서버가 `AssignmentCard.styleId` FK의 라이브 스타일 공정 기준으로 재생성하고, 클라이언트가 null/불완전 스냅샷을 보내도 기존 유효 스냅샷은 보존한다. 그 후에도 유효한 `assignmentCtSnapshot`/`assignmentCtTotalSeconds`를 만들 수 없으면 저장을 409로 막는다. 작업기록 연결 배정과 급여 잠금 배정은 기존 보호 규칙대로 스냅샷 재작성 대상에서 제외한다. 프론트도 `/assignment-cards?includeProcesses=1` 전체 로딩 실패 상태에서는 저장 가능 상태로 전환하지 않고, CT 재계산 실패 시 기존 유효 스냅샷을 null로 덮어쓰지 않는다. 단, 프론트 `styles` 배열이 비었다는 사실만으로 저장을 막지는 않는다 — 카드 자체가 실제 FK로 연결돼 있으면 서버가 그 FK를 따라 CT/ST를 계산한다.
- 증상: 작업기록 파일 등록 시 "주문 L15-2 / 스타일 AJ1528에는 공정 TS05 배정 카드가 없습니다" 에러. 그런데 스타일 화면(`스타일 → 공정 정보`)엔 TS05가 실제로 존재함.
- 1차 오진단(정정됨): 처음엔 "주문을 잠그는 순간 CT 스냅샷을 얼린다"고 설명했으나, 주문 잠금 시점 실행 함수 `syncAssignmentPlansForOrderLock`(`backend/src/index.ts:11746`)을 직접 읽어보니 이 함수는 기존 `AssignmentPlan`의 `assignmentQuantity`/`assignmentStTotalSeconds`만 조정할 뿐 `assignmentCtSnapshot`은 전혀 읽지도 쓰지도 않는다. 주문 저장/잠금은 CT 스냅샷과 무관하다.
- **확정된 원인**: `AssignmentPlan.assignmentCtSnapshot`은 배정 카드를 라인에 올려 배정 보드에서 저장(`PUT /assignment-board-state`)할 때 찍힌다. 이때 스냅샷의 `processes[]` 목록은 **백엔드가 최신 `StyleProcess`를 다시 조회해서 만드는 게 아니라, 프론트(`AssignBoard.jsx`)가 그 순간 메모리에 들고 있던 스타일 데이터를 그대로 넣어 보낸 값**이다(`toAssignmentPlanWriteData`, `backend/src/index.ts:12740` → `resolveNormalizedAssignmentCtSnapshot(item)`이 요청 바디의 `item.assignmentCtSnapshot`을 그대로 읽음). 만약 그 순간 브라우저 탭이 오래돼서(다른 탭에서 스타일에 공정을 추가한 뒤 이 탭을 새로고침 안 한 경우 등) 스타일 데이터가 오래된 상태였다면, 그 불완전한 목록이 그대로 영구 저장된다. 스타일 편집 이벤트(`workspaceDataEvents.js`)는 `window.dispatchEvent`/`addEventListener` 기반이라 **같은 브라우저 창 안에서만** 전파되고 다른 탭/창은 못 듣는다는 것도 확인됨(Codex 교차검증) — 여러 탭을 띄워두고 작업하는 실제 사용 패턴과 맞물리면 이 문제가 재현되기 쉽다.
- **예외로 남아있던 정당한 경로**: `refreshUnlinkedAssignmentPlanSnapshotsForOrg`(`backend/src/index.ts:11533`)/`buildRefreshedUnlinkedAssignmentSnapshot`(`:11396`)는 "아직 작업기록에 연결 안 된(unlinked)" 배정에 한해 라이브 스타일 기준으로 스냅샷을 다시 만드는 별도 경로다. 이번 수정은 이 경로를 건드리지 않았고, 이 경로가 정확히 어떤 조건에서 도는지는 별도 확인이 필요하다(추후 과제).
- **1차 수정(과했음, 되돌림)**: 처음엔 `PUT /assignment-board-state`에서 새로 생성되는 `AssignmentPlan`(`createPlanRows`)에 한해 스타일의 살아있는 `StyleProcess` 목록과 스냅샷의 `processes[]`를 비교해서, 빠진 공정이 있으면 저장 전체를 `409`로 거부하게 만들었다. 배포 직후 실제 운영에서 "이 배정을 만든 뒤 스타일 공정이 바뀌었습니다. 새로고침하고 다시 시도해 주세요" 에러가 스타일을 전혀 수정하지 않았는데도 뜨는 걸 사용자가 즉시 재현해서 보고함 — 저장 자체가 완전히 막히는 회귀였다.
- **진짜 원인 (재조사로 확인)**: 프론트 `buildAssignmentCtSnapshotForSave`(`frontend/src/pages/App/assign/AssignBoard.jsx:1392`)는 공정 하나라도 ST/CT 초를 계산 못 하면(`ctSeconds == null`, 라인 1517) 그 공정을 `null`로 남기고, `processes.length !== processSeeds.length`(라인 1555)에 걸려 **스냅샷 전체를 `null`로 반환**한다. 즉 특정 공정에 아직 ST/CT 시간이 설정 안 돼 있으면(예: 그 공정에 대한 `StyleProcessStandard` 버킷이 아직 없음) 프론트는 스냅샷을 아예 못 만들고 기존(구) 스냅샷을 그대로 쓰게 되는데, 이건 이 앱이 이미 다른 곳에서 정상으로 취급하는 상태다(§35: "ST 미설정 assignment는 forecast에서 제외하고 경고만 준다" — 하드 블록 아님). 1차 수정의 신규-생성 검증은 이 "정상적으로 ST가 아직 없는" 케이스와 "진짜로 브라우저가 오래돼서 빠진" 케이스를 구분하지 못하고 둘 다 똑같이 저장 자체를 막아버려서, ST 미설정 공정이 하나라도 있는 스타일은 새 배정을 아예 못 만드는 상태가 됐다.
- **최종 수정**: `validateNewAssignmentPlanCtSnapshotProcesses`(`backend/src/index.ts`, `toAssignmentPlanWriteData` 바로 아래)는 그대로 두되 **`409` 거부를 없애고 `console.warn` 진단 로그만 남기도록** 변경했다. 저장을 막지 않는다. 두 가지 원인(진짜 stale 브라우저 vs 정상적인 ST 미설정)을 구분하는 로직은 아직 없다 — 지금은 순수 로그로만 존재한다.
  - 프론트(`AssignBoard.jsx`)의 `resolveBoardSaveErrorMessage`에 추가했던 이 에러 전용 안내 분기는 백엔드가 더 이상 이 에러를 던지지 않으므로 그대로 삭제했다(죽은 코드 방치 금지 원칙).
  - 검증: `npm --prefix backend run build`, `npm run test:regression`, `npm --prefix frontend run build` 통과.
- **이번에 고치지 않은 것 (알려진 한계)**:
  - 이미 잘못 저장된 기존 배정(L15-2/AJ1528 등)은 여전히 자동 복구되지 않는다.
  - "진짜 stale 브라우저로 인한 누락"과 "해당 공정에 ST/CT가 아직 없어서 정상적으로 빠진 것"을 구분하는 로직이 없다 — 구분하려면 스타일의 해당 공정에 `StyleProcessStandard` 버킷이 실제로 있는지까지 확인해야 하는데, 이번엔 손 안 댔다(향후 과제로 남김).
  - `refreshUnlinkedAssignmentPlanSnapshotsForOrg`가 정확히 언제/무엇을 트리거로 도는지, 이번 케이스가 그 경로로 이미 커버됐어야 했는지는 미확인 상태로 남아있다.
  - 크로스탭 이벤트 전파(다른 탭의 스타일 편집을 열려있는 배정 보드 탭에 알리는 것) 자체는 고치지 않았다.
  - **교훈**: 이 앱의 ST/CT 관련 검증은 "값이 있으면 정확해야 한다"와 "값이 없을 수 있다(경고만)"를 구분해서 다뤄야 하는데, 1차 수정에서 이 구분을 놓치고 "완전성 검증 = 하드 블록"으로 성급하게 설계했다. 비슷한 검증을 추가할 땐 §35 같은 기존 "미설정 허용, 경고만" 패턴이 이미 있는지부터 확인할 것.

### 49. 2026-07-13 스타일 공정/PT/ST 편집 정책 (Codex 구현)

- 공정 정보 탭에서 사용자가 직접 입력하는 기준 시간은 PT뿐이다. ST는 매입 단가/타임 매트릭스 탭에서만 명시적으로 수정하고, AT는 작업기록/출퇴근 학습 결과로만 채운다.
- 새 공정을 처음 만들 때만 PT(1,000)를 기준으로 전체 ST(q) bucket을 초기 생성한다. 기존 공정의 PT를 수정하더라도 ST(q)는 자동으로 따라 바꾸지 않는다.
- 스타일 저장 payload에 `stBuckets`가 포함돼 있다는 사실만으로 ST 수정 의도로 해석하지 않는다. ST를 쓰는 요청은 `stBucketWriteMode: "MANUAL_EDIT"`와 실제 수정 bucket 목록(`stBucketUpdateQuantities`)처럼 명시적인 쓰기 의도를 가져야 한다.
- 기존 공정의 ST는 명시된 bucket만 부분 upsert/delete한다. 스타일 저장 과정에서 기존 `StyleProcessStandard` 전체를 delete/recreate하지 않는다.
- 공정 구조가 바뀌는 경우(AB를 합치거나 A를 나누는 등)는 기존 공정을 덮어쓰거나 삭제하는 것이 아니라 새 공정 row를 추가하는 방향을 우선한다. 작업기록이 연결된 `StyleProcess`를 삭제해 `WorkRecord.styleProcessId`를 orphan으로 만들면 안 된다.
- `Style.processes` JSON은 ST의 소스오브트루스가 아니다. 관계형 `StyleProcessStandard`와 차이가 난다는 이유만으로 JSON 값을 이용해 ST를 자가치유하거나 덮어쓰지 않는다.

### 50. 2026-07-13 PT 변경 시 ST(q) 일괄 업데이트 선택 정책 (Codex 구현)

- 기존 공정의 PT 변경은 기본적으로 PT만 반영하고 ST(q)는 유지한다. PT 변경 모달의 기본/권장 액션은 `ST 유지`다.
- 사용자가 `ST 전체 업데이트`를 명시적으로 선택한 경우에만 새 PT 값으로 전체 표준 ST bucket을 업데이트한다.
- 이 bulk update도 일반 ST 수정과 동일하게 `stBucketWriteMode: "MANUAL_EDIT"`와 `stBucketUpdateQuantities` 전체 bucket 목록을 실어 보낸다. 백엔드는 PT 변경 자체가 아니라 이 명시적 write intent만 보고 ST를 쓴다.
- 새 PT 값이 비어 있거나 0이면 `ST 전체 업데이트`를 허용하지 않는다. ST 전체 삭제를 PT 입력 실수로 유발하면 안 된다.
- 작업기록이 연결된 공정에서도 `ST 전체 업데이트`는 가능하지만, 기존/현재 계획 및 생산 지표에 영향을 줄 수 있음을 모달에서 경고한다.

### 51. 2026-07-13 라인-월 capacity 계획 부하가 실제 생산 진행을 반영하지 못하던 문제 (Claude 구현, 완료)

> 이 섹션 위쪽의 §49(2026-07-13, 작업기록 import 중복 판정)와 이 §51 둘 다 "§49"로 잘못 붙어 있던 기존 번호 충돌은 그대로 두고 다음 번호(51)로 이어서 적는다. 번호 자체보다 날짜와 내용으로 찾을 것.

- **증상**: 배정 보드에서 LINE #1(8명, 작업기록은 6월 30일까지 입력 완료, 배정 카드 대부분 90~100% 진행)을 봤을 때, 화면을 10월로 넘겨도 "계획 부하"가 계속 잡혀 있었다. 이미 생산된 만큼 남은 작업량이 줄어들어야 하는데, 마치 배정 카드의 전체 계획 시간을 진행률 반영 없이 그대로 쌓아올린 것처럼 보였다.
- **실측(운영 DB 직접 조회)**: LINE #1의 미완료 `AssignmentPlan` 43건을 진행률까지 반영해 다시 계산하면 남은 ST 총합은 **546.9시간 = 68.4 worker-day**(8명 기준 **8.5일**)이어야 한다. 반면 진행률을 전혀 반영하지 않은 원본 계획 ST 합은 **738.3 worker-day**(8명 기준 92.3일 ≈ 3.5개월)였고, 오늘(7/13)부터 3.5개월을 더하면 정확히 10월에 도달한다 — 화면 증상과 정확히 일치.
- **확정된 근본 원인 (`backend/src/index.ts`)**: `buildLineMonthCapacityRows`와 `buildAssignmentPlanProgressRows`가 진행률을 `progressRatio = Math.min(producedRatio, operationalProgressRatio)`로 계산하는데, `producedRatio`의 분자(`producedQuantity`)는 `assignmentCtSnapshot.processes[].styleProcessId`로 만든 `requiredProcessGroups`에서 나온다. 실제 운영 데이터를 확인해보니 **스냅샷에 `processCode`는 있지만 `styleProcessId`가 전부 `null`인 공정들이 있었다** — 이 경우 `requiredProcessGroups`가 빈 배열이 되고, `resolveProducedQtyFromProcessKeyTotals`는 빈 배열에 대해 항상 `0`을 반환한다. 그러면 `producedRatio`가 무조건 `0`이 되고, `Math.min(0, operationalProgressRatio)`이 `operationalProgressRatio`(실제로는 87.9%처럼 정상 값)와 무관하게 `progressRatio` 전체를 `0`으로 끌어내려 **`remainingStTotalSeconds = plannedStTotalSeconds`(진행률 0% 취급)가 매번 다시 계산됐다.** (실제 재현: plan id 311, L15-1/S-ZOOMEL, `operationalProgressRatio=0.879`인데 `requiredProcessGroups=[]`라 `progressRatio=0` → remaining이 planned 전체(1,532,550초)로 나옴.)
- **수정 (backend)**:
  - `requiredProcessGroups.length === 0`이면 `producedQuantity`/`producedRatio`를 `0`이 아니라 `null`로 둔다. 그러면 `progressRatio`가 `producedRatio ?? operationalProgressRatio ?? null`에서 `operationalProgressRatio`로 자연스럽게 넘어간다(styleProcessId에 의존하지 않는 별도 계산이라 이 데이터 갭의 영향을 안 받음).
  - `cumulativeTotalDone/totalDone > 0`인데도(=실제 작업기록은 있는데도) 두 비율 다 계산이 안 되는 진짜 "확인 불가" 케이스는 `isProgressUnknown`으로 별도 표시하고, 이 경우 `remainingStTotalSeconds = null`로 두어 **backlog 합계에서 제외**한다(0으로도, planned 전체로도 채우지 않음). `buildLineMonthCapacityRows`는 `progressUnknownAssignmentCount`를, `buildAssignmentPlanProgressRows`는 `isProgressUnknown` 플래그를 응답에 노출한다.
  - `buildLineMonthCapacityRows`에 라인별 `capacityOverlapCount`/`capacityOverlapSamples` 진단을 추가했다 — 같은 직원이 같은 날짜에 서로 다른 두 라인 모두에서 active로 카운트되는 경우(겹치는 `LineAssignment`)를 조용히 이중 계산하지 않고 드러낸다. 정상 쓰기 경로(`POST /line-assignments/assign`, 라인 일괄 배정)는 이미 `closeActiveLineAssignments`로 새 `LineAssignment`를 만들기 전에 그 직원의 기존 active 배정을 전부 닫으므로, 이 진단은 레거시 데이터나 극히 드문 동시 요청 race를 잡기 위한 것이지 정상 흐름에서 발생하는 걸 막는 신규 가드는 아니다(쓰기 경로 자체는 이미 안전한 것으로 확인, 추가 수정 안 함).
  - 라인 일 단위 capacity(`lineMonthlyCapacitySeconds`) 계산은 이미 `LineAssignment.startAt/endAt` × `Employee.joinedAt/leftAt` × 근무일(월~토, `OrganizationHoliday` 제외)을 정확히 교차해서 날짜별로 인원을 세고 있었다(기존 코드가 이미 구현돼 있었음, 이번에 새로 만들지 않음). `leftAt`은 이미 inclusive로 처리되고 있었다(`listDateKeysInclusiveForLineMonthCapacity`가 활성 종료일을 포함). `DEFAULT_LINE_DAILY_WORK_SECONDS = 8*3600`도 기존 그대로.
  - `forecastLoadPercent`(=화면의 "계획 부하")는 `forecastLoadStSeconds = min(entering, available)`로 이미 분자가 분모를 넘을 수 없게 설계돼 있어 100% 초과가 구조적으로 불가능했다.
- **수정 (frontend, `frontend/src/pages/App/assign/utils/lineMonthCapacity.js`)**:
  - `buildLineMonthCapacityBoardRows`가 앵커 월의 backlog 시작값(`currentBoardRemainingBacklogStSeconds`)을 더 이상 프론트에서 개별 assignment의 `remainingStTotalSeconds`를 다시 합산해서 만들지 않는다. 백엔드가 이미 `/line-month-capacity` 응답에 내려주는 `lineRemainingBacklogStSeconds`(라인 단위)가 있으면 그 값을 그대로 쓰고, 그 라인에 대해 백엔드 응답이 아예 없을 때만(예: fetch 실패) 프론트 재계산으로 폴백한다. 같은 이유로 월별 `forecastLoadStSeconds`/`carryInStSeconds`/`carryOutStSeconds`도 해당 라인·월의 backend row가 있으면 그 값을 그대로 쓰고, 없을 때만 프론트가 로컬로 다시 시뮬레이션한다 — 두 독립 구현이 같은 공식을 쓰더라도 서로 다른 인풋으로 갈라질 여지를 없앤 것.
    - **트레이드오프**: 이 때문에 앵커 월 backlog 합계(초 단위 숫자·퍼센트)는 이제 "마지막으로 저장된 보드 상태" 기준이지, 아직 저장하지 않고 드래그만 한 상태를 즉시 반영하지 않는다. 저장하면 `/line-month-capacity`가 다시 불려와 반영된다. 카드가 어느 라인에 몇 개 큐에 있는지(순서·목록)는 여전히 라이브 보드 상태를 그대로 보여준다 — 바뀐 건 집계 숫자의 소스뿐이다.
  - `resolveAssignmentForecastStTotalSeconds`(라인 요약 행/카드 ETA에 쓰이는 공용 함수)가 `assignment.remainingStTotalSeconds`가 없을 때 무조건 `plannedStTotalSeconds`/`stTotalSeconds`로 폴백하던 걸 없앴다. `isProgressUnknown === true`인 assignment는 `null`을 반환해(=집계에서 제외) "진행률 확인 불가"를 "0% 진행"으로 오판하지 않는다. `plannedStTotalSeconds` 폴백은 이제 "애초에 진행률 데이터 자체가 아직 없는(신규 배정 등)" 경우에만 남는다.
  - `buildLineQueueForecast` 내부에 따로 있던, 같은 폴백 버그를 가진 두 번째 구현(카드별 `remainingStTotalSeconds` 계산)을 제거하고 `resolveAssignmentForecastStTotalSeconds` 하나로 통일했다. 그래서 이제 카드 하나하나에 표시되는 남은 시간과, 라인 전체 backlog 합계가 서로 다른 계산식에서 나올 여지가 없다.
  - `plannedLoadPercent`("계획 부하")를 과거(historical) 달에서 `actualOutputPercent`(uncapped, 196% 등 가능)를 그대로 따르던 걸 `Math.min(100, actualOutputPercent)`로 캡했다. `actualOutputPercent` 자체는 여전히 uncapped로 그대로 보여준다(§41 원칙 유지, "실제 생산률은 100% 넘을 수 있다"). anchor/forecast 달의 `plannedLoadPercent`는 백엔드의 `forecastLoadPercent`를 우선 사용하고(위 항목과 동일한 "backend가 소스오브트루스" 원칙), 로컬 계산으로 폴백할 때도 `Math.min(100, ...)`을 한 번 더 씌운다.
  - `totalEstimatedLoadPercent`는 확인 결과 `LineMonthCapacityBoard.jsx`에서 "계획 부하"로 쓰이고 있지 않았다(이미 `plannedLoadPercent`만 그 자리에 렌더링됨) — 별도 제거/라벨 변경 불필요, 이번 조사로 확인만 하고 그대로 둠.
- **수정 (frontend, `frontend/src/pages/App/assign/components/LineMonthCapacityBoard.jsx`)**: 기존 `stUnknownAssignmentCount` 경고 문구 옆에 `progressUnknownAssignmentCount` 경고를 같은 패턴으로 추가했고, 카드에는 기존 완료/검토/작업완료 칩과 별개로(orthogonal) `isProgressUnknown`일 때 "진행률 확인 필요" 칩을 추가로 붙인다. `AssignBoard.jsx`는 `/line-month-capacity` 응답에 `capacityOverlapCount > 0`이면 콘솔에 경고를 남긴다(전용 UI 패널은 이번 범위에 넣지 않음, 운영 데이터 정합성 이슈라 눈에 띄면 되는 수준으로 판단).
- **검증**: `npm --prefix backend run build`, `npm --prefix frontend run build`, 루트 `npm run test:regression` 전부 통과. 운영 DB로 LINE #1의 43개 미완료 배정에 수정된 로직을 그대로 재현해 돌려본 결과 **총 남은 ST = 546.9시간(68.4 worker-day) = 8명 기준 8.5일**로, 사용자가 요청한 검증 시나리오 1("남은 ST 546.9시간이면 완료 예상이 8~9영업일 수준")과 정확히 일치함을 확인했다. `progressUnknownCount = 0`(이 라인의 모든 플랜이 `operationalProgressRatio` 폴백만으로 정상 해결됨).
- **이번에 하지 않은 것**:
  - 검증 시나리오 2~7(과거 달 196% 캡, 입사/퇴사 mid-month, 일요일/휴일 제외, remaining-only forecast, frontend/backend 불일치 방지)은 코드 경로상 이미 구현돼 있거나(캡·holiday·join/leave는 기존 코드가 이미 정확했음, 이번엔 진짜 필요했던 이슈만 고침) 이번 수정으로 자연히 만족되지만, **실제 브라우저로 눈으로 확인한 것은 아니다.** 다음에 이 화면을 열 때 LINE #1을 10월까지 스크롤해서 실제로 8~9일 근처에서 라인이 빈다고 나오는지, "확인 필요"/"ST 미설정" 배지가 잘못 남발되지 않는지 반드시 재확인할 것.
  - `LineAssignment` 쓰기 경로에 대한 신규 가드는 추가하지 않았다 — `closeActiveLineAssignments`가 이미 모든 알려진 생성 경로에서 겹침을 막고 있는 것을 코드로 확인했기 때문. 지금 운영 DB에 실제로 겹치는 `LineAssignment` 레코드가 있는지는 `capacityOverlapCount`가 실제로 0보다 큰 값을 반환하는지로 다음에 확인해야 한다(이번엔 로직만 추가, 운영 데이터로 값 자체를 조회하지는 않음).
  - `assignmentCtSnapshot.processes[].styleProcessId`가 애초에 왜 `null`로 저장됐는지(§48/§49의 CT 스냅샷 생성 이슈와 같은 계열로 보이지만 완전히 같은 원인인지)는 이번에 추적하지 않았다. 이번 수정은 "styleProcessId가 없어도 진행률 계산이 다른 손상되지 않은 신호(operationalProgressRatio)로 정상 동작하게" 만든 것이지, 스냅샷에 `styleProcessId`가 애초에 채워지도록 저장 경로를 고친 것은 아니다 — 근본적으로는 저장 시점에 `styleProcessId`가 채워지는 게 맞고, 이번 수정은 그게 안 채워진 기존/향후 데이터에 대한 방어책이다.

### 52. 2026-07-13 레거시 CT 스냅샷의 styleProcessId 백필 (Codex 구현, 완료)

- **증상**: L16-4/AJ1972처럼 모든 공정 작업수량이 주문 수량과 정확히 일치해 `100%`가 맞는 배정도 `검토 필요`로 남았다. 운영 DB에서 확인한 해당 plan은 `assignmentQuantity=170`이고 26개 `StyleProcess`별 WorkRecord 합계가 전부 `170`이었지만, `AssignmentPlan.assignmentCtSnapshot.processes[].styleProcessId`가 전부 `null`이었다.
- **원인**: 정확 완료 판정(`resolveAssignmentPlanRequiredProcessGroups`)은 `WorkRecord.styleProcessId`와 CT 스냅샷의 `processes[].styleProcessId`를 FK 기준으로 비교한다. 레거시 스냅샷은 `processKey` 안에 `TA01-1216-0`처럼 styleProcessId를 포함하고 있었지만 명시 필드가 null이라 required process group을 만들 수 없었다. 그래서 총량 기준 진행률은 `100%`여도 공정별 정확 완료 검증은 실패했다.
- **수정 원칙**: 운영 계산에서 공정명/코드 문자열로 재탐색하지 않는다. 단, 레거시 CT 스냅샷 JSON을 정규화하는 단계에서는 `processKey`에서 후보 id를 파싱한 뒤 그 id가 실제 `StyleProcess.id`이고 같은 `AssignmentPlan.styleId`에 속할 때만 `processes[].styleProcessId`를 복구한다. 검증되지 않은 값은 쓰지 않는다.
- **코드 수정**: `normalizeAssignmentCtSnapshotProcess`는 명시 `styleProcessId`/`processId`가 없을 때만 레거시 `processKey`의 마지막 두 숫자 구간 중 앞 숫자를 styleProcessId 후보로 복원한다. 이건 런타임 호환용이며 신규 저장의 소스오브트루스는 여전히 FK다.
- **DB 수정**: `migration_fix.sql` 6-4e가 기존 `AssignmentPlan.assignmentCtSnapshot` JSON을 idempotent하게 백필한다. `processKey`에서 파싱한 후보가 같은 style의 `StyleProcess`로 검증될 때만 JSON에 `styleProcessId`를 추가하고, 기존 값은 덮어쓰지 않는다.
- **운영 DB 적용 결과**: 2026-07-13에 Railway 운영 DB에 같은 백필을 직접 적용했다. 41개 `AssignmentPlan`이 업데이트됐고, CT 스냅샷 공정 998개 중 missing `styleProcessId`가 947개에서 0개로 줄었다. L16-4/AJ1972는 26개 required process 모두 WorkRecord 합계가 170/170으로 확인됐다.
- **processKey 정리 방향**: `processKey`는 아직 즉시 제거하지 않는다. 레거시 스냅샷/프론트 draft/진단 호환에 남아 있을 수 있으므로, 운영 DB 백필 검증과 신규 저장 경로 검증이 끝난 뒤 "읽기 경로가 더 이상 processKey에 의존하지 않음"을 확인하고 단계적으로 제거한다.

### 53. 2026-07-13 남은 계획 부하를 producedQuantity min-ratio가 아니라 공정별 ST 잔량으로 계산 (Codex 구현)

- **증상**: §52 백필 후에도 LINE #1의 2026-07 계획 부하가 100%로 과하게 보였다. 운영 DB를 다시 계산해보니 작업기록은 대부분 90~100%에 가까운데, `producedQuantity = min(공정별 완료 수량)`가 0인 플랜이 많았다. 공정 하나라도 0이면 `Math.min(producedRatio, operationalProgressRatio)`가 0이 되어 전체 `assignmentStTotalSeconds`가 남은 부하로 다시 들어갔다.
- **정책 정리**: `producedQuantity`/exact process completion은 "옷 몇 벌이 완성됐는가"와 `PRODUCTION_COMPLETED`/`REVIEW_REQUIRED` 판정에 필요하다. 하지만 forecast의 남은 계획 부하는 완성 벌수가 아니라 **각 공정별 남은 수량 × 해당 공정 ST(q)**의 합이어야 한다. 예: 39개 공정 중 33개가 끝나고 6개만 남았으면 전체 39개 공정의 ST를 다시 넣으면 안 된다.
- **수정**: `buildLineMonthCapacityRows`와 `buildAssignmentPlanProgressRows`가 같은 helper(`calculateRemainingStTotalSecondsFromProcessProgress`)를 사용해 CT 스냅샷의 `styleProcessId`별 WorkRecord 수량을 보고 공정별 잔량 ST를 먼저 계산한다. 이 exact remaining ST를 만들 수 있을 때는 기존 ratio fallback보다 우선한다. ST row가 없어 exact 계산이 불가능한 경우에만 기존 ratio 기반 계산으로 내려간다.
- **운영 DB 재현 결과**: LINE #1 43개 not-completed assignment의 전체 계획 ST는 5,906.5h였고, 예전 min-ratio 방식 남은 ST는 3,549.6h까지 부풀었다. 공정별 ST 잔량 방식으로는 442.2h(8명 × 8h 기준 약 6.9 작업일)이며, 남은 공정의 ST bucket 누락은 0건이었다.

### 54. 2026-07-13 persisted CT snapshot processKey legacy cleanup (Codex 구현)

- **현재 정책**: persisted `AssignmentPlan.assignmentCtSnapshot.processes[]`의 공정 FK identity는 `styleProcessId`뿐이다. `processKey`에서 styleProcessId를 파싱하거나, existing/incoming CT row를 `processKey` 일치만으로 재사용하지 않는다.
- **남겨도 되는 processKey**: 프론트 UI draft map key, 테이블 row key, 백엔드 진행률 내부 map key(`style-process:{id}`)처럼 메모리 안에서만 쓰는 로컬 키는 허용한다. 이 값은 DB FK 복구/운영 계산/저장 검증의 근거가 아니다.
- **코드 정리**: `normalizeAssignmentCtSnapshotProcess`의 legacy `processKey` parser를 제거했고, assignment 저장 경로의 CT snapshot lookup도 `styleProcessId` 매칭만 허용한다. 백엔드 canonical snapshot rebuild는 새 persisted process row에 `processKey`를 쓰지 않는다. 프론트 assignment/production CT 조회도 saved snapshot row를 `styleProcessId`로 찾는다.
- **DB 정리**: `migration_fix.sql` 6-4f는 `styleProcessId`가 이미 있는 CT snapshot process row에서만 `processKey`를 제거한다. 아직 `styleProcessId`가 없는 손상 row는 수리 단서를 보존하기 위해 `processKey`를 남긴다.
- **운영 적용 결과**: 2026-07-14에 Railway public URL을 `DATABASE_URL`/`DIRECT_URL` 둘 다에 설정해 populated 운영 DB를 재확인했다(`AssignmentPlan=43`, `WorkRecord=978`, `StyleProcess=1177`). 6-4f targeted cleanup을 직접 적용해 43개 `AssignmentPlan`을 업데이트했고, CT snapshot process 998개 중 missing `styleProcessId=0`, persisted `processKey=0`을 확인했다. `AssignmentPlan` 물리 컬럼도 canonical 상태이며 구 `ctSnapshot`/`contractedSeconds`/`totalSeconds`/`orderNo`/`customer`/`label` 컬럼은 없다.
## 2026-08-08 워크스페이스 탭 생성과 라우트 커밋

- 업무 메뉴 이동은 React Router가 목적지 URL을 실제로 커밋한 뒤에만 해당 업무 탭을 확정 생성한다. 동적 import 실패·취소·지연 중에는 목적지 탭을 먼저 노출하지 않는다.
- 목적지 이동 전에 필요한 탭 이름과 상세 탭 교체 옵션은 pending ref에만 보관한다. URL 커밋 시 적용하고, 브라우저 경로가 출발지에 그대로 남아 이동 실패로 판정되면 pending 탭과 로딩 상태를 함께 폐기한다.
- `/workspace`에서 동적 모듈 로드가 실패해도 업무 탭만 생기고 LINEOS 홈이 남는 불일치 상태가 재발하지 않아야 한다. `test:workspace-navigation`에서 라우트 커밋 전 `openTab` 금지와 실패 cleanup을 회귀 검증한다.
## 2026-08-08 알림 체계 용어와 표시 원칙

- 사용자가 말하는 `알림 체계`는 관련 업무 화면으로의 연계, 후속 조치 필요 상태 계산, 메뉴 표시, 열린 탭 변경 표시와 해소 조건을 모두 포함한다.
- 메뉴 알림은 건수를 숫자로 표시하지 않고 열린 탭의 변경 알림과 동일한 주황색 점등 표시를 사용한다. 대상 업무가 실제로 해소될 때까지 계속 표시하며 단순히 메뉴나 탭을 열었다는 이유로 끄지 않는다.
- 하위 메뉴에 하나라도 알림이 있으면 상위 메뉴 그룹에도 같은 점등 표시를 전파한다. 그룹이 접혀 있어도 표시해야 하며, 모든 하위 알림이 해소됐을 때만 상위 표시도 사라진다.
## 2026-08-08 고객 단가 미입력 알림

- 제조사×고객 관계에서 고객 소유 스타일이 하나 이상 있고, 현재 활성 매출 버킷 버전 기준 단가가 한 건도 없는 스타일이 하나라도 있으면 고객 단가 후속 조치 알림을 켠다.
- 완성 조건은 스타일별로 CMT/FP와 통화 전체를 통틀어 현재 버전 `CustomerSalesPrice`가 최소 한 건 존재하는 것이다. 일부 수량 구간만 입력돼도 해당 스타일 알림은 해소하며 모든 버킷을 채우도록 강제하지 않는다.
- 과거 비활성 버전의 단가는 현재 입력 완료 근거로 사용하지 않는다. 스타일별 매출 버킷 예외가 있으면 관계 기본 버전 대신 해당 활성 예외 버전을 기준으로 판정한다.
- 미입력 고객의 고객 목록 `단가` 버튼, 고객 메뉴, 접힌 `영업 관리` 그룹에 공통 점등 표시를 전파한다. 단가 저장·버킷 변경·스타일 변경·고객 변경 직후 재계산하고, 보조 안전장치로 30초마다 다시 조회한다.
