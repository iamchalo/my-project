/**
 * Date utilities for Kenya timezone (Africa/Nairobi, UTC+3)
 */

const KENYA_TIMEZONE = 'Africa/Nairobi';
const KENYA_LOCALE = 'en-KE';

/**
 * Get current date in Kenya timezone as YYYY-MM-DD string (for database queries)
 */
export function getKenyaDateString(): string {
  const now = new Date();
  // Format in Kenya timezone
  const kenyaDate = now.toLocaleDateString('en-CA', { timeZone: KENYA_TIMEZONE });
  return kenyaDate; // Returns YYYY-MM-DD format
}

/**
 * Get current date object adjusted to Kenya timezone
 */
export function getKenyaDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: KENYA_TIMEZONE }));
}

/**
 * Format a date for display in Kenya locale
 */
export function formatDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleDateString(KENYA_LOCALE, {
    timeZone: KENYA_TIMEZONE,
    ...options,
  });
}

/**
 * Format time for display in Kenya locale
 */
export function formatTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleTimeString(KENYA_LOCALE, {
    timeZone: KENYA_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

/**
 * Format date and time together
 */
export function formatDateTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString(KENYA_LOCALE, {
    timeZone: KENYA_TIMEZONE,
    ...options,
  });
}

/**
 * Get formatted today's date for display (e.g., "Monday, November 18, 2025")
 */
export function getTodayFormatted(): string {
  return formatDate(new Date(), {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Get short date format (e.g., "Nov 18")
 */
export function getShortDate(date: Date | string): string {
  return formatDate(date, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get weekday name
 */
export function getWeekday(date: Date | string): string {
  return formatDate(date, {
    weekday: 'long',
  });
}

/**
 * Get month and year (e.g., "November 2025")
 */
export function getMonthYear(date: Date | string): string {
  return formatDate(date, {
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Get current hour in Kenya timezone (0-23)
 */
export function getKenyaHour(): number {
  const now = new Date();
  const kenyaHourStr = now.toLocaleString('en-US', {
    timeZone: KENYA_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  });
  return parseInt(kenyaHourStr, 10);
}
