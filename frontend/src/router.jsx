import React from 'react';
import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay';
import { canAccessPath, resolveFirstAccessiblePath } from './utils/accessControl';
import { readPersonalPreferences } from './utils/personalPreferences';
import Login from './pages/Auth/Login';
import SubscriptionRequired from './pages/Auth/SubscriptionRequired';

const DYNAMIC_IMPORT_RELOAD_KEY = 'baro:dynamic-import-reload-at';
const DYNAMIC_IMPORT_RELOAD_COOLDOWN_MS = 15_000;
const isDynamicImportChunkError = (error) => {
  const message = String(error?.message || '').trim();
  if (!message) return false;
  return (
    message.includes('Failed to fetch dynamically imported module') ||
    message.includes('Importing a module script failed') ||
    message.includes('Loading chunk')
  );
};
const lazyImportWithRetry = (importer) =>
  React.lazy(() =>
    importer()
      .then((module) => {
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
        }
        return module;
      })
      .catch((error) => {
        if (typeof window === 'undefined' || !isDynamicImportChunkError(error)) {
          throw error;
        }
        const lastReloadAt = Number(window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) || 0);
        const recentlyRetried =
          Number.isFinite(lastReloadAt) &&
          lastReloadAt > 0 &&
          Date.now() - lastReloadAt < DYNAMIC_IMPORT_RELOAD_COOLDOWN_MS;
        if (recentlyRetried) {
          throw error;
        }
        window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return new Promise(() => {});
      })
  );

const MainLayout = lazyImportWithRetry(() => import('./layouts/MainLayout'));
const SignUp = lazyImportWithRetry(() => import('./pages/Auth/SignUp'));
const Organization = lazyImportWithRetry(() => import('./pages/App/Organization'));
const Employee = lazyImportWithRetry(() => import('./pages/App/Employee'));
const EmployeeSystem = lazyImportWithRetry(() => import('./pages/App/EmployeeSystem'));
const SalarySystem = lazyImportWithRetry(() => import('./pages/App/SalarySystem'));
const Permission = lazyImportWithRetry(() => import('./pages/App/Permission'));
const Line = lazyImportWithRetry(() => import('./pages/App/Line'));
const Holiday = lazyImportWithRetry(() => import('./pages/App/Holiday'));
const SystemBoard = lazyImportWithRetry(() => import('./pages/App/system/systemBoard'));
const StaticOptionBoard = lazyImportWithRetry(() => import('./pages/App/system/StaticOptionBoard'));
const AccessPolicyBoard = lazyImportWithRetry(() => import('./pages/App/system/AccessPolicyBoard'));
const OnboardingBoard = lazyImportWithRetry(() => import('./pages/App/system/OnboardingBoard'));
const Customer = lazyImportWithRetry(() => import('./pages/App/Customer'));
const CustomerDetail = lazyImportWithRetry(() => import('./pages/App/customer/CustomerDetail'));
const CustomerPricingBoard = lazyImportWithRetry(() => import('./pages/App/customer/CustomerPricingBoard'));
const Style = lazyImportWithRetry(() => import('./pages/App/Style'));
const StyleBoard = lazyImportWithRetry(() => import('./pages/App/style/StyleBoard'));
const StyleDetail = lazyImportWithRetry(() => import('./pages/App/style/StyleDetail'));
const StReview = lazyImportWithRetry(() => import('./pages/App/StReview'));
const ShipmentReview = lazyImportWithRetry(() => import('./pages/App/ShipmentReview'));
const QcReview = lazyImportWithRetry(() => import('./pages/App/QcReview'));
const Assign = lazyImportWithRetry(() => import('./pages/App/Assign'));
const AssignDetail = lazyImportWithRetry(() => import('./pages/App/assign/AssignDetail'));
const Work = lazyImportWithRetry(() => import('./pages/App/Work'));
const WorkMonthly = lazyImportWithRetry(() => import('./pages/App/WorkMonthly'));
const WorkMonthlyDetail = lazyImportWithRetry(() => import('./pages/App/work/WorkMonthlyDetail'));
const ProductionAnalysis = lazyImportWithRetry(() => import('./pages/App/ProductionAnalysis'));
const Attendance = lazyImportWithRetry(() => import('./pages/App/Attendance'));
const AttendanceEntry = lazyImportWithRetry(() => import('./pages/App/attendance/AttendanceEntry'));
const WorkEntry = lazyImportWithRetry(() => import('./pages/App/work/WorkEntry'));
const OutsourcingRecordList = lazyImportWithRetry(() => import('./pages/App/OutsourcingRecordList'));
const Payroll = lazyImportWithRetry(() => import('./pages/App/Payroll'));
const PayrollEntry = lazyImportWithRetry(() => import('./pages/App/payroll/PayrollEntry'));
const RevenueAnalysis = lazyImportWithRetry(() => import('./pages/App/RevenueAnalysis'));
const RevenueForecast = lazyImportWithRetry(() => import('./pages/App/RevenueForecast'));
const CustomerProductionReport = lazyImportWithRetry(() => import('./pages/App/CustomerProductionReport'));
const BusinessPartners = lazyImportWithRetry(() => import('./pages/App/BusinessPartners'));
const Onboarding = lazyImportWithRetry(() => import('./pages/Auth/Onboarding'));
const Attribute = lazyImportWithRetry(() => import('./pages/App/Attribute'));
const Order = lazyImportWithRetry(() => import('./pages/App/Order.jsx'));
const ProductionPlan = lazyImportWithRetry(() => import('./pages/App/ProductionPlan'));
const Inventory = lazyImportWithRetry(() => import('./pages/App/Inventory'));
const MyProfile = lazyImportWithRetry(() => import('./pages/App/MyProfile'));
const PersonalSettings = lazyImportWithRetry(() => import('./pages/App/PersonalSettings'));
const WorkspaceDashboard = lazyImportWithRetry(() => import('./pages/App/WorkspaceDashboard'));

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
    return <Navigate to="/" replace />;
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
  const { isAuthenticated, activeProfile, user, accessProfile, devBypass, devProfile } = useAuth();
  const shouldOpenDashboard =
    readPersonalPreferences(activeProfile, user).openDashboardOnLogin &&
    canAccessPath('/dashboard', { isAuthenticated, accessProfile, devBypass, devProfile });

  return (
    <Navigate
      to={isAuthenticated ? (shouldOpenDashboard ? '/dashboard' : '/workspace') : '/login'}
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
            element: <></>,
          },
          {
            path: 'dashboard',
            element: <WorkspaceDashboard />,
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
            path: 'employee-system',
            element: <EmployeeSystem />,
          },
          {
            path: 'salary-system',
            element: <SalarySystem />,
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
            path: 'system-setting/access-policy',
            element: <AccessPolicyBoard />,
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
            path: 'customer/new',
            element: <CustomerDetail />,
          },
          {
            path: 'customer/:customerId',
            element: <CustomerDetail />,
          },
          {
            path: 'customer-pricing',
            element: <CustomerPricingBoard />,
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
            path: 'customer-production-report',
            element: <CustomerProductionReport />,
          },
          {
            path: 'outsourcing-partner',
            element: <BusinessPartners type="PROCESS_OUTSOURCING" />,
          },
          {
            path: 'material-supplier',
            element: <BusinessPartners type="MATERIAL_SUPPLIER" />,
          },
          {
            path: 'business-partner',
            element: <Navigate to="/outsourcing-partner" replace />,
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
            path: 'qc-review',
            element: <QcReview />,
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
            path: 'outsourcing-record',
            element: <OutsourcingRecordList />,
          },
          {
            path: 'outsourcing-record/new',
            element: <WorkEntry recordKind="OUTSOURCING" />,
          },
          {
            path: 'outsourcing-record/:workLogId',
            element: <WorkEntry recordKind="OUTSOURCING" />,
          },
          {
            path: 'production-analysis',
            element: <ProductionAnalysis />,
          },
          {
            path: 'production-analysis/:monthKey/:factoryId/:workerId',
            element: <WorkMonthlyDetail />,
          },
          {
            path: 'work-history-monthly',
            element: <WorkMonthly />,
          },
          {
            path: 'work-history-monthly/:monthKey/:factoryId/:workerId',
            element: <WorkMonthly />,
          },
          {
            path: 'attendance',
            element: <Attendance />,
          },
          {
            path: 'attendance/new',
            element: <AttendanceEntry />,
          },
          {
            path: 'attendance/:factoryId/:workDate',
            element: <AttendanceEntry />,
          },
          {
            path: 'production-plan',
            element: <ProductionPlan />,
          },
          {
            path: 'inventory',
            element: <Navigate to="/inventory/stock" replace />,
          },
          {
            path: 'inventory/stock',
            element: <Inventory view="stock" />,
          },
          {
            path: 'inventory/movements/new',
            element: <Inventory view="entry" />,
          },
          {
            path: 'inventory/movements',
            element: <Inventory view="history" />,
          },
          {
            path: 'inventory/materials',
            element: <Inventory view="materials" />,
          },
          {
            path: 'inventory/settings',
            element: <Inventory view="settings" />,
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
            element: <Navigate to="/payroll" replace />,
          },
          {
            path: 'payroll/:payrollId',
            element: <PayrollEntry />,
          },
          {
            path: 'revenue-forecast',
            element: <RevenueForecast />,
          },
          {
            path: 'revenue-analysis',
            element: <RevenueAnalysis />,
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
          {
            path: 'personal-settings',
            element: <PersonalSettings />,
          },
        ],
      },
    ],
  },
]);

export default router;
