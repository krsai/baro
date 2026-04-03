import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  getLastUpdaterNameForPath,
  normalizeUpdaterPath,
  subscribeLastUpdater,
} from '../utils/lastUpdater';

const useLastUpdaterName = (pathOverride = '') => {
  const location = useLocation();
  const targetPath = useMemo(
    () => normalizeUpdaterPath(pathOverride || location.pathname || '/'),
    [location.pathname, pathOverride]
  );

  const [updaterName, setUpdaterName] = useState(() =>
    getLastUpdaterNameForPath(targetPath)
  );

  useEffect(() => {
    setUpdaterName(getLastUpdaterNameForPath(targetPath));
    return subscribeLastUpdater((detail) => {
      if (!detail || normalizeUpdaterPath(detail.path) !== targetPath) return;
      setUpdaterName(getLastUpdaterNameForPath(targetPath));
    });
  }, [targetPath]);

  return updaterName;
};

export default useLastUpdaterName;
