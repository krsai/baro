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
- **스타일링**: Emotion / CSS

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

## 4. 개발 컨벤션 및 규칙

*이 섹션은 프로젝트 진행에 따라 지속적으로 업데이트됩니다.*

### [아키텍처] 프론트엔드 스타일 관리 규칙 (Frontend Style Management Architecture)

프로젝트의 모든 실제 사용 페이지(pages/app 이하)가 동일한 구조와 전역 CSS 규칙을 사용하도록 스타일링 아키텍처를 정리합니다.

1.  **CSS는 전역 파일로만 관리합니다.**
    *   `styled-components`, 인라인 스타일(inline style), `sx` props 사용 금지.
    *   CSS Module (`*.module.css`) 사용 금지.
    *   모든 공통 스타일은 `src/styles` 폴더로 이동.

2.  **`src/styles` 폴더 구조는 다음을 기준으로 합니다.**
    *   `base.css`: reset, font, box-sizing, 기본 body 설정.
    *   `theme.css`: 색상, font-size, spacing, border-radius 변수.
    *   `layout.css`: 페이지 공통 레이아웃 (`page-wrapper`, `page-header`, `page-title`, `page-actions`, `page-content`, `page-section`).
    *   `table.css`: table, th, td, pagination 공통 스타일.
    *   `form.css`: input, select, button 공통 스타일.

3.  **전역 CSS는 `src/index.jsx`에서만 import 합니다.**
    *   각 페이지 또는 컴포넌트에서 CSS를 직접 import 하지 마세요.

4.  **`pages/app` 이하의 모든 페이지는 반드시 동일한 기본 구조를 사용해야 합니다.**
    *   **기본 구조 예시:**
        *   `page-wrapper`
            *   `page-header`
                *   `page-title`
                *   `page-actions` (버튼 영역, 없어도 구조는 유지)
            *   `page-content`
                *   `page-section` (여러 개 가능)
    *   페이지마다 내용은 달라도 구조(`className`)는 절대 변경하지 마세요.

5.  **페이지 파일에서는 다음을 준수합니다.**
    *   `className`만 사용합니다.
    *   `margin`, `padding`, `color`, `font-size`를 직접 정의하지 마세요.
    *   "구조만 작성하고 스타일은 전역 CSS에 위임" 하세요.

6.  **기존 코드가 있다면 다음을 수행합니다.**
    *   스타일 관련 로직을 제거하고, 전역 CSS 기준으로 정리합니다.
    *   UI 외형은 최대한 유지하되 구조를 우선합니다.

7.  **로그인, 회원가입 등 인증 페이지(`pages/auth` 또는 `pages/public`)는 이 전역 구조 적용 대상에서 제외합니다.**

### 페이지 파일 예시 (pages/App/_PageTemplate.jsx)

```jsx
// src/pages/App/_PageTemplate.jsx
import React from 'react';

const PageTemplate = () => {
  return (
    <div className="page-wrapper">
      <header className="page-header">
        <h1 className="page-title">페이지 제목</h1>
        <div className="page-actions">
          {/* Action buttons go here */}
          <button className="btn btn-primary">액션 버튼</button>
        </div>
      </header>
      <main className="page-content">
        <section className="page-section">
          <h2>섹션 제목 1</h2>
          <p>여기에 섹션 내용이 들어갑니다.</p>
          {/* Example of a form group */}
          <div className="form-group">
            <label htmlFor="exampleInput" className="form-label">예시 입력</label>
            <input type="text" id="exampleInput" className="input-field" placeholder="텍스트를 입력하세요" />
          </div>
        </section>
        <section className="page-section">
          <h2>섹션 제목 2</h2>
          <p>다른 섹션 내용.</p>
          {/* Example of a data table */}
          <table className="data-table">
            <thead>
              <tr>
                <th>컬럼 1</th>
                <th>컬럼 2</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>데이터 1-1</td>
                <td>데이터 1-2</td>
              </tr>
            </tbody>
          </table>
          <div className="pagination">
            <button className="pagination-button">&laquo;</button>
            <button className="pagination-button active">1</button>
            <button className="pagination-button">2</button>
            <button className="pagination-button">&raquo;</button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default PageTemplate;
```
---
1.  **UI 개발**: 모든 UI 컴포넌트는 MUI를 우선적으로 사용하여 구현합니다.
2.  **상태 관리**: 간단한 상태는 컴포넌트 내부의 `useState`를 사용하고, 여러 컴포넌트에 걸쳐 사용되는 전역 상태는 `Context API`를 활용합니다.
3.  **파일 및 컴포넌트 명명**:
    -   컴포넌트 파일명은 `PascalCase`를 따릅니다. (예: `MyComponent.jsx`)
    -   일반적인 함수나 변수는 `camelCase`를 따릅니다.
4.  **API 연동**: API 요청 및 데이터 처리에 대한 규칙은 추후 정의합니다.
5.  **코드 스타일**: 프로젝트에 설정된 Prettier와 ESLint 규칙을 따릅니다. (설정 필요)

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