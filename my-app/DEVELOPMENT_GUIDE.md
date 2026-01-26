# 프로젝트 개발 가이드

이 문서는 재봉 공장 ERP 프로그램 개발을 위한 기준과 합의된 사항을 정리합니다. 프로젝트 참여자는 이 문서를 기준으로 개발을 진행합니다.

## 1. 프로젝트 개요

- **프로젝트명**: 재봉 공장 ERP 시스템
- **목표**: 재봉 공장의 생산, 인사, 재고 등 전반적인 업무를 관리하는 ERP 프로그램을 개발합니다.
- **주요 소통 언어**: 한국어

## 2. 기술 스택 (Tech Stack)

- **주요 언어**: TypeScript
- **프레임워크**: React (Vite 기반)
- **UI 라이브러리**: MUI (Material-UI)
- **라우팅**: React Router
- **스타일링**: Emotion (`sx` prop) / MUI

## 3. 프로젝트 구조

- `src/`: 소스 코드 루트 디렉토리입니다.
- `src/pages/`: 각 페이지(화면)에 해당하는 컴포넌트를 위치시킵니다. (예: `Login.jsx`, `Factory.jsx`)
- `src/components/`: 여러 페이지에서 재사용되는 공통 컴포넌트를 위치시킵니다.
- `src/layouts/`: 페이지의 전체적인 Layout을 정의하는 컴포넌트를 위치시킵니다.
- `src/context/`: 전역 상태 관리를 위한 React Context를 위치시킵니다.
- `src/theme/`: MUI 테마 커스터마이징 관련 코드를 위치시킵니다.
- `src/router.jsx`: 애플리케이션의 라우팅 설정을 정의합니다.

## 4. 개발 컨벤션 및 규칙

*이 섹션은 프로젝트 진행에 따라 지속적으로 업데이트됩니다.*

### 4.1. UI 개발 및 스타일링
- **UI 라이브러리**: 모든 UI 컴포넌트는 MUI를 우선적으로 사용하여 구현합니다.
- **스타일링**: MUI 컴포넌트의 `sx` prop을 사용하여 스타일을 적용하는 것을 기본으로 합니다. 전역적으로 필요한 스타일이나 복잡한 스타일은 별도의 CSS 파일로 관리할 수 있으나, 컴포넌트 단위의 스타일링은 `sx` prop 사용을 권장합니다.
- **컨테이너 스타일**: 콘텐츠를 감싸는 컨테이너(예: `Paper`)는 그림자(`elevation`) 사용을 지양하고, 대신 외곽선(`variant="outlined"`)을 사용하여 평평하고 인더스트리얼한 디자인 통일성을 유지합니다. 이는 애플리케이션에 보다 깔끔하고 전문적인 느낌을 부여합니다.

  **적용 예시:**
  ```jsx
  // 지양 (Avoid)
  <Paper elevation={3} sx={{ p: 2 }}>
    ...콘텐츠...
  </Paper>

  // 권장 (Recommended)
  <Paper variant="outlined" sx={{ p: 2 }}>
    ...콘텐츠...
  </Paper>
  ```

### 4.2. 상태 관리
- 간단한 상태는 컴포넌트 내부의 `useState`를 사용하고, 여러 컴포넌트에 걸쳐 사용되는 전역 상태는 `Context API`를 활용합니다.

### 4.3. 파일 및 컴포넌트 명명
- 컴포넌트 파일명은 `PascalCase`를 따릅니다. (예: `MyComponent.jsx`)
- 일반적인 함수나 변수는 `camelCase`를 따릅니다.

### 4.4. API 연동
- API 요청 및 데이터 처리에 대한 규칙은 추후 정의합니다.

### 4.5. 코드 스타일
- 프로젝트에 설정된 Prettier와 ESLint 규칙을 따릅니다. (설정 필요)

## 5. 주요 개념 및 용어 정의

*이 섹션은 프로젝트의 주요 도메인 개념을 정의합니다.*

- **역할 (Role)**: 사용자의 역할과 책임을 나타내는 개념입니다. (예: 관리자, 작업자)

## 6. 메뉴 구조 (Menu Structure)

*이 섹션은 좌측 네비게이션 메뉴의 구조를 정의합니다.*

- **기본 정보 (Basic Info)**
  - 역할 관리 (Role Management)
  - 권한 관리 (Permission Management)
- **조직 관리 (Organization Management)**
  - 회사 정보 (Company Info)
  - 공장 정보 (Factory Info)
  - 직원 관리 (Employee Management)
- **주문 관리 (Order Management)**
  - 고객 관리 (Customer Management)
  - 스타일 관리 (Style Management)
- **생산 관리 (Production Management)**
  - 생산 현황 (Production Status)
  - 작업 기록 (Work History)
- **시스템 설정 (System Settings)**

* (이 구조는 현재까지의 페이지를 바탕으로 추정되었으며, 변경될 수 있습니다.)

---
*이 문서는 Gemini AI 에이전트에 의해 관리됩니다. 사용자의 요청에 따라 내용이 업데이트될 수 있습니다.*
