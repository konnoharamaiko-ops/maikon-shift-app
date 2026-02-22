import { useMemo } from 'react';
import { getDay, format, parseISO } from 'date-fns';

const dayOfWeekMap = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday'
};

/**
 * Custom hook to get store settings for a specific date
 * Returns: { isClosedDay, businessHours, staffRequirements, isHolidayException, closureInfo }
 */
export function useStoreSettingsForDate(store, dateStr) {
  return useMemo(() => {
    if (!store || !dateStr) return { isClosedDay: false, businessHours: null, staffRequirements: [], isHolidayException: false, closureInfo: null };

    const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
    const dayKey = dayOfWeekMap[getDay(date)];
    const dateFormatted = typeof dateStr === 'string' ? dateStr : format(dateStr, 'yyyy-MM-dd');

    // Check temporary closures
    const temporaryClosures = store.temporary_closures || [];
    const closureInfo = temporaryClosures.find(tc => {
      if (tc.date === dateFormatted) return true;
      if (tc.start_date && tc.end_date) {
        return dateFormatted >= tc.start_date && dateFormatted <= tc.end_date;
      }
      return false;
    });

    // Check holiday exceptions
    const holidayExceptions = store.holiday_exceptions || [];
    const isHolidayException = holidayExceptions.some(he => he.date === dateFormatted);

    // Get business hours for this day of week
    const businessHours = store.business_hours || {};
    const dayHours = businessHours[dayKey];
    const isClosedDay = dayHours?.is_closed === true || !!closureInfo;

    // Get staff requirements for this day
    const staffRequirements = (store.staff_requirements || []).filter(r => r.day_of_week === dayKey);

    return {
      isClosedDay,
      businessHours: dayHours,
      staffRequirements,
      isHolidayException,
      closureInfo,
    };
  }, [store, dateStr]);
}

/**
 * Get store settings for a date (non-hook version for use in loops)
 */
export function getStoreSettingsForDate(store, dateStr) {
  if (!store || !dateStr) return { isClosedDay: false, businessHours: null, staffRequirements: [], isHolidayException: false, closureInfo: null };

  const date = typeof dateStr === 'string' ? parseISO(dateStr) : dateStr;
  const dayKey = dayOfWeekMap[getDay(date)];
  const dateFormatted = typeof dateStr === 'string' ? dateStr : format(dateStr, 'yyyy-MM-dd');

  // Check temporary closures
  const temporaryClosures = store.temporary_closures || [];
  const closureInfo = temporaryClosures.find(tc => {
    if (tc.date === dateFormatted) return true;
    if (tc.start_date && tc.end_date) {
      return dateFormatted >= tc.start_date && dateFormatted <= tc.end_date;
    }
    return false;
  });

  // Check holiday exceptions
  const holidayExceptions = store.holiday_exceptions || [];
  const isHolidayException = holidayExceptions.some(he => he.date === dateFormatted);

  // Get business hours for this day of week
  const businessHours = store.business_hours || {};
  const dayHours = businessHours[dayKey];
  const isClosedDay = dayHours?.is_closed === true || !!closureInfo;

  // Get staff requirements for this day
  const staffRequirements = (store.staff_requirements || []).filter(r => r.day_of_week === dayKey);

  return {
    isClosedDay,
    businessHours: dayHours,
    staffRequirements,
    isHolidayException,
    closureInfo,
  };
}
