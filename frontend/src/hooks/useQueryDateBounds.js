import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useManagementPeriod } from '../context/ManagementPeriodContext';

// Query periods belong to the company, regardless of the selected factory.
export default function useQueryDateBounds({ min, max, allowFuture = false } = {}) {
  const period = useManagementPeriod();
  const [currentMonth, setCurrentMonth] = useState(() => dayjs().format('YYYY-MM'));
  useEffect(() => {
    const refresh = () => setCurrentMonth(dayjs().format('YYYY-MM'));
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const dateKey = value => value && dayjs(value).isValid() ? dayjs(value).format('YYYY-MM-DD') : '';
  const minimum = [dateKey(period.startDate), dateKey(min)].filter(Boolean).sort().at(-1) || '';
  const maximum = [allowFuture ? '' : dayjs(currentMonth + '-01').endOf('month').format('YYYY-MM-DD'), dateKey(max)].filter(Boolean).sort()[0] || '';
  return { minimum, maximum, loading: period.loading || Boolean(period.error) };
}
