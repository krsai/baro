# 화면 공통 구조 전수 조사

## 공통 기준

- 상단 1행: 좌측 페이지 제목, 우측 주요 생성·저장·잠금·삭제 작업
- 상단 2행: 검색은 왼쪽, 업무 필터와 기간 선택은 오른쪽에 배치한다. 오른쪽 내부 순서는 일반 필터, 시작/종료 기간, `M+`·`M-`이며 날짜 필터가 항상 맨 오른쪽이다.
- 헤더와 본문 사이: 공통 구분선
- 본문: 표, 카드, 입력 섹션
- 공통 페이지 여백 16px, 헤더 내부 간격 16px, 본문 간격 16px
- 페이지 제목 `h5` 20px/700, 본문 14px, 입력 13px
- 검색 입력 기본 너비 320px 이하, 검색어 지우기 버튼 제공

## 라우트별 화면 목록

### 공통·운영

- `/dashboard` 대시보드
- `/profile` 내 프로필
- `/business` 사업체 목록·상세
- `/employee` 직원 목록·상세 입력
- `/permission` 권한
- `/holiday` 휴일

### 영업

- `/customer` 고객 목록
- `/customer/new`, `/customer/:customerId` 고객 등록·상세
- `/customer-pricing` 단가
- `/order` 주문 목록
- `/order/:orderId` 주문 상세
- `/style` 스타일 목록
- `/style/new`, `/style/:styleId` 스타일 등록·상세

### 생산

- `/line` 라인 관리
- `/assignment`, `/assignment/:assignmentId` 배정 목록·상세
- `/work-history`, `/work-history/:workLogId`, `/work-history/new` 작업기록 목록·상세·등록
- `/production-analysis` 생산분석 목록
- `/production-analysis/:monthKey/:factoryId/:workerId` 생산분석 상세
- `/attendance`, `/attendance/new`, `/attendance/:factoryId/:workDate` 출퇴근 목록·등록·상세
- `/production-plan` 생산계획
- `/st-review` ST 검토
- `/shipment-review` 출고수량 검토
- `/qc-review` QC 검토

### 회계

- `/payroll`, `/payroll/:payrollId` 생산수당 목록·상세
- `/revenue-forecast` 매출 예상
- `/revenue-analysis` 매출 분석

### 재고

- `/inventory/stock` 재고 현황
- `/inventory/movements`, `/inventory/movements/new` 재고 거래 목록·등록
- `/inventory/materials` 자재 관리
- `/inventory/settings` 자재 설정

### 조직·시스템 설정

- `/system-setting` 시스템 설정
- `/system-setting/static-options` 공통 선택값
- `/system-setting/access-policy` 접근 정책
- `/system-onboarding` 가입 승인
- `/attribute/colors`, `/attribute/categories` 속성 관리
- `/attribute/processes/targets`, `/attribute/processes/actions`, `/attribute/processes/specs` 공정 마스터

## 적용 분류

- `AppPageContainer`를 사용하는 목록·상세 46개 화면은 공통 여백, 제목 크기, 헤더 간격과 구분선을 일괄 적용한다.
- `PageToolbar`를 사용하는 화면은 검색을 왼쪽에, 필터와 기간 선택을 오른쪽에 분리한다.
- `SearchInput`을 사용하는 화면은 동일 높이·테두리·최대 너비·지우기 버튼을 적용한다.
- 출퇴근, 주문, 작업기록 목록은 시작 월·종료 월 기간 조회와 `M+`·`M-` 이동을 적용한다.
- 배정·생산계획처럼 날짜 범위가 이미 있는 화면은 기존 시작일·종료일 의미를 보존한다.
- 상세 입력의 작업일, 입사일, 퇴사일처럼 단일 날짜 자체가 업무 데이터인 필드는 기간 필터로 변경하지 않는다.
