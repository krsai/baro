import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import Login from './pages/Login';
import SignUp from './pages/SignUp';
import Home from './pages/Home';
import Production from './pages/Production';
import Company from './pages/Company';
import Factory from './pages/Factory';
import Employee from './pages/Employee';
import Role from './pages/Role';
import Permission from './pages/Permission';
import BasicInfo from './pages/BasicInfo';
import SystemSetting from './pages/SystemSetting';
import AuthCallback from './pages/AuthCallback';
import { useAuth } from './context/AuthContext';

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
