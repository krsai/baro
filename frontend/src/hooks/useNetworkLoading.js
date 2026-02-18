import { useEffect, useState } from 'react';
import { subscribeNetworkLoading } from '../utils/apiClient';

const initialLoadingState = {
  isLoading: false,
  activeRequestCount: 0,
  startedAt: null,
  updatedAt: Date.now(),
};

export const useNetworkLoading = () => {
  const [networkLoading, setNetworkLoading] = useState(initialLoadingState);

  useEffect(() => {
    const unsubscribe = subscribeNetworkLoading((snapshot) => {
      setNetworkLoading(snapshot);
    });
    return unsubscribe;
  }, []);

  return networkLoading;
};

export default useNetworkLoading;
