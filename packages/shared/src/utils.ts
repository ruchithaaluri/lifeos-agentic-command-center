// ============================================================
// LifeOS Shared Utilities
// ============================================================

/**
 * Format a datetime string to a human-readable time (e.g. "9:30 AM")
 */
export function formatTime(datetime: string, timezone?: string): string {
  return new Date(datetime).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone ?? 'UTC',
  });
}

/**
 * Format a datetime string to a human-readable date (e.g. "Sep 25, 2026")
 */
export function formatDate(datetime: string, timezone?: string): string {
  return new Date(datetime).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone ?? 'UTC',
  });
}

/**
 * Get YYYY-MM-DD string for a Date object (or now)
 */
export function toDateString(date: Date = new Date(), timezone?: string): string {
  if (timezone) {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch {
      // fallback
    }
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Get today's date string in YYYY-MM-DD format
 */
export function today(timezone?: string): string {
  return toDateString(new Date(), timezone);
}

/**
 * Get tomorrow's date string in YYYY-MM-DD format
 */
export function tomorrow(timezone?: string): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateString(d, timezone);
}

/**
 * Add minutes to an ISO datetime string and return a new ISO string
 */
export function addMinutes(datetime: string, minutes: number): string {
  const d = new Date(datetime);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
}

/**
 * Compute duration in minutes between two ISO datetime strings
 */
export function durationMinutes(start: string, end: string): number {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

/**
 * Check if two time intervals overlap
 */
export function doIntervalsOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string },
): boolean {
  const aStart = new Date(a.start).getTime();
  const aEnd = new Date(a.end).getTime();
  const bStart = new Date(b.start).getTime();
  const bEnd = new Date(b.end).getTime();
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Generate a compact random ID (not cryptographically secure — use uuid for DB IDs)
 */
export function nanoid(len = 10): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join(
    '',
  );
}

/**
 * Clamp a number between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Truncate a string to maxLength, appending "…" if truncated
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + '…';
}

/**
 * Group an array by a key function
 */
export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}

/**
 * Create a UTC Date for a local date + time in a given IANA timezone
 */
export function getLocalDate(dateStr: string, timeStr: string, timeZone = 'UTC'): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour = 0, minute = 0, second = 0] = timeStr.split(':').map(Number);

  if (!year || !month || !day) return new Date(`${dateStr}T${timeStr}:00.000Z`);
  if (!timeZone || timeZone === 'UTC') {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }

  try {
    let approx = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    for (let iter = 0; iter < 2; iter++) {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      const parts = formatter.formatToParts(approx);
      const getPart = (t: string) => parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
      const y = getPart('year');
      const m = getPart('month');
      const d = getPart('day');
      let h = getPart('hour');
      if (h === 24) h = 0;
      const min = getPart('minute');
      const s = getPart('second');

      const localAsUtc = Date.UTC(y, m - 1, d, h, min, s);
      const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
      const error = localAsUtc - targetAsUtc;
      if (Math.abs(error) < 1000) break;
      approx = new Date(approx.getTime() - error);
    }
    return approx;
  } catch {
    return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  }
}

/**
 * Find contiguous non-overlapping free time windows between windowStart and windowEnd
 * that do not intersect with any existing calendar events.
 */
export function findAvailableSlots(
  windowStart: Date,
  windowEnd: Date,
  existingEvents: Array<{ start: Date; end: Date }>,
): Array<{ start: Date; end: Date }> {
  if (windowEnd <= windowStart) return [];

  // Filter and clip events that overlap the window
  const overlapping = existingEvents
    .filter((e) => e.end > windowStart && e.start < windowEnd)
    .map((e) => ({
      start: e.start < windowStart ? windowStart : e.start,
      end: e.end > windowEnd ? windowEnd : e.end,
    }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const slots: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(windowStart);

  for (const event of overlapping) {
    if (event.start.getTime() > cursor.getTime()) {
      slots.push({ start: new Date(cursor), end: new Date(event.start) });
    }
    if (event.end.getTime() > cursor.getTime()) {
      cursor = new Date(event.end);
    }
  }

  if (cursor.getTime() < windowEnd.getTime()) {
    slots.push({ start: new Date(cursor), end: new Date(windowEnd) });
  }

  return slots;
}
