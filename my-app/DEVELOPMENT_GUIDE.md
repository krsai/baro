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

### 페이지 구조 규칙 (`src/pages/App`)

`src/pages/App` 디렉토리 내의 모든 관리 페이지는 사용자에게 일관된 경험을 제공하기 위해 다음 구조를 따라야 합니다. 목표는 모든 페이지가 **"제목 및 액션 영역 + 본문 영역"** 이라는 동일한 시각적 뼈대를 공유하도록 하는 것입니다.

1.  **`AppPageContainer` 사용**
    -   모든 페이지의 최상위 컴포넌트는 반드시 `<AppPageContainer>`여야 합니다.

2.  **헤더(`header`) 영역 구성**
    -   `header` prop은 항상 존재해야 합니다.
    -   헤더는 수평으로 양쪽 정렬된 구조(`display: 'flex', justifyContent: 'space-between'`)를 유지합니다.
    -   **좌측**: 페이지의 제목을 표시합니다. (`<Typography component="h1" variant="h4">`)
    -   **우측**: 페이지의 주요 액션 버튼(들)을 위치시킵니다. (예: "추가", "수정")
    -   페이지에 따라 버튼이 필요 없는 경우에도, 헤더의 레이아웃 구조는 깨지지 않고 유지되어야 합니다.

3.  **본문(`children`) 영역 구성**
    -   본문은 `AppPageContainer`의 `children`으로 위치하며, 헤더 영역 아래에 렌더링됩니다.
    -   본문의 최상위 콘텐츠는 `<Paper>` 컴포넌트나 이와 유사한 시각적 컨테이너로 감싸 배경과 구별되도록 합니다.
    -   내부 콘텐츠(테이블, 폼, 카드 등)는 각 페이지의 기능에 맞게 자유롭게 구성할 수 있습니다.

4.  **보조 UI (Dialog, Drawer 등)**
    -   `Dialog`, `Drawer`, `Snackbar`와 같은 보조적인 UI 컴포넌트들은 페이지의 기본 레이아웃 구조에 영향을 주지 않도록 `<AppPageContainer>`의 자식 요소 중 가장 하단에 위치시킵니다.

#### 예시 구조

```jsx
import AppPageContainer from '../../components/AppPageContainer';
import { Box, Typography, Button, Paper } from '@mui/material';

const ExamplePage = () => {
  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography component="h1" variant="h4">
            페이지 제목
          </Typography>
          <Button variant="contained">
            액션 버튼
          </Button>
        </Box>
      }
    >
      <Paper sx={{ p: 3 }}>
        {/* 페이지의 주요 본문 콘텐츠 (테이블, 폼 등) */}
      </Paper>
      
      {/* 다이얼로그 등 기타 보조 UI */}
    </AppPageContainer>
  );
};

export default ExamplePage;
```

### 탭 사용 및 스타일링 (Tab Usage and Styling)

애플리케이션 전체의 탭 인터페이스는 일관된 사용자 경험을 위해 전역적으로 스타일이 관리됩니다. MUI의 `Tabs` 및 `Tab` 컴포넌트를 사용하여 탭을 구현하며, "Chrome-like" 현대적인 디자인 원칙을 따릅니다.

1.  **전역 스타일링**:
    -   모든 `MuiTabs` 및 `MuiTab` 컴포넌트의 기본 스타일은 `src/theme/index.js` 파일에 정의된 테마 오버라이드를 통해 관리됩니다. 이는 탭 버튼 간 간격, 상단 및 좌측 패딩, 둥근 모서리, 활성/비활성 상태의 색상 및 테두리 등을 포함합니다.
    -   개별 컴포넌트에서는 기본적인 탭 디자인을 위해 인라인 `sx` prop을 사용하지 않도록 권장합니다. 특정 페이지에서 전역 스타일에서 벗어나야 하는 예외적인 경우에만 `sx` prop을 사용하여 오버라이드할 수 있습니다.

2.  **`Tabs` 컴포넌트**:
    -   `<Tabs>` 컴포넌트는 탭 버튼 그룹을 감싸는 컨테이너입니다. `value` prop으로 현재 활성화된 탭의 인덱스를, `onChange` prop으로 탭 변경 핸들러를 전달해야 합니다.
    -   `MuiTabs` 루트에는 상단 및 좌측에 4px의 패딩이 전역적으로 적용되어 있습니다.

3.  **`Tab` 컴포넌트**:
    -   각 탭 버튼은 `<Tab>` 컴포넌트를 사용합니다. `label` prop으로 탭에 표시될 텍스트를 제공합니다.
    -   탭 버튼 사이의 간격은 `marginRight`를 통해 4px로 설정되어 있습니다.

4.  **`TabPanel` 컴포넌트**:
    -   탭 콘텐츠는 `TabPanel` 헬퍼 컴포넌트 내부에 배치되어야 합니다. 이 컴포넌트는 활성 탭에 맞춰 테두리 및 배경을 포함하여 콘텐츠 영역과 탭 간의 시각적인 연결을 자연스럽게 만듭니다.
    -   `TabPanel`은 `value`, `index`, `children` prop을 받습니다.

**예시 사용법 (Dialog 내 탭):**

```jsx
import { Tabs, Tab, Box, DialogContent } from '@mui/material';
import { useState } from 'react';

// TabPanel 헬퍼 컴포넌트 (Customer.jsx에 정의되어야 함)
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box
          sx={{
            p: 3,
            border: '1px solid #e8e8e8',
            borderTop: 'none',
            backgroundColor: '#fff',
            borderRadius: '0 8px 8px 8px',
            minHeight: 200,
          }}
        >
          {children}
        </Box>
      )}
    </div>
  );
}

const MyComponentWithTabs = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  return (
    <DialogContent sx={{ p: 0 }}> {/* DialogContent의 패딩을 제거하여 TabPanel이 전체 영역을 차지하도록 함 */}
      <Box sx={{ bgcolor: 'background.paper' }}> {/* 탭 컨테이너의 배경색을 설정 */}
        <Tabs value={selectedTab} onChange={handleTabChange} aria-label="example tabs">
          <Tab label="첫 번째 탭" />
          <Tab label="두 번째 탭" />
        </Tabs>
      </Box>

      <TabPanel value={selectedTab} index={0}>
        {/* 첫 번째 탭의 콘텐츠 */}
      </TabPanel>
      <TabPanel value={selectedTab} index={1}>
        {/* 두 번째 탭의 콘텐츠 */}
      </TabPanel>
    </DialogContent>
  );
};
```
### 탭 사용 및 스타일링 (Tab Usage and Styling)

애플리케이션 전체의 탭 인터페이스는 일관된 사용자 경험을 위해 전역적으로 스타일이 관리됩니다. MUI의 `Tabs` 및 `Tab` 컴포넌트를 사용하여 탭을 구현하며, "Chrome-like" 현대적인 디자인 원칙을 따릅니다.

1.  **전역 스타일링**:
    -   모든 `MuiTabs` 및 `MuiTab` 컴포넌트의 기본 스타일은 `src/theme/index.js` 파일에 정의된 테마 오버라이드를 통해 관리됩니다. 이는 탭 버튼 간 간격, 상단 및 좌측 패딩, 둥근 모서리, 활성/비활성 상태의 색상 및 테두리 등을 포함합니다.
    -   개별 컴포넌트에서는 기본적인 탭 디자인을 위해 인라인 `sx` prop을 사용하지 않도록 권장합니다. 특정 페이지에서 전역 스타일에서 벗어나야 하는 예외적인 경우에만 `sx` prop을 사용하여 오버라이드할 수 있습니다.

2.  **`Tabs` 컴포넌트**:
    -   `<Tabs>` 컴포넌트는 탭 버튼 그룹을 감싸는 컨테이너입니다. `value` prop으로 현재 활성화된 탭의 인덱스를, `onChange` prop으로 탭 변경 핸들러를 전달해야 합니다.
    -   `MuiTabs` 루트에는 상단 및 좌측에 4px의 패딩이 전역적으로 적용되어 있습니다.

3.  **`Tab` 컴포넌트**:
    -   각 탭 버튼은 `<Tab>` 컴포넌트를 사용합니다. `label` prop으로 탭에 표시될 텍스트를 제공합니다.
    -   탭 버튼 사이의 간격은 `marginRight`를 통해 4px로 설정되어 있습니다.

4.  **`TabPanel` 컴포넌트**:
    -   탭 콘텐츠는 `TabPanel` 헬퍼 컴포넌트 내부에 배치되어야 합니다. 이 컴포넌트는 활성 탭에 맞춰 테두리 및 배경을 포함하여 콘텐츠 영역과 탭 간의 시각적인 연결을 자연스럽게 만듭니다.
    -   `TabPanel`은 `value`, `index`, `children` prop을 받습니다.

**예시 사용법 (Dialog 내 탭):**

```jsx
import { Tabs, Tab, Box, DialogContent } from '@mui/material';
import { useState } from 'react';

// TabPanel 헬퍼 컴포넌트 (Customer.jsx에 정의되어야 함)
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box
          sx={{
            p: 3,
            border: '1px solid #e8e8e8',
            borderTop: 'none',
            backgroundColor: '#fff',
            borderRadius: '0 8px 8px 8px',
            minHeight: 200,
          }}
        >
          {children}
        </Box>
      )}
    </div>
  );
}

const MyComponentWithTabs = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  return (
    <DialogContent sx={{ p: 0 }}> {/* DialogContent의 패딩을 제거하여 TabPanel이 전체 영역을 차지하도록 함 */}
      <Box sx={{ bgcolor: 'background.paper' }}> {/* 탭 컨테이너의 배경색을 설정 */}
        <Tabs value={selectedTab} onChange={handleTabChange} aria-label="example tabs">
          <Tab label="첫 번째 탭" />
          <Tab label="두 번째 탭" />
        </Tabs>
      </Box>

      <TabPanel value={selectedTab} index={0}>
        {/* 첫 번째 탭의 콘텐츠 */}
      </TabPanel>
      <TabPanel value={selectedTab} index={1}>
        {/* 두 번째 탭의 콘텐츠 */}
      </TabPanel>
    </DialogContent>
  );
};
```

### 탭 콘텐츠의 데이터 관리 (Data Management for Tab Content)

탭 컴포넌트 내에서 데이터를 관리하고 표시할 때는 다음 지침을 따릅니다.

1.  **타입별 컴포넌트 사용**:
    -   각기 다른 데이터 유형(예: 고객, 스타일)에 대한 기본 정보나 BOM과 같이 유사하지만 데이터 구조가 다른 콘텐츠를 탭에 표시해야 할 경우, 각 데이터 유형에 특화된 컴포넌트를 생성하여 사용합니다.
    -   예시: 고객 데이터의 기본 정보는 `CustomerBasicInfo.jsx` (이전 `BasicInfo.jsx`), 스타일 데이터의 기본 정보는 `StyleBasicInfo.jsx`와 같이 명확하게 구분된 컴포넌트를 사용합니다. 이는 관심사 분리를 명확히 하고 코드의 재사용성 및 유지보수성을 높입니다.

2.  **`formData` 및 `handleInputChange` prop 전달**:
    -   탭을 포함하는 상위 컴포넌트(예: `Customer.jsx`, `Style.jsx`)는 해당 탭 콘텐츠가 필요로 하는 데이터를 상태로 관리해야 합니다.
    -   관리되는 데이터는 `formData` prop으로, 데이터 변경 핸들러는 `handleInputChange` prop으로 각 타입별 탭 콘텐츠 컴포넌트(예: `CustomerBasicInfo`, `StyleBasicInfo`)에 전달합니다.
    -   탭 콘텐츠 컴포넌트는 전달받은 `formData`와 `handleInputChange`를 사용하여 폼 필드를 렌더링하고 사용자 입력을 처리합니다. `formData` prop은 `{} `와 같은 기본값을 가지도록 하여, 데이터가 아직 로드되지 않았거나 `undefined`인 경우에도 오류를 방지합니다.

**예시 (Style.jsx의 데이터 관리):**

```jsx
// Style.jsx 내
import { useState } from 'react';
import StyleBasicInfo from './style/StyleBasicInfo';
import StyleBom from './style/StyleBom';

const initialStyleFormData = {
  styleCode: '',
  styleName: '',
  designer: '',
  collection: '',
  season: '',
  bomNotes: '',
};

const Style = () => {
  const [styleFormData, setStyleFormData] = useState(initialStyleFormData);

  const handleStyleInputChange = (e) => {
    const { name, value } = e.target;
    setStyleFormData((prev) => ({ ...prev, [name]: value }));
  };

  // ... (Tabs 및 TabPanel 렌더링 로직)
  <TabPanel value={currentTab} index={0}>
    <StyleBasicInfo formData={styleFormData} handleInputChange={handleStyleInputChange} />
  </TabPanel>
  <TabPanel value={currentTab} index={1}>
    <StyleBom formData={styleFormData} handleInputChange={handleStyleInputChange} />
  </TabPanel>
  // ...
};
```
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