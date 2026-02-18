import React from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Auth/Login';
import SignUp from './pages/Auth/SignUp';
import Home from './pages/App/Home';
import Organization from './pages/App/Organization';
import Employee from './pages/App/Employee';
import Permission from './pages/App/Permission';
import Line from './pages/App/Line';
import Holiday from './pages/App/Holiday';
import SystemBoard from './pages/App/system/systemBoard';
import Customer from './pages/App/Customer';
import Style from './pages/App/Style';
import StyleBoard from './pages/App/style/StyleBoard';
import StyleDetail from './pages/App/style/StyleDetail';
import Assign from './pages/App/Assign';
import AssignDetail from './pages/App/assign/AssignDetail';
import Work from './pages/App/Work';
import WorkEntry from './pages/App/work/WorkEntry';
import Payroll from './pages/App/Payroll';
import PayrollEntry from './pages/App/payroll/PayrollEntry';
import AuthCallback from './pages/Auth/AuthCallback';
import { useAuth } from './context/AuthContext';
import Attribute from './pages/App/Attribute';
import Order from './pages/App/Order.jsx';
import ProductionPlan from './pages/App/ProductionPlan';
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay';
import { canAccessPath } from './utils/accessControl';

// 인증 상태를 확인하고, 인증되지 않은 사용자는 로그인으로 보냅니다.
const ProtectedRoute = () => {
  const { isAuthenticated, loading, devBypass, devProfile, accessProfile } = useAuth();
  const location = useLocation();
  const loadingStartedAtRef = React.useRef(null);

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
        title="세션 확인 중"
        subtitle="워크스페이스 접근 권한을 확인하고 있습니다."
      />
    );
  }

  loadingStartedAtRef.current = null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const canAccessCurrentPath = canAccessPath(location.pathname, {
    isAuthenticated,
    devBypass,
    devProfile,
    accessProfile,
  });
  if (!canAccessCurrentPath) {
    if (location.pathname === '/') {
      return <Navigate to="/login" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
};

const router = createBrowserRouter([
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/signup',
    element: <SignUp />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        path: 'auth/callback',
        element: <AuthCallback />,
      },
      {
        element: <ProtectedRoute />,
        children: [
          {
            index: true,
            element: <Home />,
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
            path: 'production-plan',
            element: <ProductionPlan />,
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
            path: 'attribute',
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
        ],
      },
    ],
  },
]);

export default router;
