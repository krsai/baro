import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar';
import { PickersDay } from '@mui/x-date-pickers/PickersDay';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import { useApp } from '../../../context/AppContext';
import { loadHolidays, saveHolidays } from '../../../utils/localData';

const getTodayStart = () => dayjs().startOf('day');
const toDateKey = (value) => dayjs(value).format('YYYY-MM-DD');
const formatHolidayLabel = (key) => dayjs(key).locale('ko').format('YYYY-MM-DD (ddd)');
const isPastDateKey = (key) => dayjs(key).startOf('day').isBefore(getTodayStart(), 'day');

const HolidayDay = (props) => {
  const { day, holidaysSet, ...other } = props;
  const dateKey = day.format('YYYY-MM-DD');
  const isCustomHoliday = holidaysSet.has(dateKey);
  const isSunday = day.day() === 0;
  const isPastDay = day.startOf('day').isBefore(getTodayStart(), 'day');

  return (
    <PickersDay
      day={day}
      {...other}
      sx={{
        ...(isPastDay
          ? {
              backgroundColor: '#F3F4F6',
              color: '#6B7280',
              '&:hover': {
                backgroundColor: '#ECEFF3',
              },
            }
          : {}),
        ...(isSunday || isCustomHoliday
          ? {
              backgroundColor: isPastDay ? '#F5E9EC' : '#FCECEF',
              color: isPastDay ? '#9C6B75' : '#B42334',
              '&:hover': {
                backgroundColor: isPastDay ? '#F1DEE3' : '#F8DDE4',
              },
            }
          : {}),
        ...(isCustomHoliday
          ? {
              border: `1px solid ${isPastDay ? '#C79AA6' : '#B42334'}`,
              fontWeight: 700,
            }
          : {}),
      }}
    />
  );
};

const HolidayBoard = () => {
  const { showNotification } = useApp();
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [holidayKeys, setHolidayKeys] = useState(() => loadHolidays());

  const holidaySet = useMemo(() => new Set(holidayKeys), [holidayKeys]);
  const selectedKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const isSelectedHoliday = holidaySet.has(selectedKey);
  const isSelectedSunday = selectedDate.day() === 0;

  const persistHolidayKeys = (nextKeys, message) => {
    const saved = saveHolidays(nextKeys);
    setHolidayKeys(saved);
    if (message) {
      showNotification(message, 'success');
    }
  };

  const handleToggleSelectedHoliday = () => {
    if (!selectedDate || !selectedDate.isValid()) return;

    if (isSelectedSunday) {
      showNotification('일요일은 기본 휴일로 자동 반영됩니다.', 'info');
      return;
    }

    if (isSelectedHoliday) {
      persistHolidayKeys(
        holidayKeys.filter((key) => key !== selectedKey),
        '휴일에서 제거했습니다.'
      );
      return;
    }

    persistHolidayKeys([...holidayKeys, selectedKey], '휴일로 등록했습니다.');
  };

  const handleRemoveHoliday = (dateKey) => {
    persistHolidayKeys(
      holidayKeys.filter((key) => key !== dateKey),
      '휴일에서 제거했습니다.'
    );
  };

  return (
    <AppPageContainer
      title="휴일 관리"
      toolbar={(
        <PageToolbar
          right={(
            <Chip
              icon={<CalendarMonthIcon color="primary" />}
              label={`수동 등록 휴일 ${holidayKeys.length}일`}
              variant="outlined"
            />
          )}
        />
      )}
    >
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper
          variant="outlined"
          sx={{ p: 2, width: { xs: '100%', md: 420 }, flexShrink: 0, borderRadius: 2 }}
        >
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ko">
            <DateCalendar
              value={selectedDate}
              onChange={(value) => {
                if (value) setSelectedDate(value);
              }}
              slots={{ day: HolidayDay }}
              slotProps={{ day: { holidaysSet: holidaySet } }}
            />
          </LocalizationProvider>

          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              선택일: {formatHolidayLabel(selectedKey)}
            </Typography>

            <Button
              variant={isSelectedHoliday ? 'outlined' : 'contained'}
              onClick={handleToggleSelectedHoliday}
              disabled={isSelectedSunday}
            >
              {isSelectedHoliday ? '선택일 휴일 해제' : '선택일 휴일 등록'}
            </Button>

            {isSelectedSunday && (
              <Typography variant="caption" color="text.secondary">
                일요일은 자동 휴일입니다.
              </Typography>
            )}

            <Typography variant="caption" color="text.secondary">
              지난 날짜는 회색 톤으로 표시됩니다.
            </Typography>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, flexGrow: 1, minHeight: 260, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              등록된 휴일
            </Typography>
          </Box>

          {holidayKeys.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              등록된 휴일이 없습니다. 달력에서 날짜를 선택해 휴일로 등록하세요.
            </Typography>
          ) : (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {holidayKeys.map((dateKey) => {
                const isPastHoliday = isPastDateKey(dateKey);

                return (
                  <Chip
                    key={dateKey}
                    label={
                      isPastHoliday
                        ? `${formatHolidayLabel(dateKey)} (지남)`
                        : formatHolidayLabel(dateKey)
                    }
                    onDelete={() => handleRemoveHoliday(dateKey)}
                    color="error"
                    variant="outlined"
                    sx={
                      isPastHoliday
                        ? {
                            backgroundColor: '#F3F4F6',
                            borderColor: '#C6CBD5',
                            color: '#6B7280',
                          }
                        : {}
                    }
                  />
                );
              })}
            </Stack>
          )}
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default HolidayBoard;
