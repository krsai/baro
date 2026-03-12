import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import {
  clearLanguageOverride,
  getDefaultLanguageCode,
  getCurrentLanguageCode,
  normalizeLanguageCode,
  readLanguageOverride,
  setCurrentLanguageCode,
  writeLanguageOverride,
} from '../utils/appLanguage';

const LanguageContext = createContext(null);

const resolveDefaultLanguageCode = () => normalizeLanguageCode(getDefaultLanguageCode());

const resolvePreferredLanguageCode = () =>
  normalizeLanguageCode(readLanguageOverride() || resolveDefaultLanguageCode());

export const LanguageProvider = ({ children }) => {
  const [languageCode, setLanguageCodeState] = useState(() => {
    const initialCode = resolvePreferredLanguageCode();
    setCurrentLanguageCode(initialCode);
    return initialCode;
  });

  useEffect(() => {
    const nextCode = resolvePreferredLanguageCode();
    setCurrentLanguageCode(nextCode);
    setLanguageCodeState((prev) => (prev === nextCode ? prev : nextCode));
  }, []);

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
    const nextCode = resolveDefaultLanguageCode();
    setCurrentLanguageCode(nextCode);
    setLanguageCodeState((prev) => (prev === nextCode ? prev : nextCode));
  }, []);

  const value = useMemo(
    () => ({
      languageCode,
      defaultLanguageCode: resolveDefaultLanguageCode(),
      hasLanguageOverride: Boolean(readLanguageOverride()),
      setLanguageCode,
      resetLanguageCode,
      currentLanguageCode: getCurrentLanguageCode(),
    }),
    [languageCode, resetLanguageCode, setLanguageCode]
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
