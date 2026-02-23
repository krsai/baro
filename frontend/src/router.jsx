import React from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay';
import { canAccessPath } from './utils/accessControl';

const MainLayout = React.lazy(() => import('./layouts/MainLayout'));
const Login = React.lazy(() => import('./pages/Auth/Login'));
const SignUp = React.lazy(() => import('./pages/Auth/SignUp'));
const Home = React.lazy(() => import('./pages/App/Home'));
const Organization = React.lazy(() => import('./pages/App/Organization'));
const Employee = React.lazy(() => import('./pages/App/Employee'));
const Permission = React.lazy(() => import('./pages/App/Permission'));
const Line = React.lazy(() => import('./pages/App/Line'));
const Holiday = React.lazy(() => import('./pages/App/Holiday'));
const SystemBoard = React.lazy(() => import('./pages/App/system/systemBoard'));
const Customer = React.lazy(() => import('./pages/App/Customer'));
const Style = React.lazy(() => import('./pages/App/Style'));
const StyleBoard = React.lazy(() => import('./pages/App/style/StyleBoard'));
const StyleDetail = React.lazy(() => import('./pages/App/style/StyleDetail'));
const Assign = React.lazy(() => import('./pages/App/Assign'));
const AssignDetail = React.lazy(() => import('./pages/App/assign/AssignDetail'));
const Work = React.lazy(() => import('./pages/App/Work'));
const Attendance = React.lazy(() => import('./pages/App/Attendance'));
const WorkEntry = React.lazy(() => import('./pages/App/work/WorkEntry'));
const Payroll = React.lazy(() => import('./pages/App/Payroll'));
const PayrollEntry = React.lazy(() => import('./pages/App/payroll/PayrollEntry'));
const AuthCallback = React.lazy(() => import('./pages/Auth/AuthCallback'));
const Attribute = React.lazy(() => import('./pages/App/Attribute'));
const Order = React.lazy(() => import('./pages/App/Order.jsx'));
const ProductionPlan = React.lazy(() => import('./pages/App/ProductionPlan'));
const CtReview = React.lazy(() => import('./pages/App/CtReview'));
const Overrun = React.lazy(() => import('./pages/App/Overrun'));

// 인증 상태를 확인하고, 인증되지 않은 사용자는 로그인으로 보낸다.
const ProtectedRoute = () => {
  const { isAuthenticated, loading, devBypass, devProfile, accessProfile } = useAuth();
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

  const canAccessCurrentPath = canAccessPath(location.pathname, authState);
  if (!canAccessCurrentPath) {
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
            path: 'attendance',
            element: <Attendance />,
          },
          {
            path: 'production-plan',
            element: <ProductionPlan />,
          },
          {
            path: 'ct-review',
            element: <CtReview />,
          },
          {
            path: 'production-overrun',
            element: <Overrun />,
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
