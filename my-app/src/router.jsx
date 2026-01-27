import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/auth/Login';
import SignUp from './pages/auth/SignUp';
import Home from './pages/app/Home';
import Production from './pages/app/Production';
import Company from './pages/app/Company';
import Factory from './pages/app/Factory';
import Employee from './pages/app/Employee';
import Role from './pages/app/Role';
import Permission from './pages/app/Permission';

import SystemSetting from './pages/app/SystemSetting';
import Customer from './pages/app/Customer';
import Style from './pages/app/Style';
import StyleDetail from './pages/app/style/StyleDetail';
import WorkHistory from './pages/app/WorkHistory';
import AuthCallback from './pages/auth/AuthCallback';
import { useAuth } from './context/AuthContext';
import Attribute from './pages/App/attribute/Attribute';

// Protected Route 컴포넌트
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        path: '/',
        element: (
          <ProtectedRoute>
            <Home />
          </ProtectedRoute>
        ),
      },
      {
        path: '/production',
        element: (
          <ProtectedRoute>
            <Production />
          </ProtectedRoute>
        ),
      },
      {
        path: '/company',
        element: (
          <ProtectedRoute>
            <Company />
          </ProtectedRoute>
        ),
      },
      {
        path: '/factory',
        element: (
          <ProtectedRoute>
            <Factory />
          </ProtectedRoute>
        ),
      },
      {
        path: '/employee',
        element: (
          <ProtectedRoute>
            <Employee />
          </ProtectedRoute>
        ),
      },
      {
        path: '/role',
        element: (
          <ProtectedRoute>
            <Role />
          </ProtectedRoute>
        ),
      },
      {
        path: '/permission',
        element: (
          <ProtectedRoute>
            <Permission />
          </ProtectedRoute>
        ),
      },
      {
        path: '/system-setting',
        element: (
          <ProtectedRoute>
            <SystemSetting />
          </ProtectedRoute>
        ),
      },
      {
        path: '/customer',
        element: (
          <ProtectedRoute>
            <Customer />
          </ProtectedRoute>
        ),
      },
      {
        path: '/style',
        element: (
          <ProtectedRoute>
            <Style />
          </ProtectedRoute>
        ),
      },
      {
        path: '/style/new',
        element: (
          <ProtectedRoute>
            <StyleDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: '/style/:styleId',
        element: (
          <ProtectedRoute>
            <StyleDetail />
          </ProtectedRoute>
        ),
      },
      {
        path: '/work-history',
        element: (
          <ProtectedRoute>
            <WorkHistory />
          </ProtectedRoute>
        ),
      },
      {
        path: '/attribute',
        element: (
          <ProtectedRoute>
            <Attribute />
          </ProtectedRoute>
        ),
      },
      {
        path: '/auth/callback',
        element: <AuthCallback />,
      },
    ],
  },
  {
    path: '/login',
    element: <Login />,
  },
  {
    path: '/signup',
    element: <SignUp />,
  },
]);

export default router;
