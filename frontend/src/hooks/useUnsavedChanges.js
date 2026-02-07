import { useEffect, useRef } from 'react';

/**
 * 브라우저 탭 닫기 또는 새로고침 시 저장되지 않은 변경사항이 있을 경우 경고창을 띄우는 Hook
 * 
 * @param {boolean} isDirty - 변경사항 존재 여부 (true일 경우 경고)
 */
const useUnsavedChanges = (isDirty) => {
  // 이벤트 리스너가 최신 isDirty 값을 참조할 수 있도록 ref 사용
  const isDirtyRef = useRef(isDirty);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        // Chrome 등 최신 브라우저에서는 returnValue 설정이 필수입니다.
        e.returnValue = ''; 
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []); // 컴포넌트 마운트 시 한 번만 등록/해제
};

export default useUnsavedChanges;