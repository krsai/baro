import React from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Auth/Login';
import SignUp from './pages/Auth/SignUp';
import Home from './pages/App/Home';
import Organization from './pages/App/Organization';
import Employee from './pages/App/Employee';
import Permission from './pages/App/Permission';
import Line from './pages/App/Line';

import SystemSetting from './pages/App/SystemSetting';
import OrganizationOnboarding from './pages/App/systemSetting/OrganizationOnboarding';
import Customer from './pages/App/Customer';
import Style from './pages/App/Style';
import StyleBoard from './pages/App/style/StyleBoard';
import StyleDetail from './pages/App/style/StyleDetail';
import Assign from './pages/App/Assign';
import AssignBoard from './pages/App/assign/AssignBoard';
import AssignDetail from './pages/App/assign/AssignDetail';
import Work from './pages/App/Work';
import AuthCallback from './pages/Auth/AuthCallback';
import { useAuth } from './context/AuthContext';
import Attribute from './pages/App/Attribute';
import Order from './pages/App/Order.jsx';

// 보호된 라우트들을 위한 "에이전트" 또는 "게이트키퍼" 역할을 하는 컴포넌트입니다.
// 사용자가 인증되었는지 확인하고, 인증되지 않은 경우 로그인 페이지로 리디렉션합니다.
// 인증된 경우, 중첩된 자식 라우트를 렌더링하기 위해 Outlet을 사용합니다.
const ProtectedRoute = () => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
    // MainLayout을 사용하는 모든 라우트들의 부모입니다.
    path: '/',
    element: <MainLayout />,
    children: [
      // 인증 콜백과 같이 MainLayout을 사용하지만 보호되지 않는 라우트입니다.
      {
        path: 'auth/callback',
        element: <AuthCallback />,
      },
      // 보호가 필요한 모든 라우트들은 이 `ProtectedRoute`의 자식으로 그룹화됩니다.
      {
        element: <ProtectedRoute />,
        children: [
          {
            index: true, // '/' 경로에 해당합니다.
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
            element: <SystemSetting />,
          },
          {
            path: 'system-setting/organization-onboarding',
            element: <OrganizationOnboarding />,
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
            path: 'attribute',
            element: <Attribute />,
          },
          {
            path: 'line',
            element: <Line />,
          },
        ],
      },
    ],
  },
]);

export default router;
