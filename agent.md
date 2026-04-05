# BARO - 봉제 생산관리 시스템 Agent 참조 문서

## 프로젝트 개요

봉제(縫製) 공장을 위한 B2B 생산관리 웹 애플리케이션.
수주자(봉제 공장, MANUFACTURER)와 발주자(브랜드, BRAND) 두 유형의 조직을 지원한다.

**스택**: React (Vite) + MUI / Node.js + Express 5 + Prisma + PostgreSQL + Supabase Auth

---

## 코딩 원칙 (단순성 최우선)

- 코딩할 때는 **무조건 사용자가 시킨 것만, 핵심 기능만 구현한다.**
- 모든 코딩은 **최대한 간단하게** 구현한다.
- 사용자 요청 범위를 벗어난 **불필요한 기능/옵션/추상화는 추가하지 않는다.**
- 기본 원칙은 **"지금 필요한 것만 구현(YAGNI)"** 이다.

## 2026-03-14 현재 운영 기준 (최우선)

이 섹션이 아래의 오래된 CT/협의/주문 메모보다 우선한다.

### 2026-03-21 정적 사전 조회 기준

- 관리자 검토용 정적 코드 사전은 `frontend/src/constants/staticOptionRegistry.js` 한 파일에 모아 둔다.
- 이번 턴 기준 포함 항목:
  - 조직 유형
  - 조직 역할
  - 조직 멤버십 상태
  - 구독 상태
  - 성별
  - 사이즈 코드
  - 급여 타입
  - 주문 진행 상태
  - 주문 확정 상태
  - 주문 당사자 역할
  - 국가
  - 직무/작업 역할
  - 재고 이동 타입
  - AT 신뢰도 상태
- 시스템 관리자 확인용 읽기 전용 화면 경로는 `/system-setting/static-options` 이다.
- 이 화면은 코드, 한국어/영어/베트남어 라벨, alias를 보여주기 위한 용도다.
- 이번 구현은 **조회 전용**이다.
  - 앱 안에서 정적 사전을 수정하고 즉시 반영하는 기능은 아직 만들지 않았다.
  - 필요 시 정적 파일을 수정하고 재배포하는 방식으로 유지한다.
- 기존 업무 로직 전체를 한 번에 이 레지스트리로 치환하지는 않았다.
  - 이번 목적은 누락 검토와 기준표 제공이다.

### 2026-03-21 정적 UI 문구 기준

- 페이지/메뉴/버튼/도움말 같은 UI 문구는 `frontend/src/constants/uiMessages.js` 한 파일에 모아 둔다.
- 기본 원칙:
  - 코드형 값 라벨은 `staticOptionRegistry.js`
  - 화면 문구는 `uiMessages.js`
- `uiMessages.js`는 dot-path 키 방식(`common.save`, `menu.assignment`, `assign.pageTitle`)을 쓴다.
- 헬퍼는 `getUiMessage(key, fallback, languageCode, params)` 하나만 쓴다.
- 런타임 수정 기능은 두지 않는다.
  - 정적 코드 기반으로 관리하고, 수정은 코드 변경 + 배포로 반영한다.
- 신규 화면을 만질 때는 하드코딩 문자열을 바로 박지 말고, 가능하면 `uiMessages.js`에 먼저 추가한 뒤 사용한다.
- 이번 턴에서 실제 연결한 범위:
  - 좌측 메뉴(`MainLayout`)
  - 정적 사전 보드(`StaticOptionBoard`)
  - 작업 배정 상단 헤더와 일부 핵심 문구(`AssignBoard`)

### 2026-03-21 작업 배정 번역 확장 메모

- 작업 배정 페이지의 남은 하드코딩 UI 문구도 `uiMessages.js`의 `assign.*` 키로 계속 옮긴다.
- 이번 턴에서 실제 연결한 범위:
  - 타임라인 좌측 헤더 `라인`
  - 날짜 헤더 요일(`일/월/...`)
  - 라인 인원수 표기(`20명`)
  - 배정 바 내부 수량/이미지 없음/CT 저장 상태/기간 배지
  - 미배정 카드의 색상/성별/수량/이미지 없음
  - 우클릭 메뉴, 상세 드로어 제목/라벨/요약 테이블 핵심 문구
  - 저장/이탈 확인/초기화 같은 assignment 전용 알림 문구
- 날짜 라벨은 `buildDays(..., languageCode)`로 생성하고, 언어가 바뀌면 현재 day window를 같은 길이로 다시 만들어 요일 표기도 즉시 바꾼다.
- assignment 페이지에서 사용자에게 보이는 새 문구를 추가할 때는 먼저 `uiMessages.js`의 `assign.*`에 넣고 화면에서 `getUiMessage(...)`로만 읽는다.

### 2026-03-21 앱 페이지 기본 레이아웃 기준

- 앱의 기본 리스트/보드형 페이지는 아래 순서를 기본 틀로 맞춘다.
  1. 제목 행
  2. 검색/필터/추가 액션 행
  3. 본문
- 제목 행 기준:
  - 좌측은 제목만 둔다.
  - 우측 끝에는 저장 버튼을 둔다. 저장이 없는 화면은 비워도 되지만, 저장이 필요한 화면은 제목 줄 우측에 둔다.
  - 부제목(설명 문장)은 기본형에서는 두지 않는다.
- 검색/필터/추가 액션 행 기준:
  - 좌측: 검색기
  - 우측: 날짜 필터(필요한 경우), 추가 버튼, 보조 액션
  - 검색기/날짜필터/버튼 간 간격과 높이는 공통 컴포넌트로 맞춘다.
- 본문 기준:
  - 표/리스트/카드 영역은 가능한 한 공통 Paper/Card 래퍼 안에 넣는다.
  - 테이블 상태 메시지(로딩/빈 상태)는 공통 컴포넌트로 맞춘다.
- 예외:
  - `배정`, `생산 계획`, `재고`, `상세 편집 화면`처럼 구조가 큰 화면은 기본 틀을 참고하되, 별도 예외 레이아웃으로 다룬다.
  - 특히 `배정`은 일반 보드형과 분리해서 마지막에 별도 정리한다.

### 2026-03-21 페이지 레이아웃 현황 메모

- 기본 틀에 비교적 가까운 화면:
  - `CustomerList`
  - `StyleBoard`
  - `OrderList` 목록 모드
  - `WorkList`
  - `FactoryBoard`
  - `PayrollBoard`
  - `MyProfile`
- 제목/부제목/액션 배치가 현재 제각각인 화면:
  - `AttendanceBoard`
  - `HolidayBoard`
  - `ProductionPlanBoard`
  - `LineBoard`
  - `StaticOptionBoard`
  - `OnboardingBoard`
  - `Permission`
- 구조 자체가 기본형과 다른 복합 화면:
  - `AssignBoard`
  - `InventoryBoard`
  - `EmployeeBoard`
  - `AttrBoard`
  - `OrganizationBoard`
  - `OrderList` 상세 모드
  - `StyleDetail`
  - `WorkEntry`

### 2026-03-21 레이아웃 공통화 우선순위

- CSS/구성 일관성을 위해 아래 공통 컴포넌트부터 우선 검토한다.
  - `AppPageContainer`
    - 현재는 단순 wrapper라서, 제목 행/툴바 행/본문 행을 명시적으로 받는 방향을 우선 검토한다.
  - `PageSectionHeader`
    - 현재는 `title + actionLabel` 수준이라, 제목 우측 저장 버튼/보조 액션/정렬 규칙을 담기에는 부족하다.
    - `title row` 전용 공통 컴포넌트로 확장하거나 새 컴포넌트로 대체하는 것을 우선 검토한다.
  - `SearchInput`
    - 폭, 높이, placeholder 스타일, 아이콘 여백을 전역 기준으로 맞춘다.
  - `CustomDatePicker`
    - 페이지마다 반복되는 폭/버튼 배치/월 이동 버튼 스타일을 공통 wrapper로 묶는 것을 우선 검토한다.
  - `TableStatusRow`
    - 로딩/빈 상태/오류 상태 텍스트 스타일을 동일 규칙으로 맞춘다.
  - 공통 본문 래퍼
    - `Paper variant="outlined"`와 내부 padding/overflow/table container 규칙이 반복되고 있으므로 `table/list body wrapper` 공통화를 우선 검토한다.
- 원칙:
  - 페이지를 먼저 하나 승인받아 맞춘 뒤, 그 페이지에서 검증된 공통 컴포넌트만 다른 화면에 확장한다.
  - 한 번에 모든 페이지를 바꾸지 않는다.

### 2026-03-21 페이지별 순차 개선 계획

- 1차(기본형 확정용, 가장 단순한 리스트 화면)
  - `CustomerList`
  - `StyleBoard`
  - `FactoryBoard`
- 2차(검색 + 날짜 필터 조합)
  - `OrderList` 목록 모드
  - `WorkList`
  - `AttendanceBoard`
- 3차(조직/운영 보드형)
  - `HolidayBoard`
  - `PayrollBoard`
  - `StaticOptionBoard`
  - `OnboardingBoard`
- 4차(구조 복합형)
  - `EmployeeBoard`
  - `LineBoard`
  - `AttrBoard`
  - `OrganizationBoard`
- 5차(상세/편집형)
  - `OrderList` 상세 모드
  - `StyleDetail`
  - `MyProfile`
  - `WorkEntry`
- 6차(예외 레이아웃 별도 정리)
  - `ProductionPlanBoard`
  - `InventoryBoard`
  - `AssignBoard`

### 2026-03-21 진행 원칙

- 다음 턴부터는 사용자가 승인한 페이지 하나씩만 레이아웃을 손본다.
- 각 턴에서 먼저 할 일:
  1. 해당 페이지를 기본 틀로 정렬
  2. 그 페이지에서 반복된 스타일을 공통 컴포넌트로 올릴 수 있는지 검토
  3. 공통화가 안전한 부분만 글로벌로 반영
- 새 공통 컴포넌트는 최소 개수로 유지한다.
  - 기본 목표는 `제목 행`, `필터 행`, `본문 래퍼` 3축만 먼저 통일하는 것이다.

### 2026-03-21 레이아웃 공통화 구현 메모

- 공통 페이지 쉘은 아래 구조로 실제 구현했다.
  - `AppPageContainer`
    - `title`
    - `titleActions`
    - `toolbar`
    - `header`는 예외 화면에서만 유지
  - `PageToolbar`
    - 검색/필터/추가/보조 액션을 한 줄로 맞추는 전용 컴포넌트
    - 모바일에서는 세로, 데스크톱에서는 가로 정렬
- 공통 스타일 기준:
  - `SearchInput`은 흰 배경 + 둥근 outlined 입력으로 통일
  - `CustomDatePicker`는 공통 최소 폭과 rounded outlined 스타일을 기본값으로 사용
  - 리스트/테이블형 본문 `Paper`는 가능하면 `variant="outlined" + borderRadius: 2 + overflow: hidden` 기준으로 맞춘다
  - `TableStatusRow`로 로딩/빈 상태 메시지를 계속 통일한다
- 현재 기본 틀 적용 또는 상단 구조 정리 완료:
  - `CustomerList`
  - `StyleBoard`
  - `FactoryBoard`
  - `PayrollBoard`
  - `WorkList`
  - `AttendanceBoard`
  - `HolidayBoard`
  - `StaticOptionBoard`
  - `OnboardingBoard`
  - `AttrBoard`
  - `LineBoard`
  - `OrganizationBoard`
  - `OrganizationDetail`
  - `MyProfile`
  - `Permission`
  - `ProductionResultBoard`

### 2026-03-22 라인 관리 저장 방식

- `LineBoard`는 더 이상 항목별 즉시 저장을 하지 않는다.
- 라인 추가, 이름 변경, 라인장 지정, 드래그 배정, 삭제는 전부 프론트 draft 상태에서만 먼저 반영한다.
- 최종 반영은 페이지 상단 `저장` 버튼에서 한 번에 수행한다.
- 이 저장은 백엔드 `POST /lines/batch-save`로 처리한다.
  - 기준 공장(factory) 전체의 최종 라인 상태와 작업자 배정 상태를 보낸다.
  - 서버는 트랜잭션으로 라인 생성/수정/삭제, 라인장 반영, 작업자 배정 반영을 한 번에 처리한다.
- 저장하지 않은 변경은 `useUnsavedChanges`로 이탈 경고를 띄운다.
- 공장을 바꿀 때도 미저장 변경이 있으면 먼저 discard 확인을 한다.
- 현재도 예외 레이아웃으로 남겨둔 화면:
  - `AssignBoard`
  - `ProductionPlanBoard`
  - `InventoryBoard`
  - `OrderList`
  - `EmployeeBoard`
  - `StyleDetail`
  - `WorkEntry`
- 적용 규칙:
  - 저장이 필요한 화면은 가능한 한 `titleActions`에 저장 버튼을 둔다
  - 검색/날짜 필터/추가 버튼은 가능한 한 `toolbar`로 내린다
  - 구조가 큰 화면은 본문을 억지로 바꾸지 말고, 헤더/툴바부터 먼저 맞춘다

### 공용 공정 마스터 기준

- 공정 마스터(`AttrProcess`)는 **스타일별 로컬 코드(TT/TS/VS/HT 등)** 가 아니라, 공정의 **의미 자체**를 기준으로 만든다.
- 같은 의미의 공정은 표현이 달라도 하나로 합친다.
  - 예: `주머니 달기`, `주머니 박기`처럼 실질적으로 같은 작업이면 별도 마스터를 만들지 않는다.
- 스타일 로컬 코드(`TT01`, `TS02`, `VS301` 등)는 원본 시트 구분용일 뿐, 시스템의 공용 마스터 코드로 쓰지 않는다.
- 시스템 구분 기준은 `style + common processCode`다.
- 스타일 공정에서 `X2`, `X3` 같은 반복 표기는 공정 마스터를 늘리지 않고 `processQuantity`로 저장한다.
- 같은 공용 마스터가 한 스타일 안에서 여러 위치에 등장하면 하나의 스타일 공정으로 합치고, 부위 정보는 설명(`processDescription`)에 남긴다.
- 단, 원본 시트가 이미 여러 작업을 한 행으로 묶어 시간만 제공하는 경우는 현재 시간을 다시 쪼개지 않고 그 묶음 단위의 공정 마스터를 유지한다.

### 2026-04-01 스타일 공정 직접 조합 입력 기준

- 스타일 상세의 공정 추가는 더 이상 **완성 공정 마스터 선등록**을 전제로 하지 않는다.
- 시스템 관리자는 `부위 / 대상 / 작업 / 규격` 사전만 관리하고, 스타일 화면에서 이를 조합해 공정을 만든다.
- 스타일 공정 입력 규칙:
  - `부위` 필수
  - `대상` 1개 필수
  - `작업` 1개 이상 필수
  - `규격` 선택
  - `작업`은 한 공정 안에서 여러 개 선택 가능
  - `규격`은 1개 선택 또는 직접입력 허용
- 스타일 공정 저장은 `processCode/processName` 스냅샷 텍스트를 유지하되, 재편집/검색용 `processComposition`도 함께 저장한다.
- 스타일 공정 표시 텍스트는 `부위: 대상(규격) - 작업` 순서를 기본으로 한다.
  - 규격이 없으면 괄호를 숨긴다.
  - 작업이 여러 개면 `+` 로 연결한다.
- 메인 조회/렌더링은 스냅샷 텍스트를 우선 사용한다.
  - 스타일 공정 목록에서 조합 FK를 매번 깊게 따라가며 이름을 다시 만들지 않는다.
- 이 기준은 **스타일 공정 입력 UX**에 대한 규칙이다.
  - 기존 공용 공정 마스터, baseline import, 과거 데이터 호환 흐름은 한 번에 전면 재설계하지 않는다.
- 직접 조합 입력에서는 누락 placeholder(`((주대상 누락))` 등)를 만들지 않는다.
  - 필수값은 입력 단계에서 막고, 저장 텍스트에는 실제 선택된 항목만 반영한다.

### 2026-03-16 공정 명명 규칙

- 공정명은 필드를 늘리지 않고 텍스트 순서로 중복을 줄인다.
- 핵심 규칙:
  - 스타일 공정 직접 조합 표시는 `부위: 대상(규격) - 작업` 순서를 따른다.
  - 여러 작업은 `+` 로만 연결한다.
  - 규격은 대상 뒤 괄호로 붙인다. 예: `주머니(1줄)`, `옆선(3실)`, `입구(5mm)`
  - 같은 공정을 스타일에서 2회, 3회 반복하는 경우도 공정 마스터명에 `x2`, `x3`를 넣지 않는다.
  - 반복 수량 표시는 저장 텍스트가 아니라 `processQuantity` 기반 **화면 표시 규칙**으로만 처리한다.
- 누락값 규칙:
  - 주대상이 없으면 `((주대상 누락))`
  - 작업이 없으면 `((작업 누락))`
- 예:
  - `허리밴드: 완성 - 상침`
  - `앞판: 포켓 - 부착`
  - `옆선: 봉제선(3실) - 오버록`
  - `앞판: 지퍼 가드 - 뒤집어 박기`

### 2026-03-16 스크립트 운영 원칙

- 스크립트는 계속 추가하지 않는다. 먼저 **기존 스크립트 확장 가능 여부**를 본다.
- 실행 엔트리로 직접 쓰는 파일만 `backend/scripts`, `scripts` 루트에 둔다.
- 실행 스크립트가 공유해서 쓰는 helper/data table은 `backend/scripts/lib` 아래에 둔다.
- 현재 기준:
  - `backend/scripts/reset-to-baseline.js`: baseline reset 전용 단일 진입점
  - `backend/scripts/normalize-process-master-names.js`: 이미 들어가 있는 운영 데이터를 **파괴 없이** 현재 명명 규칙으로 맞추는 유지보수 스크립트
  - `backend/scripts/lib/processNamingRules.js`: 실행 스크립트가 공용으로 쓰는 내부 규칙 모듈
- 새로운 스크립트는 아래 중 하나일 때만 허용한다.
  - 기존 스크립트에 넣으면 책임이 과도하게 섞일 때
  - 운영 데이터를 **파괴 없이** 보정해야 해서 reset/reseed로 대체할 수 없을 때
  - 회귀 검증용 테스트 스크립트일 때
- 1회성 실험이 끝난 스크립트는 남기지 말고 제거한다.

### 시간 모델 기준

- `PT(q)`, `AT(q)`, `ST(q)`, `CT(q)`는 **모두 같은 개념 계열**이다.
- 개념 축은 모두 `style + process`다.
  - 단, `CT`의 저장 원본은 배정 시점 snapshot(`AssignmentPlan.ctSnapshot`)이다.
- 여기서 `q`는 `그 수량의 주문 조건`을 뜻한다.
  - 예: `PT(1000)`은 `1,000장 주문일 때의 개당 예상시간`
  - 예: `CT(550)`은 `550장 배정일 때의 개당 저장 CT`
- 즉 이 값들은 **수량 q 주문 조건에서의 개당 시간(초)** 이다.
- 스타일의 개당 시간 합은 스타일에 연결된 공정들의 시간 합이다.
  - 공정 반복 수량은 `processQuantity`로 곱해서 합산한다.
  - 예: `PTa(1000)=500`, `PTb(1000)=800`이면 스타일 총 `PT(1000)=1300`
- `q`가 작아질수록 setup/교체 부담 때문에 개당 시간은 커질 수 있고, `q`가 커질수록 반복 생산 효과로 개당 시간은 내려갈 수 있다.
- 따라서 `PT(q)`, `AT(q)`, `ST(q)`, `CT(q)`는 모두 `q`에 따라 달라질 수 있는 함수 개념으로 본다.
- 주문 전체 소요시간이 필요하면 별도로 `개당 시간 * 수량 q`로 계산한다.

### 2026-03-14 스타일/공정 마스터 교체 메모

- org `2` 기준 기존 샘플 스타일 `25SS-T001`, `25SS-P002`, `25FW-J003`와 더미 공정 `P01~P10`은 교체 대상이다.
- 현재 기준 스타일 마스터는 아래 4개다.
  - `BL20`
  - `AM01160`
  - `AM01622`
  - `AM02053`
- 공용 공정 마스터는 위 4개 스타일의 실제 공정표를 기준으로 새로 등록한다.
- 구현 위치:
  - `backend/scripts/reset-to-baseline.js` 내부 로직 (별도 실행 파일 없음)
- 이 스크립트는 아래를 한 번에 수행한다.
  - org `2` 기존 스타일 삭제
  - org `2` 기존 공정 마스터 삭제
  - 공용 공정 마스터 재등록
  - 스타일 4개 + 스타일 공정 + ST(1000) 기준값 재생성
- 2026-03-14 현재 로컬 DB에는 이 스크립트를 이미 적용했다.
- 원본 공정표 총 PT(1000) 기준 검증값:
  - `BL20 = 1,956`
  - `AM01160 = 4,301`
  - `AM01622 = 1,863`
  - `AM02053 = 2,247`

### 2026-03-28 시간모델/표시 기준 메모

- org `2` 스타일 공정 PT/ST 시드는 원본 공정표 총합 기준으로 저장한다.
  - `BL20 = 1,956`
  - `AM01160 = 4,301`
  - `AM01622 = 1,863`
  - `AM02053 = 2,247`
- 이전에 남아 있던 `+30%` 가산 메모는 폐기한다.
  - 현재 시드 스크립트는 원본 공정표 기준값을 그대로 사용한다.
- `PT(1000)`을 `1,000장 주문 전체 총시간`으로 해석하는 것은 잘못이다.
  - `PT(1000)`은 `1,000장 주문 기준의 개당 시간`이다.
  - 주문 전체 소요시간은 필요 시 `PT(q) * q`로 따로 계산한다.
- 런타임 계산 원칙:
  - 스타일/공정 화면의 `PT(q) / AT(q) / ST(q) / CT(q)` 표시는 모두 `q 기준 개당 시간`
  - 일정/라인부하/공임 계산에서만 `개당 시간 * 수량 q`로 총시간을 만든다.
- 스타일 목록(`StyleBoard`)은 `q` 선택기가 없으므로 `PT / ST / AT`를 모두 **`q=1000` 기준 개당 시간**으로 표시한다.
- 공정시간 저장/정규화 원칙:
  - `PT/ST/CT`와 시드용 공정시간은 **0 이상 정수 초**로 다룬다.
  - 최소 `10초`, `30초` 같은 하한을 두지 않는다.
  - `AT`의 `a,b` 파라미터는 학습 결과이므로 소수 초를 허용한다.
- 기본 테스트 공정 `P01~P10`은 실제 공정 마스터가 존재할 때 다시 자동으로 주입되면 안 된다.
  - `seedAttributesIfEmpty()`는 이제 공정 마스터가 비어 있을 때만 기본 테스트 공정을 넣는다.

### 2026-03-15 샘플 주문 메모

- 테스트용 샘플 주문 1건:
  - `orderNumber = TSBR-MIX-20260315-A`
  - `AM01160 / M / NAVY / 2,500`
  - `AM01160 / M / BLACK / 2,500`
  - `AM02053 / W / WHITE / 1,900`
  - `AM02053 / W / INDIGO / 1,900`
- 총 수량은 `8,800장`, 제조사 기준 배정 카드는 `4개`다.
- 현재 `Sample Line 1`, `Sample Line 2`가 각각 20명일 때, 위 주문은 두 라인 합산 기준 약 `34.02일` 분량이다.
- 유니섹스는 쓰지 않고, 남성/여성 스타일을 섞되 카드 수가 과도하게 늘지 않도록 `2스타일 x 2색상`으로 구성한다.

### 작업 방식

- 문제를 발견하면 **가장 좁은 수정**부터 검토한다.
- 한 화면에서만 발생하는 문제면, 공용 API/백엔드부터 바꾸지 말고 **그 화면의 로컬 필터 / 파생 상태 / 표시 로직**부터 확인한다.
- 불필요한 공용 호출, 과한 추상화, 범위를 넘는 데이터 로딩은 추가하지 않는다.
- 현재 워크트리에 있는 unrelated 변경은 건드리지 않는다.

### 오토컴플리트 검색 기준

- 오토컴플리트 검색은 **연속 문자열 일치**만으로 판단하지 않는다.
- 입력어를 공백 기준 토큰으로 나눠, **순서가 달라도 각 토큰이 옵션 어딘가에 포함되면 검색 결과에 포함**한다.
  - 예: `뒷목 페이싱 뒤집어 달기`는 `달기 뒷목`, `페이싱 달기`, `back facing` 같은 입력에도 검색될 수 있어야 한다.
- 코드/이름/설명/표시명은 가능한 한 같은 검색 blob에 포함한다.
- 공용 검색 규칙은 우선 `MuiAutocomplete` 기본값과 `SearchableSelect`에서 같이 유지한다.
- 서버 검색처럼 클라이언트 필터를 우회하는 화면이 있으면, 그 화면의 선행 필터/매칭 로직도 같은 토큰 검색 기준으로 맞춘다.

### 현재 CT 모델

- `PT(1000)`: 1,000장 주문 기준의 개당 예상시간
- `AT(q)`: 수량 q 주문 기준의 개당 실측시간
- `ST(q)`: 수량 q 주문 기준의 개당 표준시간. 조회/저장은 exact q가 아니라 버킷 하한값 기준으로 본다.
- `CT(q)`: 배정 건별 수량 q 기준의 개당 저장 CT. 저장 시점에 현재 `ST(bucket(q))`를 그대로 snapshot 한다.

### 현재 배정 저장 흐름

- 배정은 운영자 중심으로 처리한다.
- 상태값(`PENDING/SENT/AGREED/REJECTED`) 개념은 신규 로직에서 사용하지 않는다.
- 라인장의 시스템상 `요청 / 거부 / 동의 / 승인` 흐름은 제거되었다.
- 현재 흐름:
  - 작업 배정
  - 운영자 저장
- 별도 `CT 확정` 버튼은 없다.
- 저장 시점에 그 배정의 `수량 + 일정 + 공정별 CT(q)`를 한 번에 snapshot으로 만든다.
- 배정 상세에서 별도 `입력 CT`와 `저장 CT`를 나누지 않는다. 운영 중인 CT는 하나다.
- 저장 시 `CT = 현재 ST(bucket(q)) snapshot`으로 맞춘다.
- 라인장 화면은 읽기 전용 요약/현황 화면이다.

### 현재 저장 규칙

- 신규 쓰기 기준의 소스 오브 트루스는 `AssignmentPlan.ctSnapshot`이다.
- `ctSnapshot`에는 공정별 `ctSeconds`, `schedule`, `quantity`, `updatedBy`, `updatedAt`만 남긴다.
- `AssignmentPlan.contractedSeconds`는 조회/필터/합계 계산용 총 CT 요약값으로만 유지한다.
- `totalSeconds`는 현재 배정의 총 CT이자 일정/라인 부하 계산 기준이다.
- 신규 쓰기 기준 상태값(`ctStatus`)과 승인 메타(`confirmedAt`, `confirmedBy`, `ctAgreedAt`, `ctAgreedBy`)는 사용하지 않는다.

### 레거시 호환 규칙

- 신규 로직은 아래 값들에 의존하지 않는다.
  - `proposalSeconds`
  - `operatorCtProposal`
  - `pendingCtProposal`
  - `ctStatus`
  - `ctSentAt`
  - `ctEscalatedAt`
  - `ctAgreementHistory`
- 백엔드는 예전 데이터 호환용으로만 일부 legacy 필드를 fallback으로 읽을 수 있다.
- 신규 로직은 `basis`를 우선 사용한다.
- `proposalBasis`는 예전 데이터 읽기용 fallback 정도로만 취급한다.

### 현재 UI 기준

- `/assignment`
  - 운영자가 직접 배정하고 저장한다.
  - 입력 CT를 비우면 ST 기준값으로 다시 맞춘다.
  - 상세 보기에서 CT 숫자를 수정했지만 아직 저장하지 않았으면 즉시 `CT 미저장`으로 보여야 한다.
  - 상세 패널 상단에는 닫기 버튼이 있어야 한다.
  - 상세 카드/스타일 비동기 로딩 중에는 안내 문구 대신 spinner를 보여준다.
- `/production-plan`
  - 읽기 전용 현황판이다.
  - `CT 저장 / CT 미저장`만 보여준다.
  - 휴일 설정에 포함된 날짜는 월간 캘린더에서 빨간 배경으로 표시한다.
- 수량 변경/차이 카드 재구성 시
  - `totalSt`가 있으면 `totalSeconds = totalSt`
  - 없을 때만 `totalPt` fallback 사용

### 현재 작업기록 기준

- 작업기록은 `ctStatus`가 아니라 `ctSnapshot` 존재 여부를 기준으로 배정 카드를 사용한다.
- 작업기록 저장 시 `WorkRecord.ctSeconds`에는 그 시점 배정 snapshot의 공정별 CT가 복사되어 저장된다.
- 이후 스타일의 PT/AT/ST가 바뀌어도 기존 `WorkRecord.ctSeconds`에는 영향이 없다.

### 운영/마이그레이션 메모

- CT 단일 snapshot 구조 반영 마이그레이션:
  - `backend/prisma/migrations/20260314120000_replace_assignment_ct_status_with_snapshot/migration.sql`
- 새 환경이나 다른 작업 환경에서 pull 받은 뒤에는 아래 순서를 반드시 실행한다.
  - `npm --prefix backend run prisma:prepare-client`
  - `npx prisma migrate deploy` (`backend` 폴더)
- `backend/.env`에는 `DATABASE_URL` 외에 `DIRECT_URL`도 필요하다.

### 주문 목록 주의사항

- `/orders` API는 접근 가능한 주문 전체를 내려준다.
- 주문 목록이 비어 보여도, 먼저 API 문제라고 단정하지 않는다.
- 현재 주문 화면은 **클라이언트 납기 필터**에 의해 목록이 0건처럼 보일 수 있다.
- 현재 기대 동작:
  - 첫 진입 시 기본 납기 범위는 현재 월
  - 현재 월 범위에 표시될 주문이 없고, 로드된 주문이 다른 납기 범위에 있으면
    자동으로 그 주문들의 납기 범위로 필터를 보정한다
  - 사용자가 날짜 필터를 직접 변경한 뒤에는 자동 보정을 멈춘다
- 주문 목록 이상 시에는 먼저 `frontend/src/pages/App/order/OrderList.jsx`의 필터 로직을 확인한다.

### 검증 기준

- 관련 영역 수정 후 우선 확인:
  - `npm --prefix backend run build`
  - `npm --prefix frontend run build`
  - `npm run test:quantity-change` (배정/수량변경/CT 계산을 건드렸을 때)

## 2026-03-10 확정 정책 (우선 적용)

이 섹션이 아래의 오래된 설명보다 우선한다.

- `PT`는 스타일+공정별 `PT(1000)` 하나만 가진다.
- `AT`는 스타일+공정별 함수 `atParams={a,b,...}`만 저장한다. 단순 숫자 `at`는 삭제 대상 레거시이며 신규 정책에서 사용하지 않는다.
- `ST`는 스타일+공정별 `ST(q)` 기준점을 수량별로 저장한다.
- `CT`의 저장 원본은 `AssignmentPlan.ctSnapshot`이며, `contractedSeconds`는 총합 요약값으로 본다.
- `AT(q)`는 `ST(q)`/`CT(q)`를 자동 결정하는 값이 아니라, 운영팀이 `ST(q)`를 검토할 때 참고하는 값이다.
- 배정 카드 생성 시점에 해당 수량의 `ST(q)`가 없으면 기본값을 잡아 새 `ST(q)` 기준점을 만든다.
- 라인장과 협의해 바뀐 `CT`는 그 배정 건에만 적용되며, 다른 배정은 다시 `ST(q)`를 기본값으로 사용한다.
- `ST` 값의 증가/감소 방향은 시스템이 강제하지 않는다. 대신 나중에 `표준 공임 검토` 메뉴에서 운영 검토 경고를 보여준다.
- 이 문서 아래에서 `Style.processes[].ct`, `stManual`, `timeRefQuantity`, `Style.processes[].at`를 `ST/AT`의 저장 원본으로 설명하는 부분은 레거시 메모로 본다.

## 오늘 반영 메모 (2026-03-14)

이 섹션이 아래의 오래된 CT 협의/상태 메모보다 우선한다.

### CT 단일 snapshot 정책

- CT는 더 이상 승인 상태 머신으로 관리하지 않는다.
- 저장 단위는 `AssignmentPlan.ctSnapshot` 하나다.
- `ST(q)`가 기본값이고, 협의 결과가 있으면 저장 전에 CT(q)를 직접 수정한다.
- 별도 `확정`, `요청`, `거부`, `재협의`, `히스토리` UI는 신규 로직에서 제거한다.
- snapshot 메타에는 `updatedBy`, `updatedAt`만 유지한다.

### 저장 시점 정책

- 작업을 날짜/라인에 배정하고 `저장`을 누르는 순간 해당 배정의 CT snapshot이 생성/갱신된다.
- 저장 snapshot에는 최소 아래 정보가 들어간다.
  - `quantity`
  - `schedule`
  - `processes[].ctSeconds`
  - `updatedBy`
  - `updatedAt`
- `contractedSeconds`는 snapshot 총합을 빠르게 조회하기 위한 요약값으로 유지한다.

### 작업기록 연동

- 작업기록 화면은 저장된 `ctSnapshot`이 있는 배정만 사용한다.
- `WorkRecord.ctSeconds`는 배정 snapshot 값을 복사해 저장한다.
- 따라서 배정 저장 후의 CT와 작업기록 저장 시점 CT가 자연스럽게 연결된다.

### UI/UX 반영

- 작업 배정 상세에서 CT 입력값을 수정했지만 저장하지 않으면 즉시 `CT 미저장`으로 바뀐다.
- 상세 패널 헤더에 닫기 버튼을 추가했다.
- 상세에서 스타일/공정 정보가 아직 로딩 중이면 문구 대신 spinner를 보여준다.
- 월간 생산계획 캘린더는 휴일 설정을 불러와 해당 날짜를 빨간 배경으로 표시한다.
- 휴일 변경은 `HOLIDAY_UPDATED_EVENT`와 `storage` 이벤트로 동기화한다.

### 런타임 레거시 정리

- 작업기록 상세는 배정의 `ctSnapshot.processes[].ctSeconds`를 우선 사용한다. 저장된 CT가 있으면 ST로 되돌아가지 않도록 유지한다.
- 기존 작업기록을 수정할 때도 `WorkRecord.ctSeconds`를 다시 공정 옵션에 덮어 써서 재저장 시 값이 오염되지 않게 한다.
- 작업기록 서버 검증/오류 문구는 `CT agreement` 대신 `CT snapshot 저장` 기준으로 통일한다.
- 생산계획 현황의 상태/문구는 `CT 저장`, `CT 미저장`으로만 표시한다.
- 작업 배정 보드의 예전 잠금/확정 dead code와 경고 문구는 제거한다.

### 운영 메모

- 로컬 DB에는 `20260314120000_replace_assignment_ct_status_with_snapshot` 마이그레이션을 적용했다.
- 다른 개발 환경도 pull 후 `backend`에서 `npx prisma migrate deploy`를 먼저 실행해야 한다.

## 오늘 반영 메모 (2026-03-11)

이 섹션이 아래의 오래된 주문/스타일 메모보다 우선한다.

### 스타일 소유/공정 분리

- 스타일은 브랜드와 공장이 모두 만들 수 있다.
- 다만 스타일의 기본 정보는 **브랜드 소속 스타일 마스터**로 본다.
- 같은 스타일이라도 공장마다 공정/시간/비용 구조가 다를 수 있으므로, **공정 정보는 공장 소속 데이터**로 관리한다.
- 브랜드는 공정 정보를 직접 볼 수 없다.
- 스타일 상세의 `기본 정보` 탭에서는 공정 요약/예상 비용을 제거했다.
- 대신 공장 전용 `스타일 분석` 탭에서 공정/비용 정보를 본다.
- 주문 화면에서 신규 스타일을 등록한 뒤 주문 화면 스타일 목록은 자동으로 새로고침된다.

### 주문의 두 축: 확정 여부 / 진행 단계

- 주문에는 서로 다른 2개 축이 있다.
- `확정 여부`:
  - 값: `계획`, `확정`
  - 의미: 수주자(제조사/공장)가 이 주문 기준으로 실제 작업을 시작해도 되는지 여부
- `진행 단계`:
  - 값: `접수`
  - 의미: 현재 구현에서는 주문 상태를 `접수` 하나로만 운영한다.
- 주문 목록/필터에서는 `확정 여부`와 `진행 단계`를 분리해 표시한다.
- 주문 등록/수정 화면의 기본 정보 입력 영역에서는 `확정 여부`, `진행 단계`를 직접 보여주지 않는다.
- 주문 목록 테이블에서는 `확정 여부`, `진행 단계`를 맨 왼쪽 컬럼으로 둔다.

### 주문 권한/잠금 규칙

- 브랜드와 공장은 모두 주문을 만들 수 있다.
- 공장도 브랜드 주문을 입력/수정할 수는 있다.
- 하지만 `확정 여부`를 `확정`으로 바꿀 수 있는 주체는 브랜드만이다.
- `확정`된 주문은 기본 정보 수정이 잠긴다.
- 현재 구현에서는 `확정` 후 진행 단계는 수동 입력이 아니라 **자동 업데이트 값**으로 본다.
- 주문 삭제는 `계획` 상태에서만 가능하다.

### 진행 단계 자동 업데이트 규칙 (현재 구현)

- `접수`
  - 현재는 모든 주문 상태를 `접수`로 유지한다.
  - `Lock` / `Unlock` / 배정 상태 변경이 있어도 다른 상태로 자동 전환하지 않는다.
- `완료`
  - 의미는 `주문 자체가 완전히 종료된 상태`이다.
  - 즉 생산 완료만 뜻하는 값으로 쓰지 않는다.
  - 완료 기능은 아직 만들지 않았다.
  - 기능이 준비되기 전까지는 상태 종류에 포함하지 않는다.
- 현재 화면의 진행 단계 필드는 조회용이다. 직접 수정용으로 쓰지 않는다.

### 내부 코드 매핑 메모

- 현재 화면 라벨 기준:
  - `ORDER_RECEIVED` = `접수`
  - `PRODUCTION_DONE`는 과거의 `생산 완료` 의미로 남아 있는 레거시 코드다.
  - `완료`를 이 코드의 화면 의미로 재사용하지 않는다.
  - 나머지 상태 코드(`IN_PROGRESS`, `SHIPPED`, `SETTLED`)도 레거시 호환용으로만 남겨둔다.

### 아직 안 만든 것 / 이후 개발 메모

- `완료` 자동 전환:
  - 나중에 완료 기능/판정 기준이 생기면, 그 이벤트 시점에 주문 상태를 `완료`로 자동 변경한다.
  - 이때의 `완료`는 생산 완료가 아니라 주문 전체 종료 의미로 정의한다.
- `확정 주문 수정 워크플로우`:
  - 아직 구현하지 않았다.
  - 정책 확정 후 개발한다.
  - 검토 후보:
    - 확정 해제 후 수정
    - 수정 요청 워크플로우
    - 변경 주문(delta) 분리
 - 이후 완료 기능을 붙이더라도 `확정 여부`와 `진행 단계`를 하나의 상태로 합칠지는 그때 다시 판단한다.

### 로딩 / 재요청 원칙

- 탭 전환만으로는 데이터 재요청이 발생하면 안 된다.
- keep-alive 탭은 전환 후에도 기존 상태를 유지하고, 탭 활성화만으로 `forceRefresh`를 다시 걸지 않는다.
- 목록/상세의 최신 데이터가 꼭 필요하면 자동 재요청 대신 탭을 닫았다가 다시 여는 쪽을 기본 UX로 본다.
- 저장 후 다른 탭의 숨겨진 목록을 백그라운드에서 자동 재조회하지 않는다.

---

## 핵심 도메인 개념

### 시간 관리 체계

#### 핵심 개념 정의

**PT (Planned Time) — 인간 추정 기준점**
- 스타일+공정별 `PT(1000)` 하나만 가진다.
- 공장장/매니저가 스타일 최초 등록 시 입력하는 기본 가이드라인이다.
- 다른 q값의 `PT(q)`는 따로 두지 않는다.
- 새로운 `ST(q)` 기준점이 처음 필요할 때 초기 참고값으로만 사용한다.
- PT 변경은 이미 저장된 `ST(q)`나 카드별 `CT`를 자동으로 덮어쓰지 않는다.

**AT(q) (Actual Time) 정의**
- AT(q)는 WorkRecord 누적으로 자동 산출되는 “수량 q에 대한 개당 평균 시간 함수”이며, 운영자가 직접 입력하지 않는다.
- **AT(q)는 공정별(Style + Process)로 존재한다.**
- **형태**:
  ```
  AT_p(q) = a_p + b_p / q
  TotalTime_p(q) = a_p * q + b_p
  ```
- **해석**:
  - `a_p`: 대량 생산에서 수렴하는 순수 작업 시간 (초/개)
  - `b_p`: **공정 단위 시작 오버헤드**로 정의하며, 하루에 해당 공정을 수행하면 1회 발생하는 고정 시간으로 모델링한다.
- **저장 위치**:
  ```json
  atParams = {
    "a": number,
    "b": number,
    "version": number,
    "updatedAt": "timestamp",
    "trainedPeriod": "YYYY-MM"
  }
  ```
- 단순 숫자 `at`는 더 이상 정책상 원본 필드가 아니다.
- 데이터가 부족하여 파라미터를 추정할 수 없는 경우 `atParams`는 `null`일 수 있다.
- 배정/협의 화면에서 AT가 없으면 `수집중`으로 표시한다.

**AT(q) 고급 추정(구현) — 비례배분 + WLS 반복학습**
- **문제 정의**: 공정별 실제 투입 시간(`t_p`)은 직접 관측할 수 없다. 관측 가능한 데이터는 라인별/일별 총 근무시간(`T_d`)과 공정별 생산 수량(`q_d,p`) 뿐이다.
- **관측 데이터 (라인 × 일자 `d` 단위)**:
  - `T_d`: 해당 라인의 해당 일자 총 근무시간 (초)
  - `q_{d,p}`: 해당 라인 해당 일자에 공정 `p`로 기록된 처리 수량 (WorkRecord는 `assignmentPlanId`를 통해 공정별 수량과 연결됨)
- **핵심 원리**: 현재 추정치 `w_p`(초/개)를 기준으로 하루 총 근무시간 `T_d`를 공정별 작업량에 비례 배분하여 가상 투입시간 `t̂_{d,p}`를 산출한다. 이 가상 데이터를 기반으로 공정별 회귀분석을 수행하고, 이 과정을 수렴할 때까지 반복한다.

**1. 초기값 설정**
- `w_p` = PT(Planned Time) 기반 개당 작업 시간 (초/개)
- 초기 학습 단계에서는 안정성을 위해 `b_p = 0`으로 고정하고 `a_p`를 중심으로 학습을 시작한다.

**2. 반복 학습을 통한 파라미터 수렴 (안정성 우선)**
- (비례배분 → OLS → Trim) 과정을 파라미터 변화량이 충분히 작아질 때까지(수렴할 때까지) 반복한다. 이 단계에서는 가중치(`w_trend`, `w_mag`)를 적용하지 않고 수렴 안정성을 우선 확보한다.

  **2-1. 비례배분 (시간 할당)**
  - 각 공정의 작업량(`work_{d,p}`)과 일일 총 작업량(`W_d`)을 계산한다.
    ```
    work_{d,p} = q_{d,p} * w_p
    W_d = Σ_p work_{d,p}
    ```
  - `W_d = 0`인 날짜(작업 기록이 없는 날)는 학습 데이터에서 제외한다.
  - 비례 배분을 통해 공정별 가상 투입시간 `t̂_{d,p}`를 추정한다.
    ```
    t̂_{d,p} = T_d * (work_{d,p} / W_d)
    ```

  **2-2. 공정별 OLS (Ordinary Least Squares) 회귀분석**
  - 각 공정 `p`에 대해, 데이터 포인트를 사용하여 선형 모델 `t̂ = a_p * q + b_p`를 피팅한다.
  - **데이터셋 규칙**: 공정 `p`에 대해 **`q_{d,p} = 0`인 일자는 해당 공정의 OLS 데이터셋에서 제외한다.**
  - **Outlier 제거 (Trim)**: `T_d` 또는 `T_d / Σ q_{d,p}` (일일 평균 작업 시간) 기준 상/하위 p% 데이터는 회귀분석에서 제외한다.
  - **제약 조건**: `a_p >= 0`, `b_p >= 0`. 데이터 부족 시 `b_p = 0` 고정 후 `a_p`만 추정한다.

  **2-3. 파라미터 업데이트**
  - `w_p`를 새로 추정된 `a_p`로 업데이트한다: `w_p ← a_p`

**3. 최종 가중치 계산 및 WLS 적용 (정확성 보정)**
- 반복 루프가 수렴된 후, 최종 파라미터를 결정하기 위해 가중치를 적용한 회귀분석을 **단 1회** 수행한다.

  **3-1. WLS를 위한 데이터 재계산**
  - 반복 루프에서 최종적으로 **수렴된 `w_p`를 기준**으로, 전체 학습 기간에 대해 **비례배분을 다시 수행하여 `t̂_{d,p}`를 재계산**한다. 이후 WLS 단계에서는 이 재계산된 데이터를 사용한다.

  **3-2. 데이터 품질 가중치 계산 (Weight + Drift)**
  - **편차 기반 가중치 (`w_mag`)**: 수렴된 `atParams`로 예측한 시간 `T̂_d`와 실제 시간 `T_d`의 차이(`r_d`)가 클수록 가중치를 낮춘다. (`r_d = (T_d - T̂_d) / T_d`)
  - **방향성 기반 가중치 (`w_trend`)**: 편차가 크더라도 한 방향으로 지속 발생하면(Drift) 의도된 변화로 간주하여 가중치를 높인다.
  - **일자별 최종 가중치 (`w_day`)**: `w_day = max(w_mag, w_trend)`. Trim으로 제외된 데이터는 `w_day = 0`으로 처리된다. **`w_day`는 일자 단위 가중치이며, 해당 일자에 수행된 모든 공정 `p`에 동일하게 적용된다.**

  **3-3. 공정별 WLS (Weighted Least Squares) 회귀분석**
  - **공정별 OLS는 Weighted Least Squares(WLS) 방식으로 수행하며, 각 데이터 포인트 `(q_{d,p}, t̂_{d,p})`에 일자 가중치 `w_day`를 적용한다.**
  - 이 WLS를 통해 최종 `a_p`와 `b_p`를 확정한다.

**4. 월간 변경폭 제한 (Clamp)**
- 새로 계산된 `a_p_new`는 `a_p_old` 대비 ±δ% (예: 5~15%) 범위 내로 clamp하여 급격한 변화를 방지한다. **월간 변경폭 제한은 `a_p`에 적용하며, `a_p_new`는 `a_p_old` 대비 ±δ% 범위 내로 제한한다.**
- `b_p`는 초기에는 `0`으로 고정하거나, 별도의 안정화 정책에 따라 제한적으로 학습/갱신한다.

**학습 실행 정책**
- **실행 시점**: 매달 5일 00:00 이후(Asia/Seoul) 스케줄러 자동 실행 + 이벤트 트리거 보조
- **전월 raw 적재**: 실행 시점마다 직전 월 `WorkLog/WorkRecord/Attendance`를 읽어 `AtTrainingBucket` / `AtTrainingBucketProcess`에 다시 적재한다.
  - `AtTrainingBucket`: `라인×일자(workLog)` 단위의 `T_d`, 출퇴근 커버리지, 기준 월
  - `AtTrainingBucketProcess`: 해당 bucket 안의 **스타일+공정(`styleProcessId`)별 `q_{d,p}`**
- **실제 학습 대상**: 당월 학습 시점의 전월 raw만 직접 읽는 것이 아니라, **누적된 bucket 전체(대상 월 이하)** 를 사용한다.
  - 예: `2026-03-05` 학습은 `2026-02` raw를 bucket에 적재하고, 실제 피팅은 `... + 2026-01 + 2026-02` 누적 bucket으로 수행한다.
  - 초기 배포 후 bucket이 비어 있으면 과거 월 raw를 한 번 backfill해 누적 기반을 만든다.
- **출퇴근 기록 폴백 규칙(확정)**:
  - 매달 5일까지 전월 출퇴근 기록이 입력된 경우: 입력된 실제 근무시간으로 `T_d`를 사용한다.
  - 매달 5일까지 전월 출퇴근 기록이 입력되지 않은 경우: 해당 라인/작업자는 `T_d = 8 * 3600` (8시간)으로 간주한다.
  - 위 규칙은 학습(AT 갱신)에만 적용하며, 실제 급여 계산 기준은 별도 정책을 따른다.
  - 구현상 폴백은 `workerId + factoryId + workDate` 단위로 적용된다.

**AT 추정 구현(현재)**
- 현재 운영 구현은 **라인×일자 총시간(T_d)을 공정별 작업량(q×w_p)으로 비례배분**하고, 공정별 `t = a*q + b`를 반복 추정한다.
- 학습 단위는 반드시 **스타일+공정(`styleProcessId`)** 이다. 스타일 단독 집계는 사용하지 않는다.
- 매달 5일 실행 시:
  1. 전월 raw를 `AtTrainingBucket` 계열 테이블로 재적재
  2. 누적 bucket 전체(대상 월 이하)를 읽어 스타일+공정별 관측치를 구성
  3. `w_p <- a_p` 반복 수렴 후, 일자 단위 가중치(`w_day = max(w_mag, w_trend)`)를 적용한 최종 WLS를 1회 수행해 `a,b`를 확정
- 월간 급변 방지를 위해 `a`는 직전 값 대비 `±AT_MONTHLY_A_CLAMP_RATIO` 범위로 clamp한다.
- 추정 결과는 `StyleProcess.atParams = { a, b, version, updatedAt, trainedPeriod, attendanceCoverage, attendanceFallbackShare, observationCount }`로 저장한다.
- 데이터가 부족하거나 회귀가 불안정한 경우에는 `b=0`(원점 통과 slope) 및 평균 단위시간 fallback을 사용한다.
- 오래된 월 데이터가 수정되면 해당 월 bucket을 다시 적재한 뒤 AT를 재실행해야 한다. 운영상 수동 실행은 `POST /at-sync/run-now`의 `trainingMonthKey=YYYY-MM`로 맞춘다.

**ST(q) (Standard Time) — 정책 기준값 (충격 완충재)**
- PT → AT로 기준이 전환될 때 급격한 변화를 막기 위한 완충 구간
- AT(q)가 나왔다고 ST를 바로 AT로 맞추지 않음 — 현장 충격(파업 등) 방지
- 운영팀이 AT(q)를 참고해 ST를 점진적으로 조정
- ST는 스타일+공정별 `q` 기준점으로 저장한다.
- ST 버킷은 `1~10~30~100~300~1000~3000~10000~30000~100000` 구간으로 관리한다.
- 예: 화면에서 `q=150`를 보면 `AT(150)`은 그대로 계산하고, `ST`는 `100 이상 300 미만` 구간이므로 `ST(100)`을 사용한다.
- 같은 공정명이라도 스타일이 다르면 다른 ST 집합이다.
- 새로운 수량 q가 처음 필요하면 초기값은 `PT(1000)`을 참고해 만든다.
- 이후 운영팀이 수동으로 수정한 `ST(q)`는 그 스타일+공정+수량의 반복 사용 기준이 된다.
- ST는 CT 합의 결과로 자동 갱신되지 않는다.
- ST 값의 증가/감소 방향은 시스템이 강제하지 않고, 추후 `ST 검토` 메뉴에서 경고만 제공한다.
- PT/ST/CT 기준 공정시간은 최소 하한을 두지 않고 `0 이상 정수 초`로만 관리한다.

**CT (Contracted Time) — 카드 단위 확정 스냅샷**

> 아래 CT 협의 상태 흐름/버튼 규칙은 2026-03-14 이전의 레거시 메모다. 신규 개발 기준은 문서 상단 `2026-03-14 현재 운영 기준`과 `오늘 반영 메모 (2026-03-14)`를 따른다.

- 주문 수량 q 확정 후, 시스템이 현재 ST(q)를 제안값으로 보여주고 라인장이 승인/조정하여 확정
- CT는 함수가 아닌 카드(AssignmentPlan) 단위 고정값. **확정 후 ST/PT/AT 변경과 완전히 무관**
- **급여 = CT × 수량** (단순)
- `proposalSeconds`: 운영팀 제안 CT(초기 오퍼). **배정 건 전체 총시간(초)**
- `contractedSeconds`: 최종 합의 CT(지급 기준). 제안 송부 시점에는 `null` 가능. **배정 건 전체 총시간(초)**
- `proposalSeconds` / `contractedSeconds` / `totalSeconds`는 카드 1건 전체 총시간이다.
- 스타일 레벨 `PT(1000)` / `AT(q)` / `ST(q)` 저장 구조와 카드 레벨 `CT` 스냅샷은 구분해서 본다.
- **CT 제안 흐름은 스타일의 ST 기준점을 절대 수정하지 않는다.** CT는 해당 AssignmentPlan의 `proposalSeconds`/`contractedSeconds`에만 저장된다
- **배정 화면에서 ST(q) 수정 불가** — ST(q)는 스타일 상세 화면에서만 변경한다
- **라인마다 CT가 다를 수 있다**: 같은 스타일을 여러 라인에 배정하면 각 라인이 협의한 CT가 독립적으로 저장되며 서로 영향을 주지 않는다

#### CT 협의 상태 흐름 (ctStatus)

```
PENDING (제안 전)
  └─ 운영팀 "제안 송부" ────────────────────────────────── SENT
       proposalSeconds = 운영팀 제안값
       contractedSeconds = null
       ctSource='OPERATOR_PROPOSAL'

SENT (승인 전, 제안 송부 상태)
  ├─ 라인장 "동의" ──────────────────────────────────────── AGREED
  │    contractedSeconds = proposalSeconds (제안값 수락)
  │    ctAgreedBy='LINE_LEADER' (실사용자명), ctAgreedAt 기록
  └─ 라인장 "변경 요청" ────────────────────────────────── REJECTED
       ctSource='LINE_LEADER_PROPOSAL', ctOverride=true
       pendingCtProposal에 공정별 요청 CT 저장

REJECTED (변경 요청, 운영팀 재검토)
  ├─ 운영팀 "요청 동의" ────────────────────────────────── AGREED
  │    ctAgreedBy='OPERATOR', ctSource='LINE_LEADER_PROPOSAL'
  │    contractedSeconds = 라인장 요청 CT
  │    proposalSeconds는 기존 제안값 유지
  ├─ 운영팀 "다시 제안" ────────────────────────────────── SENT
  │    proposalSeconds 갱신, contractedSeconds는 null 유지
  └─ 운영팀 "배정 취소" ────────────────────────────────── 배정 삭제 + 미배정 카드 복귀

AGREED (확정)
  └─ 관리자 "재협의 개시" ──────────────────────────────── PENDING
       ctSource='REOPENED_BY_ADMIN'
       기존 합의값은 card.ctAgreementHistory에 보관
```

> 이 블록은 2026-03-14 이전 CT 협의/잠금 정책 메모다.
> 현재 구현은 `SENT`/`AGREED`/`REJECTED` 상태 흐름과 `isAssignmentLockedStatus`를 사용하지 않는다.
> 최신 기준은 문서 상단 `오늘 반영 메모 (2026-03-14)`의 `CT 단일 snapshot 정책`과 `런타임 레거시 정리`를 따른다.

#### CT 협의 UI 버튼 규칙 (ProductionPlanBoard)
- **동의 버튼 활성**: 요청 CT 입력값이 없거나 제안 CT와 동일한 경우
- **변경 요청 버튼 활성**: 최소 1개 공정에서 요청 CT가 제안 CT와 다른 경우
- 두 버튼은 항상 둘 중 하나만 활성화됨 (상호 배타적)
- 버튼 variant도 활성/비활성에 따라 contained/outlined로 전환
- 액션(동의/변경 요청) 성공 시 우측 확장 패널은 자동으로 닫혀 목록 복귀

#### ctOverride 의미
- `ctOverride`는 **AssignmentPlan DB 컬럼이 아니라** `AssignmentBoardState.assignments`의 보드 상태 값이다.
- DB 영속 상태 판별은 `ctStatus + ctSource (+ contractedSeconds)` 조합을 기준으로 본다.
- 상태 해석 기준:
  - `SENT + ctSource='OPERATOR_PROPOSAL'` → 운영팀 제안 송부 후 라인장 승인 대기
  - `REJECTED + ctSource='LINE_LEADER_PROPOSAL'` → 라인장 조정 요청, 운영팀 검토 대기 중
  - `AGREED + ctSource='LINE_LEADER_PROPOSAL'` → 운영팀이 라인장 요청 CT 동의 완료
  - `AGREED + ctSource!='LINE_LEADER_PROPOSAL'` → 라인장이 제안 CT를 동의해 확정

#### 시간의 두 가지 용도 — 반드시 구분

| 용도 | 사용 시간 | 이유 |
|------|-----------|------|
| **배정 예상 기간** (endIndex 계산) | **ST(q)** (없으면 PT(1000)을 참고해 ST(q) 생성 후 사용) | ST(q)가 현재 공식 기준값이며, AT는 참고용일 뿐 자동 fallback이 아니다 |
| **CT 제안값** (라인장 협의 출발점) | 현재 ST(q) | 충격 완충 + 재협의 연속성 |
| **급여 확정값** | CT (contractedSeconds 스냅샷) | 합의된 계약값, 이후 변경 없음 |

> ST(q)는 AT(q)가 추출된 뒤 운영자가 스타일 상세에서 수동 조정하는 현장 기준값이다.
> ST(q) 수정은 수정 시점 이후 생성되거나 미배정 상태인 카드에만 반영된다 (배정된 카드는 생성 시점의 totalSt 스냅샷 유지).
> CT 합의/거부는 배정 기간(totalSeconds)에 영향을 주지 않는다 — contractedSeconds만 변경된다.

#### ST/CT 운영 흐름
1. **스타일 최초 등록**: `PT(1000)` 입력. 새로운 수량 `q`가 처음 필요해질 때 `PT(1000)`을 참고해 `ST(q)`를 만든다.
2. **AT(q) 산출 시작**: `atParams`가 갱신되어도 배정/CT 기본값은 자동으로 AT로 바뀌지 않는다.
3. **AT(q) vs ST(q) 차이 기준 이상**: "ST 조정 필요" 경고 → 운영팀이 `ST(q)`를 검토/수정한다. 단번에 AT로 맞추지 않음
4. **배정 시 CT 협의**: 시스템이 현재 ST(q)를 제안값으로 표시
   - 제안 송부 시 `proposalSeconds` 저장, `contractedSeconds`는 비움(null)
   - 라인장 동의 → `contractedSeconds = proposalSeconds`로 확정 (ctStatus=AGREED)
   - 라인장 조정 요청 → `pendingCtProposal`에 요청 CT 저장 (ctStatus=REJECTED)
   - 운영팀 요청 동의 → `contractedSeconds = 요청 CT`, `proposalSeconds`는 보존
5. **CT 확정 후**: 해당 카드의 CT는 영구 고정. ST 변경·AT 갱신 무관
6. **다음 배정**: 최신 ST(q) 기준으로 다시 제안

#### 공임 계산
`급여 = contractedSeconds(CT) × 수량` — CT 확정 후에는 다른 값 참조 없음

---

### 작업 배정 (Assignment) vs 작업 기록 (WorkLog)
- **작업 배정은 계획이다.** 실제 작업 결과와 다른 것이 정상
- 실제 작업 기록이 배정 계획의 내용(CT, 수량 등)에 영향을 주지 않음
- 현장에서는 A작업과 B작업을 섞어서 진행할 수 있고, 계획과 실제 순서가 다를 수 있음

### 작업 기록 입력 흐름
- **운영자**가 소속 공장 작업자들의 작업 기록을 대신 입력 (작업자 본인이 직접 입력하지 않음)
- 공장 선택 → 라인 선택 → 해당 라인에 배정된 카드 목록 조회
- 카드 선택 → 스타일, 색상, 공정 목록 자동 로드
- 작업자 선택 → 공정별 수량만 입력
- WorkRecord에 `assignmentPlanId` 자동 연결 → WorkRecord ↔ AssignmentPlan 연결 확보
- 한 라인에 카드가 여러 개 있으면(A/B 혼용) 카드를 각각 선택해 기록
- 현재는 배정된 카드 기반 작업 기록만 지원 (배정 외 작업 기록은 향후 검토)

### 급여 계산 기준
- **급여 = WorkRecord 기반** — 공정이 기록되면 지급 대상 (옷 전체 완성 여부와 무관)
- 카드(AssignmentPlan) 완료 여부는 급여와 무관
- WorkLog.factoryWagePerSecond, WorkRecord.ctSeconds 모두 입력 시점의 스냅샷으로 저장됨

### 라인 capacity 계산
- 일일 capacity = 라인 인원 수 × 시프트 시간(초)
- LineAssignment로 인원 변동 이력 관리 (startAt / endAt)
- 라인 인원이 변경되면 해당 라인의 AssignmentBoard capacity를 재계산 (트리거 방식)
- headcount 스냅샷은 저장하지 않음 — 변경 시 재계산으로 처리
- **구현 방식**: `updateLineHeadcounts(lineId, tx)` 백엔드 헬퍼로 LineAssignment 이력 기반 headcount 재계산
  - LineBoard 프론트엔드: API 응답에서 즉시 상태 업데이트
  - ProductionPlanBoard: `visibilitychange` 이벤트 시 재조회

### 급여 계산
- 기준: WorkRecord의 ctSeconds × 수량 × factoryWagePerSecond
- WorkLog에 factoryWagePerSecond 스냅샷 저장 (Factory 단가 변경에 무관)
- WorkRecord에 ctSeconds 스냅샷 저장 (Style CT 변경에 무관)
- **공장 초당 급여 단가 정책(확정)**: `factoryWagePerSecond = 월 목표 급여 / (26일 × 8시간 × 3600초)` 고정
- **PayrollSnapshot 모델 구현 완료**: orgId, month(YYYY-MM), data(JSON 스냅샷), lockedAt(DateTime), lockedBy(String)
  - GET /payroll: WorkRecord × ctSeconds × quantity × factoryWagePerSecond 집계, 직원/월 단위 그룹핑
  - POST /payroll/lock: 해당 월 잠금(lockedAt/lockedBy 기록) → 확정 후 소급 변경 불가

---

## 사용자 · 구독 관리

### 접근 제어 구조
- **SystemUser**: 시스템 수준 사용자. `systemRole: SYSTEM_ADMIN | USER`
  - `krsailer82@gmail.com` 최초 로그인 시 SYSTEM_ADMIN으로 자동 프로비저닝 (하드코딩)
- **OrgMembership**: 조직 수준 접근 제어. `role: ADMIN | OPERATOR | ACCOUNTANT | WORKER`
  - `status: PENDING | ACTIVE | REJECTED | SUSPENDED | TERMINATED`
  - 로그인 사용자의 이메일로 OrgMembership 조회 → orgId, orgRole 결정
  - **과금과 무관**하다. 직원 수, 역할, 직무, 소속 여부는 회사 과금 기준이 아니다.
- **OrganizationSubscription**: 구독 상태. `status: NOT_SUBSCRIBED | TRIAL | ACTIVE | GRACE | SUSPENDED`
  - **회사 단위 SaaS 사용/과금 상태**다. 비용 주체는 회사이며 개별 직원이 아니다.
  - SUSPENDED 조직 멤버는 API 호출 시 403 차단 (로그인 자체는 허용)
  - NOT_SUBSCRIBED도 로그인은 가능 — 구독 상태가 로그인을 막지는 않음
  - UI/응답에서는 `serviceContactEmail` 용어를 사용하고, DB 컬럼 `membershipEmail`은 레거시 호환용 내부 저장 필드로 유지한다.

### 실제 사용자 등록 절차
1. 시스템 관리자가 `/system` 화면에서 조직 생성 (구독 상태 설정)
2. 해당 조직에 사용자 Google 이메일을 역할과 함께 assign → OrgMembership(status=ACTIVE) 생성
3. 사용자가 Google 로그인 → `GET /auth/context`에서 이메일로 ACTIVE 멤버십 조회 → orgId, orgRole 반환
4. 조직 등록 폼에서 "초기 관리자 이메일" 입력 시 조직 생성과 동시에 멤버십 할당 가능
5. 초기 관리자 할당은 접근권한 편의 기능일 뿐이며, 회사 구독/과금과는 분리한다.

### auth/context 판단 로직
- 이메일 = SYSTEM_ADMIN 이메일 → entryType='SYSTEM' 반환 (orgId=null)
- 이메일로 ACTIVE OrgMembership 조회 → entryType='ORG', orgId, orgRole 반환
- 멤버십 없거나 ACTIVE 아니면 → 403

### 프론트엔드 루트 라우트 정책
- `/`는 더 이상 대시보드 페이지가 아니다. 인증된 사용자가 `/`로 들어오면 `resolveFirstAccessiblePath` 기준 첫 접근 가능 메뉴로 즉시 redirect한다.
- 로그인 성공, OAuth 콜백 복귀, 권한 없는 URL fallback, 마지막 탭 종료 후 복귀 경로는 모두 같은 기준(`resolveFirstAccessiblePath`)으로 맞춘다.
- 사이드바/탭은 실제 메뉴만 다룬다. `/`는 빈 워크스페이스나 고정 탭으로 유지하지 않는다.

---

## 데이터 모델 요약

```
Organization (MANUFACTURER | BRAND)
  └─ OrganizationSubscription (status, membershipEmail[legacy 내부 저장], billingEmail, trialStartedAt, ...)
  └─ OrgMembership (email, role, status, approvedAt)
  └─ Factory
       └─ Line
            └─ LineAssignment (직원-라인 배정, startAt/endAt)
  └─ Employee (OrgMembership 1:1)
  └─ Style (processes: JSON [{code, name, pt, atParams:{a,b,version,updatedAt,trainedPeriod}, at, ct, stManual, timeRefQuantity, quantity}], bom: JSON)
       ※ PT: 매니저 직접 입력. AT 없을 때 ST(q) 기준값으로 사용
       ※ atParams: WorkRecord 기반 자동 산출. 현재는 스타일+공정 단위 관측점으로 WLS 회귀(`t=a*q+b`) 후 `a,b`를 저장. 데이터 부족 시 null 또는 `b=0` fallback
       ※ ct: ST(q) 역할. 운영팀이 수동 ST를 관리할 때 저장되는 기준값
       ※ 공정별 quantity 필드 있음 (processQuantity로 CT 계산 시 반영)
  └─ WorkOrder
       └─ WorkOrderItem (styleId, colorId→AttrColor FK, colorCode, colorName, gender, sizeQuantities, sortOrder)
  └─ AssignmentCard (cardId, sortOrder, payload: JSON) — 미배정 카드 저장 테이블
  └─ AssignmentPlan (lineId, contractedSeconds, ctSnapshot, startIndex, endIndex, isCompleted, finalQuantity, completedAt)
  └─ AssignmentBoardState (assignments: JSON) — 수동 저장 보드 스냅샷(upsert)
       ※ assignments: 라인 타임라인에 배정된 카드 배열 (AssignmentPlan의 프론트엔드 표현)
       ※ cards 컬럼은 레거시 호환/이관용으로만 유지, 현재 소스 오브 트루스는 `AssignmentCard`
  └─ PayrollSnapshot (orgId, month, data: JSON, lockedAt, lockedBy)
  └─ SystemUser (email, systemRole)
  └─ WorkLog (workDate, factoryWagePerSecond snapshot)
       └─ WorkRecord (workerId, ctSeconds snapshot, quantity, assignmentPlanId)
```

### 회사 구독 화면 정책 (2026-03-22)
- `/system` 구독 화면은 `회사 구독 관리` 기준으로 유지한다.
- 화면에서 다루는 핵심 값은 `구독 상태`, `서비스 담당 이메일`, `청구 이메일`, `활성 종료일`이다.
- 회사 생성 시 보이는 `초기 관리자 할당` 영역은 접근권한 부여용 옵션이며, 과금 섹션과 명확히 분리해서 안내한다.
- 직원 수/역할/직무 기반 과금 UI나 집계는 만들지 않는다.

### AssignmentBoardState 주의사항
- 조직당 단 1개의 레코드 (upsert)
- 작업 배정 보드는 **수동 저장 버튼**으로만 저장 (자동저장 없음)
- 저장되지 않은 변경이 있으면 라우트 이동/탭 이탈/브라우저 종료 시 경고
- `assignments`에는 `startDateKey`, `version`, `versionUpdatedAt` 같은 보드 전용 필드가 포함된다.
- 저장은 `PUT /assignment-board-state` 기준으로 assignment 단위 optimistic concurrency를 사용하며, stale version이면 `409 assignment version conflict`를 반환한다.
- UI는 로컬 undo/redo(최대 30단계)만 제공한다. 서버가 과거 스냅샷을 보관해 복원해 주지는 않는다.
- **cards vs assignments 구분**:
  - `cards`: 미배정 풀 (일반 카드 + DELTA 카드). 라인에 아직 배정되지 않은 것. 현재는 `AssignmentCard` 테이블에 저장된다.
  - `assignments`: 라인 타임라인에 배정된 카드. 현재 CT 총합(`contractedSeconds`)과 원본 snapshot(`ctSnapshot`)을 함께 가진다.
- 신규 로직은 카드 payload에 협의 이력/상태를 저장하지 않는다. 예전 데이터 호환용 legacy 필드는 읽기 단계에서만 정리해 흡수한다.
- DELTA 카드(type='DELTA')는 `AssignmentCard`에만 존재, assignments에는 없음
- `AssignmentBoardState.cards`는 레거시 JSON 필드로 남아 있지만 신규 로직의 읽기 소스로 사용하지 않는다.

### 카드(Card) 개념
- **(수주 × 스타일 × 색상 × 성별) 조합으로 자동 생성되는 배정 단위**
- 같은 스타일·색상이라도 수주가 다르면 별개의 카드로 인식
- 미배정(unassigned pool)과 배정(line timeline) 상태로 구분
- 미배정 카드는 `AssignmentCard` 테이블에 영속 저장되고, 배정 카드는 `AssignmentBoardState.assignments` + `AssignmentPlan`으로 관리된다.
- `GET /assignment-cards`는 `AssignmentCard` 테이블만 읽는다. 조회 시 재계산하지 않는다.
- 카드는 수량 기준으로 분할(split) / 병합(merge) 가능
- 분할 시 새 카드 id가 생겨도 `originOrderId`는 유지한다.
- 병합은 `originOrderId`가 같은 카드/배정끼리만 허용된다.
- 상태값 기반 잠금(`SENT/AGREED`)은 신규 로직에서 사용하지 않는다.
- 카드에 배정된 수량과 수주 수량은 독립적 (수동 관리)

### 수주 수량 변경 시 배정 처리 (정책 확정)
- 수주 수량 변경 시 **해당 수주의 기존 배정은 취소**하고, 변경된 수량 기준으로 **미배정 카드로 재생성**한다.
- 수량이 `0`이면 해당 카드는 제거한다.
- 동일 주문에 매달린 DELTA 카드는 함께 정리하고, 다른 주문의 DELTA 카드는 유지한다.
- 주문 저장 후 서버는 즉시 `AssignmentCard`를 재생성한다. 배정 보드에 이미 올려둔 카드 취소/DELTA 정리는 현재 프론트(`OrderList.jsx`)의 `reconcileBoardStateForQuantityChanges` 저장 흐름과 함께 동작한다.
- 즉, 수량 변경 시 기존 배정 카드의 기간을 늘이거나 줄여 유지하지 않는다.
- 결과적으로 변경분 반영 이후에는 운영자가 다시 배정(라인/시작일 지정)하도록 한다.

---

## 비즈니스 규칙

1. CT(Contracted Time)는 배정 저장 시점의 snapshot으로 저장되며, 이후 PT/AT/ST 변경과 완전히 무관
2. WorkLog/WorkRecord는 직원 퇴사 후에도 보존 (workerId nullable)
3. 작업 배정 계획과 실제 작업 기록은 독립적으로 유지
4. 수주 수량과 배정 카드 수량은 별도 관리 (카드는 수주를 쪼개서 배정)
5. 급여 계산은 WorkRecord의 ctSeconds 기준 — Style.processes 변경 영향 없음
6. 라인 인원 변경 시 해당 라인의 AssignmentBoard capacity 재계산 (트리거 방식)
7. 카드 완료 처리: isCompleted 플래그 + finalQuantity 입력 — 저장된 CT snapshot과는 별개로 최종 수량만 관리한다. 급여와 무관하며, 완료 처리 시 WorkRecord 누적 수량과 비교하여 초과 여부를 표시한다.
8. 초과 공정(WorkRecord 누적 > finalQuantity)도 **급여 지급 대상에 포함**한다.
9. 회계 관리의 `생산 결과` 메뉴는 연결만 되어 있으며, 세부 로직은 추후 구현한다.
10. **ST(q)는 `StyleProcessStandard(styleProcessId, quantity)` 기준점** — `Style.processes[].ct`, `stManual`, `timeRefQuantity`는 레거시 마이그레이션 전 임시 호환 모델
11. **ST 변경 절차**: AT(q)와 현재 ST 차이가 기준 이상이면 "ST 조정 필요" 안내 → 운영팀 검토 후 ST 값을 재설정
12. **구독 상태 SUSPENDED 조직**: API 호출 403 차단. 로그인 자체는 허용되나 데이터 접근 불가

---

## 개발 시 주의사항

- 날짜 인덱스: AssignmentPlan의 startIndex/endIndex는 달력 기준 일(day) 오프셋
- 스타일 코드: 별도 입력이 없으면 스타일명과 동일하게 저장 (buildPayload fallback)
- 타임라인 레인 배치: assignLanes는 실제 논리 범위(buildRange)로 충돌 감지, 시각 최소 너비(MIN_BAR_WIDTH)는 렌더 전용
- 휴일: 브라우저 localStorage에 저장, 일요일 + 공휴일 제외하여 capacity 계산
- 멀티테넌시: 모든 쿼리에 orgId 필터 필수
- Supabase Auth + Express 미들웨어로 인증 처리
- 개발 모드: DEV_BYPASS 플래그로 테스트 프로파일 사용 가능
- **드래그 연속 카드 밀기**: 배정 카드를 현재보다 앞 날짜로 드래그 시, 직후에 연속으로 붙어있는 카드(getNextStartIndex 기준)가 있으면 `tryRebuildLineWithInsert`로 함께 앞으로 이동. 단독 배치 가능한 경우에도 연속 카드가 있으면 밀기 우선 적용.
- **CT 협의 버튼 로직**: `hasCtAdjustment = selectedProcessRows.some(row => row.hasDirectProposal && row.proposedSeconds !== row.baseSeconds)` 로 변경 감지

---

## Clause 검토용 구현 반영 현황 (2026-02-23)

이 섹션은 정책 설명이 아니라, 현재 코드에 반영된 구현 기준이다.

### 1) ST/PT/AT(q) 반영 상태
- 스타일 공정 입력에서 공통 q(`timeRefQuantity`)를 먼저 지정하고 `PT(q) / AT(q, 자동) / ST(q)`를 표시/입력한다.
  - 파일: `frontend/src/pages/App/style/styleDetail/StyleProcess.jsx`
- 스타일 목록(`StyleBoard`)은 q 선택기가 없으므로 `PT / ST / AT`를 모두 `q=1000` 기준 개당 시간으로 표시한다.
  - 파일: `frontend/src/pages/App/style/StyleBoard.jsx`
- 저장 모델은 `StyleProcess + StyleProcessStandard + Style.processes(호환용 미러)`를 사용한다.
  - `StyleProcess`는 `PT(1000)`과 `atParams`를 저장한다.
  - `StyleProcessStandard`는 `q`별 `ST(q)` 기준점을 저장한다.
  - `Style.processes`는 레거시/화면 호환용 미러로만 유지한다.
  - 파일: `backend/prisma/schema.prisma`, `backend/src/index.ts`
- 배정 협의 ST 시드 계산 규칙(코드 기준):
  - 동일 q의 이전 제안 ST(`operatorCtProposal.stSeconds`) 우선
  - 없으면 해당 q의 저장된 `ST(q)` exact match
  - 없으면 `PT(1000)`을 참고해 `ST(q)`를 생성한 뒤 사용
  - `AT(q)`는 참고용으로만 사용하고 자동 fallback하지 않음
  - 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/production/ProductionPlanBoard.jsx`
- 중요: 스타일 화면에서 입력하는 ST는 현재 q에 대한 `stValues[q]`를 직접 수정하는 방식이다.
  - 파일: `frontend/src/pages/App/style/styleDetail/StyleProcess.jsx`, `frontend/src/utils/processTime.js`
- 구버전/혼합 데이터 보정:
  - `stManual`이 비어 있고 `ct≈at`이면 자동 ST로 추정한다(수동 오판 방지).
  - 파일: `frontend/src/utils/processTime.js`, `backend/src/index.ts`

### 2) 생산계획/CT 협의에 ST 규칙 반영
- 생산계획/작업배정 확장 패널 컬럼은 `PT(q) / AT(q) / ST(q) / 제안 CT(q) / 요청 CT(q)`로 구성한다.
  - 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/production/ProductionPlanBoard.jsx`
- PT가 현재 q와 다른 기준으로 저장되어 있으면 `ref q=...`로 fallback임을 명시한다.
- AT 데이터가 없으면 `수집중`으로 표시한다.
- CT 검토 보드도 AT 계산을 공통 유틸(`resolveProcessAtPerPieceSeconds`)로 통일했다.
  - 파일: `frontend/src/pages/App/production/CtReviewBoard.jsx`

### 3) 수량 변경 시 배정 취소/미배정 환원
- 주문 수량 변경 시, 해당 원본 카드(origin)와 연결된 기존 배정을 취소하고 변경 수량으로 미배정 카드를 재생성한다.
- 변경 수량이 `0`이면 해당 카드는 제거한다.
- 동일 주문의 DELTA 카드는 함께 정리하고, 타 주문 DELTA 카드는 유지한다.
- 파일: `frontend/src/utils/quantityChangeBoard.mjs`, `frontend/src/pages/App/order/OrderList.jsx`
- 회귀 테스트로 검증 중:
  - 파일: `scripts/quantity-change-regression.test.mjs`

### 4) 출퇴근 입력 + AT 학습 연동
- 출퇴근 입력 화면/라우트:
  - 라우트: `/attendance`
  - 파일: `frontend/src/router.jsx`, `frontend/src/layouts/MainLayout.jsx`, `frontend/src/pages/App/attendance/AttendanceBoard.jsx`
- 출퇴근 API:
  - `GET /attendance-entries` (일자/월 조회)
  - `PUT /attendance-entries` (해당 일자 데이터 교체 저장)
  - 파일: `backend/src/index.ts`
- AT 학습 시 근무시간 규칙(코드 기준):
  - 입력이 있으면 해당 `workedSeconds` 사용
  - 입력이 없거나 불완전하면 8시간(`28800`) 폴백
  - 학습 기준 월은 매월 5일 컷오프로 계산: 5일 이후면 전월, 5일 이전이면 전전월
  - 파일: `backend/src/index.ts` (`resolveAtTrainingMonthKey`, `syncStyleProcessActualTimesFromWorkRecords`)
- 출퇴근/작업기록 변경 시 AT 동기화가 백그라운드로 재실행된다.
  - 파일: `backend/src/index.ts`

### 5) 생산 결과
- 생산 결과 메뉴의 빈 초기 페이지가 연결되어 있다.
  - 라우트: `/production-result`
  - 페이지: `frontend/src/pages/App/production/ProductionResultBoard.jsx`
- 백엔드 API:
  - `GET /assignment-plan-progress`
  - 파일: `backend/src/index.ts`

### 6) Clause 확인 우선순위(추천)
1. 주문 수량 변경 시 기존 배정이 실제로 사라지고 미배정 카드로 재생성되는지 (`quantity=0` 포함)
2. 스타일 공정에서 `수동 ST/자동 ST`를 여러 번 전환해도 저장/재편집이 일관적인지
3. `stManual=false` 공정이 생산계획 보드에서 AT(q) 기준으로 계산되는지
4. 출퇴근 입력이 없는 데이터에서 AT 학습이 8시간 폴백으로 동작하는지
5. 생산 결과 메뉴 구현 시 권한/라우팅/탭 동작이 기존 회계 관리 흐름과 일관적인지

## AT 모델 현재 구현 단계 (2026-02-25)

- 백엔드 학습 진입점은 `backend/src/index.ts`의 `syncStyleProcessActualTimesFromWorkRecords`이며, 핵심 피팅은 `fitAtParamsWithProportionalAllocation`로 수행한다.
- 학습 단위는 **스타일+공정 조합**이다.
  - 키: `style.uid + process.code` 우선, code가 없으면 `style.uid + process.name`
  - 공정명이 같아도 스타일이 다르면 추정치는 분리된다.
- 학습 입력은 라인×일자 단위 버킷이다.
  - `T_d`: 해당 라인/일자의 총 근무시간(출퇴근 우선, 없으면 8시간 폴백)
  - `q_{d,p}`: 해당 라인/일자/공정 처리 수량
- 피팅 방식(현재 반영):
  - 비례배분 반복 수렴 루프(`w_p <- a_p`)
  - 방향성 가중치(`w_trend`) + 편차 가중치(`w_mag`) 기반 최종 WLS 1회
  - 월간 변경폭 clamp(`a_new`를 `a_old ± ratio` 범위 제한)
  - 제약: `a >= 0`, `b >= 0`; 데이터 부족 시 `b=0` 및 평균 단위시간 fallback
- 저장/반영:
  - `Style.processes[].atParams = { a, b, version, updatedAt, trainedPeriod }`
  - `Style.processes[].at` 필드는 삭제 대상 레거시이며, AT sync는 `atParams`만 갱신한다.
  - `stManual=false` 공정은 AT 동기화 시 `ct`를 PT(`pt`) 기준으로 유지 (AT 신뢰도가 충분해지면 운영자가 수동으로 ST 조정), `stManual=true` 공정은 수동 ST(`ct`) 유지
- 실행 경로:
  - 이벤트 트리거(출퇴근/작업기록 저장)
  - 매월 5일 이후 자동 스케줄러
  - 스케줄러는 DB advisory lock + `SchedulerRunHistory(jobKey, monthKey)`로 중복 실행 방지

## 오늘 반영 메모 (2026-02-23)

- 스타일 공정 기준 수량 `q` 기본값은 `1000`이다.
- `q`는 기준 표시값이며, PT/AT/ST 자체를 `q` 배수로 스케일하지 않는다. (시간값은 1개 작업 기준)
- 제조사 스타일 저장 API에 공정 중복 방어를 추가했다.
  - 대상: `POST /styles`, `PUT /styles/:styleId`, `POST /styles/import`
  - 기준: `code`(trim+upper) 우선, code가 없으면 `name`(trim+lower)
- 생산관리 용어를 `CT 조정 검토`에서 `배정 결과`로 정리했다. (메뉴/화면 타이틀)

## 오늘 반영 메모 (2026-02-24)

- 작업 배정 보드는 자동 저장을 제거하고 수동 저장으로 전환했다. 상단에 `저장됨/저장 안됨/저장 중` 상태를 표시한다.
- 저장되지 않은 변경이 있으면 화면 이탈 시 확인 경고를 띄운다. (`useBlocker`, `useBeforeUnload`)
- 미배정 카드는 주문 단위로 그룹화해 가로 배치하며, 그룹 헤더에 납기일을 표시하고 납기일 오름차순으로 정렬한다.
- 라인 목록은 LineAssignment 기준 실제 배정 인원으로 계산하며, 배정 인원 0명 라인은 작업 배정에서 제외한다.
- 작업 배정 우클릭 메뉴는 `업무 상세`, `수량 분할`로 통일했다.
- 운영팀의 변경 요청 대응 액션을 `요청 동의 / 다시 제안 / 배정 취소` 3가지로 분리했다.
- `다시 제안`은 제안 CT가 실제로 수정된 경우에만 활성화되고, 제안 CT를 수정한 상태에서는 `요청 동의`가 비활성화된다.
- 작업 계획 협의 화면에서 라인장(WORKER)은 본인이 관리하는 라인(`managedOnly`)만 조회한다.
- 작업 기록은 공장 선택 후 라인 선택이 필수이며, 선택한 작업일 기준으로 해당 라인 소속 작업자만 저장 가능하다.
- 작업 기록 저장은 CT 동의된 배정 카드 기준으로만 허용하고, 공정 수량은 비정상적으로 큰 값(기준 수량의 과도한 배수)을 제한한다.
- 탑바 빈 공간 클릭은 무반응이며, 현재 `BARO` 텍스트 버튼도 화면 전환 동작이 없다.
- 생산관리 비용 표기는 `동(VND)` 기준으로 표기한다.

## 오늘 반영 메모 (2026-02-25)

- 작업 배정/작업 계획 협의 확장 테이블은 `PT(q), AT(q), ST(q), 제안 CT(q), 요청 CT(q)`를 표시한다.
- 공간 문제로 확장 테이블의 `주문 공임`, `기간` 칼럼은 제거했다.
- `PT(q)`는 정확히 같은 q가 아니면 `ref q=...` 라벨로 fallback 사실을 노출한다.
- `AT(q)` 데이터가 없으면 `수집중`으로 표시한다.
- AT 학습에 비례배분 반복 수렴 루프, 방향성 가중치(`w_trend`), 월간 변경폭 clamp를 반영했다.
- 운영팀 제안 송부/합의는 `AssignmentPlan`만 갱신하며, 스타일 ST에는 역방향 기록하지 않는다.
- CT 저장 정책:
  - 제안 송부(`SENT`): `proposalSeconds` 저장, `contractedSeconds=null`
  - 요청 동의(`REJECTED -> AGREED`): `proposalSeconds`는 보존, `contractedSeconds`만 최종값으로 확정
- ST는 CT 합의 결과로 자동 갱신되지 않는다.
- CT는 카드 단위 스냅샷이므로 `ctVersion`, `ctUpdatedAt` 별도 필드/전용 UI를 두지 않는다.
- 서버 시작 시 DB 연결 재시도(`STARTUP_DB_MAX_RETRIES`, `STARTUP_DB_RETRY_DELAY_MS`)를 추가했다.
- CT 제안/합의는 `AssignmentPlan`에만 기록한다. `Style.processes[]` 또는 향후 `StyleProcessStandard`에 CT 결과를 역반영하지 않는다.
- 라인장 작업 계획 협의 화면의 `완료 처리` 기능(UI/클라이언트 로직)은 제거하고, 해당 화면은 CT 협의에만 집중한다.

## 문서 정합성 교정 우선본 (2026-02-23)

아래 항목은 기존 본문 서술과 충돌하더라도 **이 섹션을 우선 적용**한다.

### PayrollSnapshot 스키마 정합성
- 실제 스키마 기준 필드:
  - `month` (YYYY-MM)
  - `data` (JSON)
  - `lockedAt` (DateTime)
  - `lockedBy` (String)
- 문서에서 사용된 `yearMonth`, `isLocked` 표현은 레거시 표기로 간주한다.

### AssignmentPlan의 ctOverride 정합성
- `ctOverride`는 `AssignmentPlan` DB 컬럼이 아니다.
- 현재 `ctOverride`는 보드 상태 JSON(`AssignmentBoardState.assignments`) 병합 시점의 상태값이다.
- DB 영속 상태 판단은 `ctStatus + ctSource + contractedSeconds` 조합을 기준으로 한다.

### ST/AT 저장 정책 정합성
- `stManual=false` 공정은 AT 동기화 시 DB `ct`를 PT(`pt`)로 설정한다 (AT를 자동으로 ST에 반영하지 않음).
- `stManual=true` 공정은 수동 ST(`ct`)를 유지한다.
- AT 신뢰도가 충분해지면 운영자가 직접 ST를 수정한다.

### AT 학습 실행 정책 정합성
- 이벤트 트리거(출퇴근/작업기록 저장) + 자동 스케줄러 병행으로 동기화한다.
- 자동 스케줄러는 DB 락 + 월 실행 이력 기반으로 해당 학습월의 중복 실행을 제어한다.

## 공유 상태 색상 팔레트

생산계획 카드 상태 라벨, AT 신뢰도 칩 등 여러 곳에서 일관되게 사용하는 팔레트.
새 UI 컴포넌트에 상태 색상이 필요하면 이 팔레트를 재사용할 것.

| 상태 키  | 의미 | 배경(bg)    | 텍스트(text) | 테두리(border rgba)          |
|---------|------|------------|-------------|------------------------------|
| PENDING | 대기  | `#EBEBF0` | `#747484`   | `rgba(116, 116, 132, 0.35)` |
| SENT    | 제안  | `#BFEAD0` | `#268444`   | `rgba(38, 132, 68, 0.35)`   |
| AGREED  | 확정  | `#C8DFF7` | `#3674B4`   | `rgba(54, 116, 180, 0.4)`   |
| REJECTED| 요청  | `#F7DCC8` | `#AC6424`   | `rgba(172, 100, 36, 0.35)`  |

AT 신뢰도 팔레트 매핑(현재 코드 기준):
- COLLECTING → neutral gray (`#EBEBF0` / `#747484`)
- UNRELIABLE → red (`#F5D0D5` / `#B42318`)
- INSUFFICIENT → orange (`#F7DCC8` / `#AC6424`)
- USABLE → yellow (`#F5E7B2` / `#8A6100`)
- TRUSTED → green (`#BFEAD0` / `#268444`)
- VERIFIED → blue (`#C8DFF7` / `#3674B4`)

사용 파일:
- `frontend/src/pages/App/production/ProductionPlanBoard.jsx` — `AT_RELIABILITY_COLOR`
- `frontend/src/pages/App/assign/AssignBoard.jsx` — `AT_RELIABILITY_COLOR`
- `frontend/src/pages/App/style/StyleBoard.jsx` — `AT_RELIABILITY_PALETTE`
- `frontend/src/pages/App/style/styleDetail/StyleProcess.jsx` — `AT_RELIABILITY_PALETTE`

## 오늘 반영 메모 (2026-03-05)

- `formatSeconds`는 소수점 없이 정수로 표시한다 (`Math.round` 적용).
- **ST 자동 갱신 정책 변경**: `stManual=false` 공정은 AT 동기화 시 CT를 AT로 덮지 않고 PT 기준으로 유지한다. 운영자가 AT 신뢰도를 확인 후 직접 ST를 수정하는 수동 운영 방식으로 전환.
- **AT 신뢰도 배지 추가**:
  - 스타일 목록(`StyleBoard`): AT 값 오른쪽에 스타일 전체 공정의 집계 신뢰도 Chip 표시.
  - 스타일 상세(`StyleProcess`): AT(q) 컬럼 헤더 오른쪽에 동일 집계 신뢰도 Chip 표시.
  - 신뢰도 단계/색상 키: COLLECTING=default, UNRELIABLE=error, INSUFFICIENT=warning, USABLE=info, TRUSTED=success, VERIFIED=primary.
  - 스타일 신뢰도는 공정별로 계산한 뒤 공정별 AT 기여시간 가중 평균 퍼센트로 집계한다.
- AT 학습 기준월: 오늘(5일 이상)이면 전월 데이터 사용. 샘플 데이터가 현재월(3월)에 있으면 `POST /at-sync/run-now { trainingMonthKey: "YYYY-MM" }`으로 강제 학습 가능.


---

## 개발 환경 설정

### 새 환경에서 최초 셋팅 순서 (AI가 이 순서대로 진행)
1. `backend/.env` 파일 생성 (아래 내용 그대로)
2. `frontend/.env` 파일 생성 (아래 내용 그대로)
3. 의존성 설치: `npm install` (루트에서 실행 — frontend/backend 동시)
4. Prisma 클라이언트 생성: `cd backend && npx prisma generate`
5. 실행: 루트에서 `npm run dev`
   - `predev` 스크립트가 자동으로 `scripts/fix-prisma-client-entry.js` 실행 후 서버 시작

### 실행
```bash
npm run dev
```
프론트: http://localhost:5173 / 백엔드: http://localhost:4000

### Supabase 프로젝트
- 프로젝트명: `lineos`
- 프로젝트 ref: `mqohhiufmjnfuhxpfwkn`
- 리전: ap-northeast-2 (Seoul)
- 대시보드: https://supabase.com/dashboard/project/mqohhiufmjnfuhxpfwkn

### backend/.env
```
DATABASE_URL="postgresql://postgres.mqohhiufmjnfuhxpfwkn:DxAwGN7yXNhV0dqw@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.mqohhiufmjnfuhxpfwkn:DxAwGN7yXNhV0dqw@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"
PORT=4000
BUSINESS_TIME_ZONE=Asia/Seoul
WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER=3
```

### frontend/.env
```
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://mqohhiufmjnfuhxpfwkn.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_I5v2Y8rVxnX7VDm6-3Goog_nlViC8KX
```

### 코드 수정사항 (이미 적용됨, 새 환경에서 확인)
- `backend/src/index.ts:17` → `dotenv.config({ override: true });` (dotenv v17 필수)

### DB 비밀번호 재설정이 필요한 경우
Supabase 대시보드 → Project Settings → Infrastructure → Database password → Reset
재설정 후 `backend/.env`의 `DATABASE_URL` 비밀번호 부분과 이 문서의 `backend/.env` 섹션 동시 업데이트.

### 주의사항
- Transaction pooler 포트: **6543** (Session pooler: 5432)
- dotenv v17은 `override: true` 필수 (위 코드 수정사항 참고)
- DB 연결 실패 시 Windows DNS를 Cloudflare(1.1.1.1)로 변경 후 재시도

---

## 오늘 반영 메모 (2026-03-01)

### 작업 배정 보드 — 핵심 구조 변경

#### startDateKey 절대 날짜 추적
- 각 assignment는 `startDateKey: "YYYY-MM-DD"` 필드로 절대 날짜를 보관한다.
- viewStart 네비게이션 시 `oldBase + currentStartIndex`로 절대 날짜를 재계산하고 `newDays`에서 새 인덱스를 탐색한다.
- 뷰 범위 밖 카드는 음수/초과 인덱스를 가질 수 있으며 `assignmentsForRender` 필터(`0 <= startIndex < days.length`)로 제외된다.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`

#### 로드 시 손상된 startIndex 복구
- 이전 버그로 저장된 대형 startIndex(예: 200+) 보정 로직을 `loadSourceData` 내부에 추가했다.
- 복구 순서: `startDateKey`로 `restoreDays`에서 재매핑 → 실패 시 `[0, rdCount-1]` 클램핑.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx` (loadSourceData 함수 내 normalizedRestoredAssignments 처리 직후)

#### 드래그 드롭 타겟 감지 통일
- 인디케이터(`onDragMove`)와 실제 드롭(`onDragEnd`) 모두 **커서 위치 기준**으로 타겟을 탐색한다.
- 기존: `onDragEnd`는 dnd-kit `event.over` (rect intersection)으로 타겟 결정 → 인디케이터와 불일치 버그.
- 수정: `assign-drop-{id}` 위에 드롭 시 `detectedAssignment.startIndex + Math.floor(relPos * spanDays)`로 커서의 절대 날짜를 계산 후 `getTargetOnDay`로 실제 타겟 재탐색.
- `dropBeforeTarget`는 `dayIndex < (targetOnDay.startIndex + targetOnDay.endIndex + 1) / 2`로 판단.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx` (handleDragEnd, assign-drop 분기)

#### ScheduleTimeline z-index 스택
| 레이어 | zIndex |
|---|---|
| DropCell (배경 셀) | 0 |
| AssignBar (일반) | 20 |
| AssignBar (연결 가능, showLinkPrev=true) | appBar+3 = 1103 |
| 커서 컬럼 하이라이트 오버레이 | 1104 |
| 삽입 인디케이터 (세로선) | 1200 |
- 하이라이트와 인디케이터는 카드 위에 표시되어야 하므로 1103 이상의 zIndex가 필요하다.
- 파일: `frontend/src/pages/App/assign/components/ScheduleTimeline.jsx`

### CT 전송 성능 개선

#### PATCH /assignment-board-state/ct (신규 경량 엔드포인트)
- 요청: `{ assignmentId, assignmentPatch, cardId?, cardPatch? }` — 변경된 필드만 전송
- 처리: 기존 상태 읽기 → 해당 항목만 패치 → 전체 상태 쓰기 → 변경 plan 1건만 동기화
- 응답: `{ ok, assignment, card, updatedAt, serverNow }` — 변경된 항목만 반환
- 기존 PUT 대비 DB 쿼리 8+ → 5개로 감소, 인증 조회 2건 제거
- 파일: `backend/src/index.ts`

#### 프론트 CT 액션 경량화
| 액션 | 이전 | 이후 |
|---|---|---|
| 제안 송부 (SENT), reflow 없음 | PUT 전체 payload | PATCH 경량 |
| 제안 송부 (SENT), reflow 있음 | PUT 전체 payload | PUT fallback 유지 |
| 요청 동의 (AGREED) | PUT 전체 payload | PATCH 경량 (항상) |
| 배정 취소 | PUT 전체 payload | DELETE 경량 (`/assignment-board-state/assignment/:assignmentId`) |
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx` (`handleSendProposalToLineLeader`, `handleAgreeLineRequest`, `handleCancelAssignmentFromLineRequest`)

#### updatePlanRows 병렬화
- 기존: `for...of` 순차 `await prisma.assignmentPlan.update(...)` → N번 DB 왕복
- 수정: `Promise.all(updatePlanRows.map(...))` 병렬 실행
- 파일: `backend/src/index.ts` (PUT /assignment-board-state 핸들러 내부)

### 상태 토글 경량화 원칙 (2026-03-06)
- 완료/미완료 같은 **단순 상태 토글**은 기본적으로 `단건 mutation + 해당 row 로컬 상태 반영`으로 처리한다.
- 상태 토글 직후 **전체 보드 재조회**(`refreshBoardState`)와 **전체 진행률 재집계**(all assignment `groupBy`)는 기본 금지한다.
- 진행률/파생값 동기화가 필요하면 **해당 assignment 1건만** 재조회한다.
- 전역 로딩 오버레이는 긴 네트워크 작업에서만 사용하고, 단건 토글 요청에는 버튼 단위 busy 표시를 우선한다.
- 위 원칙을 벗어나는 구현은 요구사항(정합성/감사/통계) 근거를 코드 주석 또는 PR 설명에 명시해야 한다.

## 오늘 반영 메모 (2026-03-02)

### AssignmentBoardState 동시 수정 충돌 방지
- 보드 assignment는 `version`, `versionUpdatedAt`를 가진다.
- 전체 저장(`PUT /assignment-board-state`)과 CT 부분 저장(`PATCH /assignment-board-state/ct`) 모두 assignment별 optimistic concurrency를 사용한다.
- stale payload로 저장하면 서버가 `409 assignment version conflict`를 반환하고, 프론트는 사용자에게 새로고침/최신 상태 반영 메시지를 보여준다.
- 파일: `backend/src/index.ts`, `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/production/ProductionPlanBoard.jsx`

### SENT 48시간 초과 자동 에스컬레이션
- `ctStatus='SENT'`이고 `ctSentAt` 기준 48시간이 지나면 서버가 자동으로 `ctEscalatedAt`, `ctEscalationReason='SENT_TIMEOUT_48H'`, `ctEscalationTargetRole='ADMIN'`, `ctEscalationStatus='OPEN'`을 부여한다.
- 이 처리는 `GET /assignment-board-state`, `PATCH /assignment-board-state/ct`, `PUT /assignment-board-state` 경로에서 공통으로 반영된다.
- 작업 배정 상세 패널에는 "48시간 초과 관리자 검토" 경고가 표시된다.
- 파일: `backend/src/index.ts`, `frontend/src/pages/App/assign/AssignBoard.jsx`

### 확정 배정 재협의 개시
- `AGREED` 상태 배정은 관리자만 `재협의 개시`할 수 있다.
- 재협의 개시 시 `ctStatus='PENDING'`, `ctSource='REOPENED_BY_ADMIN'`으로 되돌리고, 기존 합의 정보는 카드의 `ctAgreementHistory`에 아카이브한다.
- 서버 `PUT /assignment-board-state`도 `AGREED -> 비AGREED` 전환을 관리자만 허용한다.
- 현재 경량 `DELETE /assignment-board-state/assignment/:assignmentId` 경로에는 상태별 권한 검증이 없어, UI는 `REJECTED` 검토 흐름에서만 이 엔드포인트를 사용한다.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `backend/src/index.ts`

### 작업 배정 보드 편집 규칙 보정
- `SENT`/`AGREED`는 분할/병합/초기화에서는 잠금이지만, 드래그는 완전 잠금이 아니다.
- `AGREED`는 다른 라인 이동과 보드 밖 제거만 막고, 같은 라인 내 날짜 이동은 현재 허용된다.
- `SENT`는 현재 코드상 타임라인 이동과 보드 밖 제거가 가능하다.
- `초기화` 버튼은 전체 배정을 비우지 않고 `SENT`/`AGREED`만 남긴다.
- 보드 상단에 `되돌리기 / 다시하기 / 초기화`가 있으며 undo/redo는 로컬 30단계 히스토리다.
- **REJECTED 카드는 자동 리플로우에서 위치 고정**: 변경 요청 진행 중인 카드(ctStatus='REJECTED')를 리플로우 시 밀어내지 않기 위해 `reflowAssignmentsByLineCapacity`에서 `isPositionFixed` 조건으로 큐에서 제외한다. 드래그는 여전히 가능하다.
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`

### 드래그앤드롭 성능 최적화
- `PointerSensor`에 `activationConstraint: { distance: 5 }` 설정 — 5px 이상 이동해야 드래그 시작 (불필요한 드래그 이벤트 제거)
- 드래그 중 하이라이트 + 프리뷰 상태를 `dragState = { hoveredTarget, dragPreview }` 하나로 통합 — 매 프레임 렌더 2회 → 1회
- 드래그 카드 너비(`ghostWidthPx`)를 `onDragStart`에서 1회만 계산 후 ref에 캐시 (`ghostWidthPxRef`) — onDragMove 내 O(n) 배열 탐색 제거
- `AssignBar`의 `setNodeRef`를 `useCallback`으로 감싸 드래그 중 불필요한 ref 재등록 방지
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/assign/components/ScheduleTimeline.jsx`, `frontend/src/pages/App/assign/components/AssignBar.jsx`

### ProductionPlanBoard DELTA 카드 처리
- DELTA 카드는 생산계획/작업 계획 협의 보드에서만 처리한다.
- `PLUS` DELTA는 새 라인에 직접 배정하거나, 동일 고객사/스타일(or styleId)/색상/성별의 기존 미완료 배정에 흡수할 수 있다.
- `MINUS` DELTA는 동일 조건의 기존 미완료 배정에서 수량을 차감한다. 차감 결과 수량이 `0`이면 해당 배정은 삭제된다.
- 수주 수량 변경 후 보드 재구성 시 **같은 주문의 DELTA 카드만** 함께 정리한다.
- 파일: `frontend/src/pages/App/production/ProductionPlanBoard.jsx`, `frontend/src/utils/quantityChangeBoard.mjs`, `frontend/src/pages/App/order/OrderList.jsx`

## 오늘 반영 메모 (2026-03-03)

### WorkOrder.items JSON → WorkOrderItem 테이블 분리 (FK 연결)

#### 배경
- 기존 `WorkOrder.items`는 `Json?` 필드로 색상/스타일/수량 데이터를 저장해 `AttrColor`와 실질적 FK 관계가 없었다.
- 색상 코드/이름을 수정해도 기존 주문 데이터에 반영되지 않아 일관성 문제 발생했다.
- `WorkRecord`도 `colorId`, `processCode`를 단순 값으로 저장해 동일한 문제.

#### 변경 내용

**DB/스키마**
- `WorkOrderItem` 테이블 신규 생성: `workOrderId` → `WorkOrder` FK (onDelete: Cascade), `colorId` → `AttrColor` FK (onDelete: SetNull)
- `WorkOrder.items Json?` 컬럼은 하위호환을 위해 유지 (향후 별도 마이그레이션으로 DROP 예정)
- `WorkRecord`에 `processId Int?` 컬럼 추가: `AttrProcess` FK (onDelete: SetNull)
- `WorkRecord.colorId` → `AttrColor` FK 추가 (onDelete: SetNull), 고아 colorId는 NULL 처리 후 FK 적용
- 마이그레이션: `backend/prisma/migrations/20260303000000_work_order_item_fks/migration.sql` (STEP 1-5)
  - STEP 2: 기존 `WorkOrder.items` JSON → `WorkOrderItem` 행으로 데이터 이전 (PL/pgSQL)
  - STEP 4: `processCode` → `AttrProcess` 조회해 `processId` 초기값 채우기
- 마이그레이션은 `prisma migrate` CLI 미사용(DIRECT_URL 미설정) → Node.js `$executeRawUnsafe` 스크립트로 실행

**백엔드 (index.ts)**
- `workOrderItemToItemShape(row)` 헬퍼: `WorkOrderItem` 행 → 기존 `items` 배열 원소 형태로 변환 (프론트 호환)
- `toOrderResponse`: `order.workOrderItems`가 있으면 우선 사용, 없으면 `order.items` JSON 폴백
- `GET /orders`: `include: { workOrderItems: { orderBy: { sortOrder: 'asc' } } }` 추가
- `POST /orders` (`createOrReuseSharedOrder`): WorkOrder 생성 후 `workOrderItem.createMany()` 병렬 저장
- `PUT /orders/:orderId`: 트랜잭션 내에서 `workOrderItem.deleteMany()` + `createMany()` 전체 교체
- `POST /orders`, `PUT /orders/:orderId`, `DELETE /orders/:orderId` 후 관련 조직의 `AssignmentCard`를 즉시 재생성
- `POST /styles`, `PUT /styles/:styleId`, `POST /styles/import` 후 관련 조직의 `AssignmentCard`를 즉시 재생성
- `GET /assignment-cards`: `AssignmentCard` 테이블만 조회
- `loadAssignmentDisplayReferenceMaps`, `buildAssignmentCardsFromOrders`: `workOrderItems` 우선 사용
- `DELETE /styles/:styleId`: `WorkOrder.items` JSON 순회 → `WorkOrderItem.findFirst({ where: { styleId } })` 쿼리로 교체
- `POST/PUT /work-logs`: `processCode` 목록으로 `AttrProcess` 일괄 조회 → `processId` Map 생성 → `WorkRecord.createMany` 시 `processId` 자동 채우기

**속성 관리 (AttrBoard.jsx)**
- 각 섹션 카드를 `code` 오름차순으로 정렬해 표시
- `TableContainer` `maxHeight: 374` + `overflow: 'auto'` + `stickyHeader`로 10개 내외 스크롤 뷰 적용

**DEFAULT_ATTRIBUTES 초기화 방지**
- `backend/src/index.ts`의 `DEFAULT_ATTRIBUTES.colors`를 빈 배열 `[]`로 변경 → `GET /attributes` 시 색상 재시드 방지
- 색상은 더 이상 조직별 기본값이 아니라 DB 공통 마스터(`AttrColor`)로만 관리

## 오늘 반영 메모 (2026-03-04)

### 성능 개선 — 로딩 속도 3개 이슈 수정

#### 이슈 1: assignment repair 쿼리 사전 체크
- `assignmentPlanNeedsDisplayRepair(plan)` 헬퍼 추가: orderNo/customer/label/colorName 중 하나라도 비거나 corruption regex(`\?{2,}|<U+FFFD>`) 매칭 시 true 반환
- `/assignment-plans` GET, `/assignment-board-state` GET 두 곳에서 `plans.some(assignmentPlanNeedsDisplayRepair)` 조건 추가
- 효과: display 필드가 이미 정상이면 `loadAssignmentDisplayReferenceMaps`(workOrder + style 전체 조회 2개) 완전 스킵
- 파일: `backend/src/index.ts`

#### 이슈 2: AssignBoard 상호작용 리렌더링 최적화
- `ScheduleTimeline`에 `memo()` 추가 — activeDrag/searchTerm/contextMenuState 등 무관 state 변경 시 타임라인 리렌더링 차단
- `handleDragEnd` (5300줄 근처)에 `useCallback` 누락 보완 → DndContext에 안정적 참조 전달
- `handleLinkPrev`에 `useCallback` 누락 보완 → ScheduleTimeline의 memo 효과를 살림
- `useAssignBoardDnd` 훅 분리 (`sensors`, `handleDragStart`, `handleDragCancel`) — cardsRef/assignmentsRef 사용으로 컴포넌트 최상단에서 호출 가능
- 파일: `frontend/src/pages/App/assign/AssignBoard.jsx`, `frontend/src/pages/App/assign/components/ScheduleTimeline.jsx`, `frontend/src/pages/App/assign/hooks/useAssignBoardDnd.js`

#### 이슈 3: GET 캐시 선택적 무효화
- `CACHE_INVALIDATION_MAP`: mutation 경로별 무효화할 GET 캐시 prefix 목록 정의
- `invalidateCacheByPath(mutationPath)`: 매핑된 prefix만 삭제, 매핑 없는 경로는 기존처럼 전체 삭제(fallback)
- POST/PUT/DELETE 시 `getResponseCache.clear()` → `invalidateCacheByPath(path)` 교체
- 효과: 보드 저장(PUT /assignment-board-state) 후 /factories, /lines, /line-workers 등 무관 캐시 유지
- 파일: `frontend/src/utils/apiClient.js`

## 오늘 반영 메모 (2026-03-10)

### 작업 카드 저장 구조 단순화
- `AssignmentCard` 테이블을 추가해 미배정 카드의 소스 오브 트루스를 JSON이 아닌 테이블로 분리했다.
- `PUT /assignment-board-state`, `PATCH /assignment-board-state/ct`, `DELETE /assignment-board-state/assignment/:assignmentId`는 카드 변경분을 `AssignmentCard`에 동기화한다.
- `GET /assignment-board-view`, `GET /assignment-board-state`, `GET /assignment-plans`는 카드 조회 시 `AssignmentCard`를 사용한다.
- `GET /assignment-cards`는 조회만 수행한다. 카드 재생성은 주문/스타일/색상 변경 시점에 즉시 실행한다.
- `AssignmentBoardState.cards`는 더 이상 읽기 소스로 사용하지 않는다. 레거시 컬럼으로만 남겨둔다.

### 공통 색상 마스터
- `AttrColor`는 조직별 속성이 아니라 전 조직이 함께 쓰는 공통 마스터다.
- `/attributes`의 `colors`는 조직 구분 없이 동일한 목록을 반환한다.
- 색상 수정 시 `WorkOrderItem.colorCode`, `WorkRecord.colorCode`, `AssignmentCard`를 같이 맞춘다.

### 직원 관리 규칙 정리

#### 권한/직무/급여타입 정책
- `관리자(ADMIN)`, `운영자(OPERATOR)`, `회계사(ACCOUNTANT)`는 권한명 자체를 직무로 간주한다.
- 비작업자 3종은 별도 작업자 직무를 선택하지 않는다.
- 작업자(`WORKER`)만 작업자 직무(`재단/봉제/다림/검수/포장/기타`)를 선택한다.
- 기본 급여타입은 `봉제(WORKER_SEWING)=CT`, 그 외 전부 `FIXED`다.
- 직원 관리 화면의 급여 타입은 `기본값 사용` 옵션을 제거하고 항상 명시값(`CT`/`FIXED`)으로 저장한다.
- 기존 직원 데이터도 전부 명시값으로 DB 백필했다. 현재 로컬 기준 `null payType = 0건`.

#### 공장 권한/필터 정책
- 운영자는 본인 소속 공장 직원만 수정 가능하다.
- 관리자는 전체 공장 또는 특정 공장 필터로 조회/수정 가능하다.
- 직원 관리 화면의 공장 필터는 페이지 상단 우측이 아니라 **직원 목록 카드 제목 줄 우측**으로 이동했다.
- 카드 제목 우측에 따로 표시되던 선택 공장명 텍스트는 제거했다. 필터 UI 하나만 남긴다.

#### 구현 메모
- 서버에서 비작업자 `roleId`는 비우고, 작업자만 유효 작업자 직무를 유지한다.
- 작업자 직무가 비어 있거나 잘못 연결된 경우 기본값은 `WORKER_SEWING`으로 보정한다.
- `/attributes`의 `roles` 응답은 현재 작업자 직무 하드코딩 목록만 내려준다.

## 오늘 반영 메모 (2026-03-05)

### 급여 계산 1차 구현

#### 화면/동작
- 급여 계산 화면을 1차 실사용 형태로 확장했다.
- 메인 표는 `직원 / 급여 구분 / 기준 급여 / 보너스 / 공제 / 최종 급여 / 상세` 구조다.
- `FIXED` 직원은 기준 급여를 수동 입력한다.
- `CT` 직원은 서버 계산값을 기준 급여로 사용한다.
- 모든 직원은 `보너스`, `공제`를 입력할 수 있고 최종 급여는 `기준 급여 + 보너스 - 공제`로 계산한다.
- 확정 상태에서는 입력이 잠기고, 관리자만 `확정 취소`를 할 수 있다.
- 공정 상세는 `공정 / 수량 / 총 CT초 / 적용 평균단가 / 급여`를 표시한다.
- 파일: `frontend/src/pages/App/payroll/PayrollEntry.jsx`, `frontend/src/pages/App/payroll/PayrollBoard.jsx`

#### 백엔드 응답/스냅샷
- `GET /payroll`은 작업기록이 없는 `FIXED` 직원도 응답에 포함한다.
- 비작업자(`관리자/운영자/회계사`)도 급여 화면에서 직무명이 비지 않도록 권한명 기반 직무 라벨을 같이 내려준다.
- 응답 employee 항목은 다음 필드를 포함한다.
  - `employeeKey`
  - `baseEarnings`
  - `fixedSalary`
  - `bonus`
  - `deduction`
  - `finalEarnings`
  - `bankName`
  - `bankAccountNumber`
- 공정 상세 항목은 `totalCtSeconds`, `wagePerSecond`, `totalEarnings`를 포함한다.
- `POST /payroll/lock`은 위 구조를 정규화해서 스냅샷 JSON으로 저장한다.
- `DELETE /payroll/snapshots/:month`를 추가해 확정 취소를 지원한다. 권한은 `ADMIN`만 허용한다.
- 파일: `backend/src/index.ts`(기존 구현), 이후 `backend/src/payroll/*`로 분리 시작

#### 검증 메모
- `backend` 빌드 통과
- `frontend` 빌드 통과
- HTTP smoke test:
  - `GET /payroll?orgId=2&month=2026-03` → `200`, 직원 `43명`, `FIXED 3명` 포함 확인
  - `POST /payroll/lock`
  - `GET /payroll`
  - `DELETE /payroll/snapshots/:month`
  순서로 확정/재조회/취소 정상 확인

### 급여 계산 메뉴 접근 권한 수정
- 운영자(`OPERATOR`)도 `회계 관리 > 급여 계산` 메뉴를 볼 수 있도록 프론트 접근 제어를 수정했다.
- 기존에는 `ADMIN`, `ACCOUNTANT`만 허용되어 운영자 로그인 시 메뉴가 숨겨졌다.
- 수정 후 `PAYROLL` feature 접근 권한은 `ADMIN`, `OPERATOR`, `ACCOUNTANT`다.
- 파일: `frontend/src/utils/accessControl.js`

### 백엔드 구조 정리 시작

#### 이번에 실제로 분리한 모듈
- Prisma 싱글톤 분리
  - `backend/src/db.ts`
- env 초기화 분리
  - `backend/src/config/env.ts`
- 공용 헬퍼 분리
  - `backend/src/utils/common.ts`
  - `backend/src/utils/http.ts`
- 공통 접근/권한 해석 분리
  - `backend/src/middleware/access.ts`
- 직원 급여 타입/권한 라벨 공용 로직 분리
  - `backend/src/employees/employeeCompensation.ts`
- WorkRecord 공용 include/이름 해석 분리
  - `backend/src/work-records/workRecord.shared.ts`
- 급여 도메인 분리
  - `backend/src/payroll/payroll.routes.ts`
  - `backend/src/payroll/payroll.controller.ts`
  - `backend/src/payroll/payroll.service.ts`
- `backend/src/index.ts`는 위 모듈을 import하고 `payrollRouter`를 mount하는 형태로 정리했다.

#### 백엔드 개발 시 참고할 구조 원칙
- 방향은 **고전 MVC 전체 강제**가 아니라 **feature-based modular monolith**로 간다.
- 기본 원칙은 **fat service, thin controller**다.
  - `routes`: URL 연결만 담당
  - `controller`: `req/res` 변환, status code, 입력 파싱
  - `service`: 실제 비즈니스 규칙과 흐름
- `index.ts`는 최종적으로 **서버 bootstrap + route mount + 전역 에러 처리**만 남기는 방향으로 줄인다.
- Prisma는 파일마다 새로 만들지 않고 `db.ts`의 singleton만 사용한다.
- `utils`에는 **여러 도메인이 같이 쓰는 진짜 공용 함수만** 둔다.
  - 예: 문자열/숫자 정규화, 공통 HTTP 에러 유틸
- 특정 도메인 규칙은 공용으로 빼지 않고 **그 도메인 service 또는 shared 파일**에 둔다.
  - 예: payroll snapshot 정규화, employee role/payType 보정
- `middleware`에는 인증/권한/조직 접근 해석처럼 HTTP 입구 공통 로직을 둔다.
- `repository` 계층은 지금 필수는 아니다.
  - Prisma 쿼리가 과도하게 복잡해질 때만 선택적으로 도입한다.

#### 백엔드 리팩터링 순서 기준
1. `db.ts`
2. 공용 `utils`
3. 공통 `middleware`
4. 기능 단위 모듈 분리 (`payroll`부터 시작)
5. 같은 패턴으로 `employee`, `organization/subscription`, `order`, `work-log`, `assignment` 확장

#### 주의사항
- 공용 분리 과정에서 **domain-specific helper를 무리하게 utils로 올리지 않는다.**
- 현재는 `payroll`만 먼저 패턴을 확정한 상태다.
- 다음 분리 후보는 `employee` 도메인이다.

### 초기화 스크립트 운영 규칙 (2026-03-05)

#### 단일 진입점
- 초기화 스크립트는 무조건 `backend/scripts/reset-to-baseline.js` 하나만 사용한다. 분할 스크립트 추가 금지.
- 테스트 계정 기본 데이터 초기화도 동일하게 `backend/scripts/reset-to-baseline.js` 하나만 유지한다.
- 테스트 계정 전용 seed/reset/bootstrap 스크립트는 새로 만들지 않는다.
- 샘플 주문 생성과 샘플 작업기록 생성도 별도 파일을 만들지 않고 `backend/scripts/reset-to-baseline.js`의 서브커맨드로만 처리한다.
- 테스트 baseline은 계정/조직/라인/스타일/공통 색상까지만 재구성하고, 주문/작업 배정 더미 데이터는 재생성하지 않는다.
- 분리돼 있던 테스트 계정 전용 스크립트 `backend/scripts/seed-test-accounts.js`는 제거되었다.
- 실행 커맨드:
  - 루트 초기화: `npm run initialize` -> 내부적으로 `node backend/scripts/reset-to-baseline.js initialize`
  - 루트: `npm run reset:baseline`
  - 루트 샘플 주문: `npm run sample:orders` -> 내부적으로 `node backend/scripts/reset-to-baseline.js orders`
  - 루트 샘플 작업기록: `npm run sample:work-logs` -> 내부적으로 `node backend/scripts/reset-to-baseline.js work-logs`
  - 루트 시간모델 정렬: `npm run realign:time-model` -> 내부적으로 `node backend/scripts/reset-to-baseline.js time-model`
  - 백엔드: `npm run reset:baseline` (`prereset:baseline`에서 `prisma:prepare-client` 자동 실행)
- `reset-to-baseline.js initialize`는 baseline reset 안에서 스타일 마스터 재생성, 고정 배정 스냅샷 복원, 샘플 작업기록/근태 재생성까지 같이 수행한다.
- 별도 실행 파일 `backend/scripts/realign-time-model.js`는 제거되었고, 보정 로직은 `reset-to-baseline.js` 내부로 흡수되었다.
- 샘플 초기화 정리 규칙:
  - 레거시 `샘플 공장`/`샘플 라인`은 정리 대상이다.
  - 초기화 후 샘플 제조사 쪽 공장/라인은 `Sample Factory` / `Sample Line` 한 벌만 남기는 것을 기준으로 본다.

#### 작업기록 재생성 원칙
- baseline reset은 샘플 범위의 `WorkLog`, `WorkRecord`, `AttendanceEntry`를 삭제한 뒤 다시 생성한다.
- 따라서 reset 이후 작업기록 기반 검증값(AT/급여/이력)은 **재현 가능한 샘플 데이터로 다시 맞춰진 상태**가 정상 동작이다.

#### 운영 주의사항
- Prisma 마이그레이션 이후에는 반드시 Prisma Client 재생성 상태를 확인한다.
- 권장 커맨드: `npm --prefix backend run prisma:prepare-client` (또는 `npm run reset:baseline` 실행 시 자동 처리)
- 스키마와 생성된 클라이언트가 불일치하면 배정/주문 조회 API에서 컬럼 불일치 오류가 발생할 수 있다.

### 재고 관리 개발 계획 (초안, 2026-03-05)

#### 범위 (확정)
- 운영자가 고객사 입고 수량을 실측 입력한다.
- 라인/작업 단위 불출 수량을 기록하고, 완성품 수량 및 재고 변동과 비교 검토한다.
- BOM 기준 예상 소모량(`완성품 수량 × BOM 소요`)과 실제 재고 변동량을 비교한다.
- 공장 간 이동(송신/수신) 기록을 지원하며, 송신-수신 수량 불일치 시 경고/사유를 남긴다.
- 재고 화면에서 품목 검색 결과가 없으면 화면 이동 없이 즉시 신규 품목 등록 후 바로 입력한다.

#### 핵심 모델링 원칙 (FK 우선)
- 모든 재고 변동 레코드는 반드시 `itemId(FK)`를 가진다.  
  - 자유 텍스트 품목명만으로 거래를 저장하지 않는다.
- 품목은 `품목 마스터(제품 공통)`와 `재고 SKU(변형)`를 분리해 관리한다.
  - 품목 마스터: `카테고리 + 품목명 + 규격 + 기본단위` (예: `원단 YS-001`)
  - 재고 SKU(변형): `itemMasterId + 색상(옵션)` 단위
  - 원단처럼 색상별 재고 추적이 필요한 경우 `같은 제품 + 색상별 SKU`로 분리한다.
  - 색상이 없는 부자재는 `색상 NULL(또는 NO_COLOR)` 단일 SKU로 운영한다.
  - 상위 분류(종류)는 검색/집계를 위한 분류값으로 유지한다.
- 삭제 정책은 `RESTRICT + soft delete`를 우선한다.
  - 거래가 있는 품목은 물리 삭제하지 않고 비활성 처리한다.
- 중복 방지를 위해 정규화 키(unique 후보)를 둔다.
  - 예:
    - 마스터 unique: `(orgId, categoryId, normalizedName, normalizedSpec, unitId)`
    - SKU unique: `(itemMasterId, colorId)` (`colorId` nullable 처리 포함)

#### 공장 간 이동 설계 (고객 이동 로직 재사용 전제)
- `TransferHeader` + `TransferLine` 구조로 송신/수신을 분리 기록한다.
  - `fromOrgId`, `toOrgId`, `status(SENT/RECEIVED/MISMATCH/CONFIRMED)` 관리
  - line별 `sentQty`, `receivedQty`, `deltaQty`, `deltaReason`
- 수신 등록 시 line 단위로 자동 비교하고 불일치 건을 즉시 표시한다.
- 전송 엔진은 상대 타입(`FACTORY`, `CUSTOMER`, 향후 `LINE`) 확장 가능 구조로 만든다.
  - 고객 반출/반입 시 같은 비교/사유 로직을 재사용한다.

#### 재고 화면 UX 정책 (간단/실무형)
- 단일 검색 입력에서 `종류 + 품목명 + 코드 + 규격 + 색상` 통합 검색을 지원한다.
  - 부분일치/토큰일치: `원단 YS`, `스냅 10`, `지퍼 블랙` 형태 모두 매칭.
- 검색 결과가 없으면 같은 위치에서 `빠른 품목 등록` UI를 연다.
  - 최소 필수값만 입력: `종류(선택/입력)`, `품목명`, `단위`, `규격/색상(선택)`
  - 저장 즉시 해당 품목을 현재 입력행에 자동 선택한다.
- 빠른 등록 시 유사 품목 후보를 먼저 보여 중복 생성을 줄인다.

#### BOM 비교/검토 정책
- `예상 소모량 = 확정 완성품 수량 × BOM 기준 소요량`으로 계산한다.
- 실제 소모량은 기간/작업단위의 재고 변동 ledger 합으로 산출한다.
- 현재는 “작업 완료” 도메인이 없으므로, 1차에서는 검토 화면에 **UI 상태값**만 둔다.
  - 예: `검토대상 선택`, `검토완료(임시)` 버튼/배지 (백엔드 완료 의미는 추후)
- 차이 발생 시 운영자 사유 입력을 필수화한다.

#### 단계별 개발 순서
1. 원부자재 마스터 + 통합 검색 + 재고화면 내 빠른 품목 등록
2. 고객 입고 기록(실측 입력) + 입고 원장
3. 공장 간 이동(송신/수신) + 수량 불일치 경고/사유
4. 라인 불출 기록 + 완성품 수량 입력(기초)
5. BOM 예상소모 vs 실제변동 비교 화면(UI 우선, 완료개념 임시)
6. 차이 사유 확정/이력 + 고객 이동 로직 재사용 확장

#### 구현 시 주의사항
- 거래 테이블에 품목명/색상명을 직접 기준값으로 쓰지 말고 FK 기준으로 저장한다.
- 화면 표시를 위한 문자열 스냅샷은 별도 컬럼으로 허용하되, 계산/조회 기준은 FK로 고정한다.
- 품목 즉시 등록 플로우에서도 최종 저장은 반드시 `itemId`를 받은 뒤 거래 저장을 진행한다.

#### 진행 현황 (2026-03-05)
- 1차 UI 반영 완료 (프론트엔드):
  - 신규 경로: `/inventory`
  - 메뉴 연동: 생산 관리 > 재고 관리
  - 권한 연동: `FEATURE_KEYS.INVENTORY` (제조사 `ADMIN/OPERATOR` 접근)
  - 화면 구성(UI-only):
    - 통합 품목 검색(토큰 부분일치)
    - 검색 실패 시 같은 화면에서 품목 빠른 등록
    - 입고/불출 입력 패널 + 샘플 원장
    - 공장간 이동(송신/수신) 입력 + 불일치 표시
    - BOM 예상소모 vs 실제변동 비교/사유/검토상태
- 아직 미구현(백엔드):
  - 재고/이동/BOM 비교 데이터 영속화 API
  - 작업 완료 도메인 연계 및 확정 로직
  - 고객 이동 로직 재사용 전송 엔진

### AT 신뢰도 정책 업데이트 (2026-03-05)

- 화면 일관성:
  - AT 신뢰도 분류는 주문/카드 수량(`displayOrderQuantity`)이 아니라 공정의 `timeRefQuantity` 기준으로 계산한다.
  - 같은 공정/같은 `atParams`는 화면(스타일/생산계획/배정)과 관계없이 같은 신뢰도 상태를 가져야 한다.
  - 단, 스타일 목록의 `PT/ST/AT` 숫자 표시는 신뢰도 계산 기준과 별개로 항상 `q=1000` 기준 개당 시간으로 보여준다.

- LOW_SENSITIVITY 관련 메모:
  - 현재 코드에서 `LOW_SENSITIVITY`는 별도 상태명이 아니라 퍼센트 계산용 penalty 개념이다.
  - `b <= 0`일 때는 LOW_SENSITIVITY penalty를 적용하지 않는다.
  - `b > 0`이면서 `setupShare < threshold`인 경우에만 LOW_SENSITIVITY penalty를 적용한다.

- 버전 증가 규칙:
  - `atParams.version`은 `a,b`가 실제로 변할 때만 증가한다.
  - `trainedPeriod`/품질 메타만 변경된 경우에는 version을 유지한다.

- 출퇴근 폴백 반영:
  - 학습 시 공정별 출퇴근 커버리지(`attendanceCoverage`)와 폴백 비율(`attendanceFallbackShare`)을 `atParams`에 기록한다.
  - 프론트 신뢰도 퍼센트는 폴백 비율 패널티를 반영한다.

- 스타일 단위 집계:
  - 스타일 신뢰도는 공정 최소값(min) 대신 공정별 AT 기여시간 가중 평균 퍼센트로 집계한다.
  - 집계 퍼센트로 상태(`COLLECTING/UNRELIABLE/INSUFFICIENT/USABLE/TRUSTED/VERIFIED`)를 매핑한다.
