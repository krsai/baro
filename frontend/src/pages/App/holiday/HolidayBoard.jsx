import React, { useCallback, useMemo, useState } from 'react';
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
import 'dayjs/locale/vi';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { loadHolidays, saveHolidays } from '../../../utils/localData';

const getTodayStart = () => dayjs().startOf('day');
const toDateKey = (value) => dayjs(value).format('YYYY-MM-DD');
const isPastDateKey = (key) => dayjs(key).startOf('day').isBefore(getTodayStart(), 'day');
const normalizeHolidayKeys = (keys = []) =>
  Array.from(
    new Set(
      (Array.isArray(keys) ? keys : []).filter(
        (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim())
      )
    )
  ).sort();
const resolveCalendarLocale = (languageCode = 'ko') => {
  const code = String(languageCode || '').toLowerCase();
  if (code.startsWith('vi')) return 'vi';
  if (code.startsWith('en')) return 'en';
  return 'ko';
};
const formatHolidayLabel = (key, localeCode) =>
  dayjs(key).locale(localeCode || 'ko').format('YYYY-MM-DD (ddd)');

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
  const { showNotification } = useAppActions();
  const { languageCode } = useLanguage();

  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [savedHolidayKeys, setSavedHolidayKeys] = useState(() => loadHolidays());
  const [draftHolidayKeys, setDraftHolidayKeys] = useState(() => loadHolidays());
  const [isSaving, setIsSaving] = useState(false);

  const calendarLocale = useMemo(
    () => resolveCalendarLocale(languageCode),
    [languageCode]
  );
  const text = useMemo(
    () => ({
      title: getUiMessage('holidayBoard.title', 'Holiday Management', languageCode),
      manualHolidayCount: getUiMessage(
        'holidayBoard.manualHolidayCount',
        'Manual holidays {count} days',
        languageCode,
        { count: draftHolidayKeys.length }
      ),
      selectedDate: getUiMessage('holidayBoard.selectedDate', 'Selected Date', languageCode),
      registerSelected: getUiMessage(
        'holidayBoard.registerSelected',
        'Register Selected Date',
        languageCode
      ),
      unregisterSelected: getUiMessage(
        'holidayBoard.unregisterSelected',
        'Remove Selected Date',
        languageCode
      ),
      sundayInfo: getUiMessage(
        'holidayBoard.sundayInfo',
        'Sundays are automatically treated as holidays.',
        languageCode
      ),
      pastDateHint: getUiMessage(
        'holidayBoard.pastDateHint',
        'Past dates are shown in gray tone.',
        languageCode
      ),
      registeredHolidays: getUiMessage(
        'holidayBoard.registeredHolidays',
        'Registered Holidays',
        languageCode
      ),
      emptyMessage: getUiMessage(
        'holidayBoard.emptyMessage',
        'No registered holidays. Select a date from the calendar to register one.',
        languageCode
      ),
      pastSuffix: getUiMessage('holidayBoard.pastSuffix', 'Past', languageCode),
      noChanges: getUiMessage(
        'holidayBoard.noChanges',
        'There are no changes to save.',
        languageCode
      ),
      saveSuccess: getUiMessage(
        'holidayBoard.saveSuccess',
        'Holiday changes have been saved.',
        languageCode
      ),
      saveError: getUiMessage(
        'holidayBoard.saveError',
        'Failed to save holiday changes.',
        languageCode
      ),
    }),
    [draftHolidayKeys.length, languageCode]
  );

  const holidaySet = useMemo(() => new Set(draftHolidayKeys), [draftHolidayKeys]);
  const selectedKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const isSelectedHoliday = holidaySet.has(selectedKey);
  const isSelectedSunday = selectedDate.day() === 0;
  const isDirty = useMemo(
    () => JSON.stringify(savedHolidayKeys) !== JSON.stringify(draftHolidayKeys),
    [draftHolidayKeys, savedHolidayKeys]
  );

  useUnsavedChanges(isDirty);

  const updateDraftHolidayKeys = useCallback((nextKeys) => {
    setDraftHolidayKeys(normalizeHolidayKeys(nextKeys));
  }, []);

  const handleToggleSelectedHoliday = useCallback(() => {
    if (!selectedDate || !selectedDate.isValid()) return;

    if (isSelectedSunday) {
      showNotification(text.sundayInfo, 'info');
      return;
    }

    if (isSelectedHoliday) {
      updateDraftHolidayKeys(draftHolidayKeys.filter((key) => key !== selectedKey));
      return;
    }

    updateDraftHolidayKeys([...draftHolidayKeys, selectedKey]);
  }, [
    draftHolidayKeys,
    isSelectedHoliday,
    isSelectedSunday,
    selectedDate,
    selectedKey,
    showNotification,
    text.sundayInfo,
    updateDraftHolidayKeys,
  ]);

  const handleRemoveHoliday = useCallback(
    (dateKey) => {
      if (isSaving) return;
      updateDraftHolidayKeys(draftHolidayKeys.filter((key) => key !== dateKey));
    },
    [draftHolidayKeys, isSaving, updateDraftHolidayKeys]
  );

  const handleSaveChanges = useCallback(() => {
    if (isSaving) return;

    if (!isDirty) {
      showNotification(text.noChanges, 'info');
      return;
    }

    setIsSaving(true);
    try {
      const saved = saveHolidays(draftHolidayKeys);
      setSavedHolidayKeys(saved);
      setDraftHolidayKeys(saved);
      showNotification(text.saveSuccess, 'success');
    } catch (_error) {
      showNotification(text.saveError, 'error');
    } finally {
      setIsSaving(false);
    }
  }, [
    draftHolidayKeys,
    isDirty,
    isSaving,
    showNotification,
    text.noChanges,
    text.saveError,
    text.saveSuccess,
  ]);

  return (
    <AppPageContainer
      title={text.title}
      titleActions={(
        <SaveButton
          onClick={handleSaveChanges}
          disabled={isSaving || !isDirty}
          loading={isSaving}
        />
      )}
      toolbar={(
        <PageToolbar
          right={(
            <Chip
              icon={<CalendarMonthIcon color="primary" />}
              label={text.manualHolidayCount}
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
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={calendarLocale}>
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
              {text.selectedDate}: {formatHolidayLabel(selectedKey, calendarLocale)}
            </Typography>

            <Button
              variant={isSelectedHoliday ? 'outlined' : 'contained'}
              onClick={handleToggleSelectedHoliday}
              disabled={isSelectedSunday || isSaving}
            >
              {isSelectedHoliday ? text.unregisterSelected : text.registerSelected}
            </Button>

            {isSelectedSunday && (
              <Typography variant="caption" color="text.secondary">
                {text.sundayInfo}
              </Typography>
            )}

            <Typography variant="caption" color="text.secondary">
              {text.pastDateHint}
            </Typography>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, flexGrow: 1, minHeight: 260, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {text.registeredHolidays}
            </Typography>
          </Box>

          {draftHolidayKeys.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {text.emptyMessage}
            </Typography>
          ) : (
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {draftHolidayKeys.map((dateKey) => {
                const isPastHoliday = isPastDateKey(dateKey);

                return (
                  <Chip
                    key={dateKey}
                    label={
                      isPastHoliday
                        ? `${formatHolidayLabel(dateKey, calendarLocale)} (${text.pastSuffix})`
                        : formatHolidayLabel(dateKey, calendarLocale)
                    }
                    onDelete={isSaving ? undefined : () => handleRemoveHoliday(dateKey)}
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
