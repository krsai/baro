import { useEffect, useState } from 'react';
import { subscribeNetworkLoading } from '../utils/apiClient';

// Only show the loading overlay if a request takes longer than this threshold.
// Fast requests (e.g. background polls, quick mutations) will never trigger the overlay.
const SHOW_DELAY_MS = 300;

export const useNetworkLoading = () => {
  const [networkLoading, setNetworkLoading] = useState({
    isLoading: false,
    activeRequestCount: 0,
    startedAt: null,
    scopes: [],
    updatedAt: Date.now(),
  });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return subscribeNetworkLoading(setNetworkLoading);
  }, []);

  useEffect(() => {
    if (!networkLoading.isLoading) {
      // Hide immediately — no delay when loading is done
      setVisible(false);
      return;
    }
    // Only reveal overlay if loading is still ongoing after the threshold
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [networkLoading.isLoading]);

  return { ...networkLoading, isLoading: visible };
};

export default useNetworkLoading;
