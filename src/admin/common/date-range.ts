export const MAX_RANGE_DAYS = 366;

/** Caller validates endDate >= startDate before calling this. Capped so a single request cannot
 *  ask for an unbounded number of date rows. */
export function datesBetween(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const dates: string[] = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
    if (dates.length > MAX_RANGE_DAYS) break;
  }
  return dates;
}
