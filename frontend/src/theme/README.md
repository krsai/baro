# 공통 UI 사용 기준

- 일반 색상·모서리·표 간격: `ui.js`
- 라벨의 배경·글자·테두리 색상: `labelPalette.js`
- 표·입력창·버튼·Chip의 기본 표시: `index.js`의 MUI 테마
- 화면 배치와 조회 도구: `AppPageContainer`, `PageToolbar`

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
