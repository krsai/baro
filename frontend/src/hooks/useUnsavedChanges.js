import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppActions } from '../context/AppContext';

const DEFAULT_CONFIRM_MESSAGE = '저장되지 않은 변경사항이 있습니다. 저장하지 않고 이동하시겠습니까?';

const normalizePathname = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  const withoutHash = raw.split('#')[0];
  const pathname = withoutHash.split('?')[0] || '/';
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
};

/**
 * 브라우저 닫기/새로고침 및 앱 내부 이동 시 미저장 변경사항 경고를 연결합니다.
 *
 * @param {boolean} isDirty
 * @param {{ message?: string }} options
 */
const useUnsavedChanges = (isDirty, options = {}) => {
  const location = useLocation();
  const { setUnsavedChangesGuard, clearUnsavedChangesGuard } = useAppActions();
  const isDirtyRef = useRef(Boolean(isDirty));
  const guardIdRef = useRef(
    `unsaved:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`
  );

  const guardPath = useMemo(
    () => normalizePathname(location.pathname || '/'),
    [location.pathname]
  );
  const message = useMemo(() => {
    const raw = typeof options?.message === 'string' ? options.message.trim() : '';
    return raw || DEFAULT_CONFIRM_MESSAGE;
  }, [options?.message]);

  useEffect(() => {
    isDirtyRef.current = Boolean(isDirty);
  }, [isDirty]);

  useEffect(() => {
    setUnsavedChangesGuard(guardIdRef.current, {
      isDirty: Boolean(isDirty),
      message,
      path: guardPath,
    });
    return () => {
      clearUnsavedChangesGuard(guardIdRef.current);
    };
  }, [clearUnsavedChangesGuard, guardPath, isDirty, message, setUnsavedChangesGuard]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!isDirtyRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);
};

export default useUnsavedChanges;
