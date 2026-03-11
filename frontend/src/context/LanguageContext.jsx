import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import { useAuth } from './AuthContext';
import {
  clearLanguageOverride,
  getCurrentLanguageCode,
  normalizeLanguageCode,
  readLanguageOverride,
  resolveLanguageCodeFromNavigator,
  resolveLanguageCodeFromUser,
  setCurrentLanguageCode,
  writeLanguageOverride,
} from '../utils/appLanguage';

const LanguageContext = createContext(null);

const resolveDetectedLanguageCode = (user) =>
  normalizeLanguageCode(resolveLanguageCodeFromUser(user) || resolveLanguageCodeFromNavigator());

const resolvePreferredLanguageCode = (user) =>
  normalizeLanguageCode(readLanguageOverride() || resolveDetectedLanguageCode(user));

export const LanguageProvider = ({ children }) => {
  const { user } = useAuth();
  const [languageCode, setLanguageCodeState] = useState(() => {
    const initialCode = resolvePreferredLanguageCode(null);
    setCurrentLanguageCode(initialCode);
    return initialCode;
  });

  useEffect(() => {
    const hasOverride = Boolean(readLanguageOverride());
    if (hasOverride) return;
    const nextCode = resolveDetectedLanguageCode(user);
    setCurrentLanguageCode(nextCode);
    setLanguageCodeState((prev) => (prev === nextCode ? prev : nextCode));
  }, [user]);

  useEffect(() => {
    const nextCode = setCurrentLanguageCode(languageCode);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = nextCode;
    }
    dayjs.locale(nextCode);
  }, [languageCode]);

  const setLanguageCode = useCallback((nextCode) => {
    const normalized = normalizeLanguageCode(nextCode);
    setCurrentLanguageCode(normalized);
    setLanguageCodeState((prev) => (prev === normalized ? prev : normalized));
    writeLanguageOverride(normalized);
  }, []);

  const resetLanguageCode = useCallback(() => {
    clearLanguageOverride();
    const nextCode = resolveDetectedLanguageCode(user);
    setCurrentLanguageCode(nextCode);
    setLanguageCodeState((prev) => (prev === nextCode ? prev : nextCode));
  }, [user]);

  const value = useMemo(
    () => ({
      languageCode,
      defaultLanguageCode: resolveDetectedLanguageCode(user),
      hasLanguageOverride: Boolean(readLanguageOverride()),
      setLanguageCode,
      resetLanguageCode,
      currentLanguageCode: getCurrentLanguageCode(),
    }),
    [languageCode, resetLanguageCode, setLanguageCode, user]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
