import {
  addDays,
  businessDate,
  businessDay,
  dayDifference,
  pastDateMessage,
  zoneOffsetMinutes,
  zonedInstant,
} from "./business-date";

describe("business date (Africa/Cairo)", () => {
  it("uses the Cairo calendar date, not the UTC date", () => {
    // 22:30 UTC on 6 October is 01:30 on 7 October in Cairo (UTC+3 during DST).
    expect(businessDate(new Date("2026-10-06T22:30:00Z"))).toBe("2026-10-07");
    expect(businessDay(new Date("2026-10-06T22:30:00Z")).toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("follows the winter offset as well as the summer one", () => {
    // 23:30 UTC on 15 January is 01:30 on 16 January in Cairo (UTC+2 in winter).
    expect(businessDate(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-16");
    expect(zoneOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(120);
    expect(zoneOffsetMinutes(new Date("2026-10-10T12:00:00Z"))).toBe(180);
  });

  it("places a wall-clock time at the right instant in each season", () => {
    // 08:00 Cairo is 05:00 UTC in October (UTC+3) and 06:00 UTC in January (UTC+2).
    expect(zonedInstant("2026-10-10", "08:00").toISOString()).toBe("2026-10-10T05:00:00.000Z");
    expect(zonedInstant("2026-01-10", "08:00").toISOString()).toBe("2026-01-10T06:00:00.000Z");
    expect(zonedInstant("2026-10-10", "20:00").toISOString()).toBe("2026-10-10T17:00:00.000Z");
  });

  it("adds and subtracts calendar days without time zone effects", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(dayDifference("2026-10-10", "2026-10-13")).toBe(3);
    expect(dayDifference("2026-10-13", "2026-10-10")).toBe(-3);
  });

  it("refuses a date before the business today, and allows today", () => {
    expect(pastDateMessage("2026-10-06", "2026-10-07")).toBe("must not be in the past");
    expect(pastDateMessage("2026-10-07", "2026-10-07")).toBeNull();
    expect(pastDateMessage("2026-10-08", "2026-10-07")).toBeNull();
  });
});
