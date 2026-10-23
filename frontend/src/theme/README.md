# 공통 UI 사용 기준

- 일반 색상·모서리·표 간격: `ui.js`
- 라벨의 배경·글자·테두리 색상: `labelPalette.js`
- 표·입력창·버튼·Chip의 기본 표시: `index.js`의 MUI 테마
- 화면 배치와 조회 도구: `AppPageContainer`, `PageToolbar`

본문·표·일반 컨트롤의 기본 글자 크기는 13px이며 `ui.typography`, `ui.table`, `ui.control`이 같은 기준을 공유한다. 제목·합계·보조 설명은 각각 별도 의미 토큰을 사용한다. HTML 화면도 `--ui-body-font-size`, `--ui-control-font-size`, `--ui-table-font-size`를 사용한다. CSS 초기화 선택자의 우선순위는 낮춰 MUI나 역할별 토큰을 덮어쓰지 않는다.

페이지별 배치·강조·밀도 조정은 허용한다. 공통 역할의 기본 디자인은 테마/컴포넌트에 먼저 정의하고, 화면에서 필요한 차이만 조정한다. 직접 지정한 값이 있다는 이유만으로 모두 제거하지 않는다.

모달 제목·본문·하단 버튼 영역의 기본 여백은 `ui.dialog`와 전역 `MuiDialogTitle/Content/Actions`에서 관리한다. 저장 동작은 `SaveButton`을 재사용하며 기본 모서리는 일반 버튼과 같다. 화면별 열 구성·넓이·스크롤·특수 작업은 호출부에서 조정할 수 있다.

아이콘형 행 삭제는 `DeleteActionButton`을 사용한다. 활성 상태는 빨강, 비활성은 회색, 호버는 옅은 빨강 배경으로 표시한다. 화면의 삭제 조건·확인창·이벤트 전파는 호출부에서 유지하며 `disabled`, `title`, `aria-label`, `stopPropagation`을 전달한다. 텍스트가 있는 문서 전체 삭제 버튼과 대화상자 닫기 버튼은 별도 역할을 유지한다.

일반 컨트롤은 `ui.control`을 단일 크기 기준으로 사용한다. 텍스트·숫자·검색 선택·드롭다운·날짜·월 입력과 버튼은 기본 높이 36px, 글자 13px, 줄 높이 20px다. 아이콘 버튼은 작은 크기 28px·기본 36px·큰 크기 40px를 사용한다. M+/M−는 각 17px와 간격 2px로 전체 36px를 맞춘다. 여러 줄 입력과 복수 선택은 최소 높이에서 내용에 따라 늘어난다. 화면별 높이·폰트 강제 지정 대신 공통 토큰과 테마를 수정한다. HTML 컨트롤도 전역 `--ui-control-*` 변수를 재사용한다.

라벨 색상은 페이지에 HEX로 복사하지 않는다. 기존 `<Chip color="success" />`도 전역 파스텔 톤을 적용받는다. `outlined`는 동일한 배경에 옅은 테두리를 추가한다. 클릭·삭제·비활성 동작은 MUI Chip을 그대로 사용한다.

새 상태 표시는 공통 컴포넌트를 사용한다.

```jsx
<StatusLabel label={translatedLabel} tone="blue" />
<StatusLabel label={translatedLabel} tone="green" dot />
```

| 의미 | tone | MUI color |
| --- | --- | --- |
| 진행·정보 | blue | primary / info |
| 정상·완료 | green | success |
| 주의·검토 | yellow | warning |
| 오류·지연 | red | error |
| 중립·준비 | gray | default |
| 별도 분류 | purple | secondary |

기존 급여 유형 등의 분류에는 `orange` 등 기존 명명 팔레트를 유지한다. 상태 키와 톤의 연결은 해당 도메인에서 명시한다. 번역 문구나 진행률로 상태를 추측하지 않는다. 점은 색상을 보완하는 장식이며 상태 문구를 함께 표시한다.

MUI가 아닌 배경·막대에도 `LABEL_PALETTE` 또는 `getLabelPalette()`를 재사용한다. 출력 문서의 불변 스냅샷과 인쇄 전용 색상은 별도 계약을 따른다.

비용 신청처럼 HTML/CSS로 작성된 화면은 `CssBaseline`이 내보내는 `--color-*`, `--ui-*`, `--label-{tone}-{background|text|border}` 변수를 사용한다. 브라우저 검증도 실제 앱처럼 공통 ThemeProvider와 CssBaseline을 포함해야 한다. 표의 열·필터·선택·조회 정책은 유지하며, 비용 내역의 구분을 결재 상태로 바꾸어 표시하지 않는다.

날짜·월 선택기의 색상은 전역 MUI X 테마에서 관리한다. 입력·팝업은 공통 표면·테두리 색상, 선택일·선택월·선택연도는 파랑 라벨 팔레트, 요일과 이동 아이콘은 공통 보조 글자색을 사용한다. 톤 변경을 위해 선택기의 크기·배치·포맷·날짜 제한·월 이동 동작을 페이지별로 바꾸지 않는다.


조회·대상 기간은 공통 `DateRangeSelector`를 사용한다. 시작일·종료일과 월 이동 컨트롤을 함께 제공하며 콜백은 dayjs 값을 받는다. 임의 날짜 범위를 페이지에서 다시 월초·월말로 반올림하지 않는다. 월별 급여·정산 문서는 `periodMonthKeys`로 겹치는 월을 선택하고 기존 월별 계산·잠금·스냅샷을 보존한다. 버전 적용 시작월은 별도 업무 값이다.

Dialog의 크기·내부 스크롤은 공통 테마가, 업무 Drawer의 작업 영역 내 여백·위치는 `WorkspaceDialogScope`가 관리한다. 페이지별 고정 헤더 높이를 Drawer top에 더하지 않는다.
