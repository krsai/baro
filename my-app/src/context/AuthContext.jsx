import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // 프론트엔드 개발 중에는 테스트를 위해 기본 사용자 정보를 설정해둡니다.
  // 추후 백엔드 연동 시 초기값을 null로 변경하고 로그인 로직을 연결하면 됩니다.
  const [user, setUser] = useState(null);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};