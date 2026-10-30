/**
 * Business calendar. Customers, inventory days and "today" are all Egypt local time, so every
 * date-only rule is evaluated in this zone. Date-only strings are never converted through UTC
 * first: 00:30 in Cairo is still yesterday in UTC.
 */
export const BUSINESS_TIME_ZONE = "Africa/Cairo";

const DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) of an instant in the business zone. */
export function businessDate(at: Date): string {
  return DATE_FORMAT.format(at);
}

/** The business date as a UTC-midnight Date, the form used for @db.Date columns. */
export function businessDay(at: Date): Date {
  return new Date(`${businessDate(at)}T00:00:00Z`);
}

/** Adds whole calendar days to a YYYY-MM-DD string without touching any time zone. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole calendar days from a to b (both YYYY-MM-DD). */
export function dayDifference(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Offset of a zone from UTC at an instant, in minutes (+120 for Cairo in winter, +180 during DST). */
export function zoneOffsetMinutes(at: Date, timeZone: string = BUSINESS_TIME_ZONE): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  })
    .formatToParts(at)
    .reduce<Record<string, number>>((acc, part) => {
      if (part.type !== "literal") acc[part.type] = Number(part.value);
      return acc;
    }, {});
  const wallAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  // The formatter drops milliseconds, so compare with the instant truncated to whole seconds.
  return Math.round((wallAsUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/**
 * The instant at which a wall-clock time occurs in the business zone. Handles the DST switch by
 * checking the offset at the candidate instant.
 */
export function zonedInstant(date: string, time: string, timeZone: string = BUSINESS_TIME_ZONE): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const first = new Date(wall - zoneOffsetMinutes(new Date(wall), timeZone) * 60_000);
  return new Date(wall - zoneOffsetMinutes(first, timeZone) * 60_000);
}

/** Returns a message when a date-only value is before the business today; otherwise null. */
export function pastDateMessage(value: string, today: string): string | null {
  return value < today ? "must not be in the past" : null;
}
