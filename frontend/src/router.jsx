import React from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay';
import { canAccessPath, resolveFirstAccessiblePath } from './utils/accessControl';
import Login from './pages/Auth/Login';
import SubscriptionRequired from './pages/Auth/SubscriptionRequired';

const MainLayout = React.lazy(() => import('./layouts/MainLayout'));
const SignUp = React.lazy(() => import('./pages/Auth/SignUp'));
const Organization = React.lazy(() => import('./pages/App/Organization'));
const Employee = React.lazy(() => import('./pages/App/Employee'));
const Permission = React.lazy(() => import('./pages/App/Permission'));
const Line = React.lazy(() => import('./pages/App/Line'));
const Holiday = React.lazy(() => import('./pages/App/Holiday'));
const SystemBoard = React.lazy(() => import('./pages/App/system/systemBoard'));
const StaticOptionBoard = React.lazy(() => import('./pages/App/system/StaticOptionBoard'));
const OnboardingBoard = React.lazy(() => import('./pages/App/system/OnboardingBoard'));
const Customer = React.lazy(() => import('./pages/App/Customer'));
const Style = React.lazy(() => import('./pages/App/Style'));
const StyleBoard = React.lazy(() => import('./pages/App/style/StyleBoard'));
const StyleDetail = React.lazy(() => import('./pages/App/style/StyleDetail'));
const StReview = React.lazy(() => import('./pages/App/StReview'));
const ShipmentReview = React.lazy(() => import('./pages/App/ShipmentReview'));
const Assign = React.lazy(() => import('./pages/App/Assign'));
const AssignDetail = React.lazy(() => import('./pages/App/assign/AssignDetail'));
const Work = React.lazy(() => import('./pages/App/Work'));
const Attendance = React.lazy(() => import('./pages/App/Attendance'));
const WorkEntry = React.lazy(() => import('./pages/App/work/WorkEntry'));
const WorkerWorkHistory = React.lazy(() => import('./pages/App/work/WorkerWorkHistory'));
const Payroll = React.lazy(() => import('./pages/App/Payroll'));
const PayrollEntry = React.lazy(() => import('./pages/App/payroll/PayrollEntry'));
const Onboarding = React.lazy(() => import('./pages/Auth/Onboarding'));
const Attribute = React.lazy(() => import('./pages/App/Attribute'));
const Order = React.lazy(() => import('./pages/App/Order.jsx'));
const ProductionPlan = React.lazy(() => import('./pages/App/ProductionPlan'));
const ProductionResult = React.lazy(() => import('./pages/App/ProductionResult'));
const Inventory = React.lazy(() => import('./pages/App/Inventory'));
const MyProfile = React.lazy(() => import('./pages/App/MyProfile'));
const WorkspaceShell = () => null;
const WORKSPACE_PATH = '/workspace';

const AuthOnlyRoute = () => {
  const {
    isAuthenticated,
    loading,
    hasWorkspaceAccess,
    requiresOnboarding,
    requiresSubscriptionContact,
  } = useAuth();

  if (loading) {
    return (
      <GlobalLoadingOverlay
        open
        fullscreen
        startedAt={Date.now()}
        activeRequestCount={1}
      />
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (hasWorkspaceAccess) {
    return <Navigate to={WORKSPACE_PATH} replace />;
  }
  if (requiresOnboarding) {
    return <Navigate to="/onboarding" replace />;
  }
  if (requiresSubscriptionContact) {
    return <Outlet />;
  }
  return <Navigate to="/login" replace />;
};

const OAuthCallbackRedirect = () => {
  const location = useLocation();
  const nextPath = `/login${location.search || ''}${location.hash || ''}`;
  return <Navigate to={nextPath} replace />;
};

const RootRedirect = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Navigate
      to={isAuthenticated ? WORKSPACE_PATH : '/login'}
      replace
    />
  );
};

// 인증 상태를 확인하고, 인증되지 않은 사용자는 로그인으로 보낸다.
const ProtectedRoute = () => {
  const {
    isAuthenticated,
    loading,
    hasWorkspaceAccess,
    requiresSubscriptionContact,
    devBypass,
    devProfile,
    accessProfile,
  } = useAuth();
  const location = useLocation();
  const loadingStartedAtRef = React.useRef(null);
  const authState = {
    isAuthenticated,
    devBypass,
    devProfile,
    accessProfile,
  };

  if (loading) {
    if (!loadingStartedAtRef.current) {
      loadingStartedAtRef.current = Date.now();
    }
    return (
      <GlobalLoadingOverlay
        open
        fullscreen
        startedAt={loadingStartedAtRef.current}
        activeRequestCount={1}
        title="인증 상태 확인 중"
        subtitle="워크스페이스 접근 권한을 확인하고 있습니다."
      />
    );
  }

  loadingStartedAtRef.current = null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!hasWorkspaceAccess) {
    if (requiresSubscriptionContact) {
      return <Navigate to="/subscription-required" replace />;
    }
    return <Navigate to="/onboarding" replace />;
  }

  const canAccessCurrentPath = canAccessPath(location.pathname, authState);
  if (!canAccessCurrentPath) {
    return <Navigate to={resolveFirstAccessiblePath(authState)} replace />;
  }

  return <Outlet />;
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/auth/callback',
    element: <OAuthCallbackRedirect />,
  },
  {
    path: '/signup',
    element: <SignUp />,
  },
  {
    element: <AuthOnlyRoute />,
    children: [
      {
        path: '/subscription-required',
        element: <SubscriptionRequired />,
      },
    ],
  },
  {
    path: '/onboarding',
    element: <Onboarding />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          {
            index: true,
            element: <RootRedirect />,
          },
          {
            path: 'workspace',
            element: <WorkspaceShell />,
          },
          {
            path: 'business',
            element: <Organization />,
          },
          {
            path: 'employee',
            element: <Employee />,
          },
          {
            path: 'permission',
            element: <Permission />,
          },
          {
            path: 'system-setting',
            element: <SystemBoard />,
          },
          {
            path: 'system-setting/static-options',
            element: <StaticOptionBoard />,
          },
          {
            path: 'system-onboarding',
            element: <OnboardingBoard />,
          },
          {
            path: 'customer',
            element: <Customer />,
          },
          {
            path: 'order',
            element: <Order />,
          },
          {
            path: 'order/:orderId',
            element: <Order />,
          },
          {
            path: 'style',
            element: <Style />,
          },
          {
            path: 'style/new',
            element: <StyleDetail />,
          },
          {
            path: 'style/:styleId',
            element: <StyleBoard />,
          },
          {
            path: 'st-review',
            element: <StReview />,
          },
          {
            path: 'shipment-review',
            element: <ShipmentReview />,
          },
          {
            path: 'assignment',
            element: <Assign />,
          },
          {
            path: 'assignment/new',
            element: <AssignDetail />,
          },
          {
            path: 'assignment/:assignmentId',
            element: <AssignDetail />,
          },
          {
            path: 'work-history',
            element: <Work />,
          },
          {
            path: 'worker-work-history',
            element: <WorkerWorkHistory />,
          },
          {
            path: 'attendance',
            element: <Attendance />,
          },
          {
            path: 'production-plan',
            element: <ProductionPlan />,
          },
          {
            path: 'production-result',
            element: <ProductionResult />,
          },
          {
            path: 'inventory',
            element: <Inventory />,
          },
          {
            path: 'work-history/new',
            element: <WorkEntry />,
          },
          {
            path: 'work-history/:workLogId',
            element: <WorkEntry />,
          },
          {
            path: 'payroll',
            element: <Payroll />,
          },
          {
            path: 'payroll/new',
            element: <PayrollEntry />,
          },
          {
            path: 'payroll/:payrollId',
            element: <PayrollEntry />,
          },
          {
            path: 'attribute/*',
            element: <Attribute />,
          },
          {
            path: 'line',
            element: <Line />,
          },
          {
            path: 'holiday',
            element: <Holiday />,
          },
          {
            path: 'profile',
            element: <MyProfile />,
          },
        ],
      },
    ],
  },
]);

export default router;
