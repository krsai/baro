import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';

const formatElapsed = (elapsedMs) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const estimateProgress = (elapsedMs, activeRequestCount) => {
  const cap = activeRequestCount > 1 ? 96 : 92;
  const eased = 1 - Math.exp(-elapsedMs / 2600);
  const estimated = Math.max(5, Math.round(eased * cap));
  return Math.min(cap, estimated);
};

const GlobalLoadingOverlay = ({
  open = false,
  startedAt = null,
  activeRequestCount = 0,
  title = '작업 화면 로딩 중',
  subtitle = '페이지 데이터를 안정적으로 준비하고 있습니다.',
  fullscreen = false,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    setVisible(open);
  }, [open]);

  useEffect(() => {
    if (!visible) return undefined;
    setNow(Date.now());
    const timerId = setInterval(() => {
      setNow(Date.now());
    }, 120);
    return () => clearInterval(timerId);
  }, [visible, startedAt]);

  const elapsedMs = useMemo(() => {
    if (!visible) return 0;
    if (!startedAt) return 0;
    return Math.max(0, now - startedAt);
  }, [now, visible, startedAt]);

  const progressValue = useMemo(
    () => estimateProgress(elapsedMs, activeRequestCount),
    [elapsedMs, activeRequestCount],
  );

  if (!visible) return null;

  const requestStatusText = `${activeRequestCount}개 요청 처리 중`;

  return (
    <Box
      sx={{
        position: fullscreen ? 'fixed' : 'absolute',
        inset: 0,
        zIndex: fullscreen ? 1500 : 10,
        pointerEvents: 'auto',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          bgcolor: 'rgba(255,255,255,0.8)',
          backdropFilter: 'blur(2px)',
        }}
      />

      <Stack
        spacing={1.2}
        sx={{
          position: 'absolute',
          inset: 0,
          p: { xs: 2, md: 3 },
          opacity: 0.55,
        }}
      >
        <Skeleton variant="rounded" height={44} />
        <Skeleton variant="rounded" height={90} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2}>
          <Skeleton variant="rounded" height={120} sx={{ flex: 1 }} />
          <Skeleton variant="rounded" height={120} sx={{ flex: 1 }} />
        </Stack>
        <Skeleton variant="rounded" height={190} />
      </Stack>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 'min(460px, calc(100% - 32px))',
          margin: 'auto',
          mt: fullscreen ? '20vh' : '14vh',
        }}
      >
        <Paper elevation={6} sx={{ p: 2.5, borderRadius: 2 }}>
          <Stack spacing={1.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ position: 'relative', display: 'inline-flex' }}>
                <CircularProgress
                  variant="determinate"
                  value={progressValue}
                  size={62}
                  thickness={4}
                />
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>
                    {`${Math.round(progressValue)}%`}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  {title}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {subtitle}
                </Typography>
              </Box>
            </Box>

            {/*
            <LinearProgress
              variant="determinate"
              value={progressValue}
              sx={{ height: 8, borderRadius: 999 }}
            />
            */}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {requestStatusText}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {`경과 ${formatElapsed(elapsedMs)}`}
              </Typography>
            </Box>
          </Stack>
        </Paper>
      </Box>
    </Box>
  );
};

export default GlobalLoadingOverlay;
