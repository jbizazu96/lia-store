import {describe, expect, it} from "vitest";
import {
  localDateKey,
  localHour,
  storeAnalyticsRange,
} from "../../functions/src/reporting/storeAnalyticsPeriod";

describe("store analytics calendar periods", () => {
  const now = new Date("2026-08-13T17:00:00.000Z");

  it("uses a Monday-to-Monday calendar week in the store timezone", () => {
    const range = storeAnalyticsRange("week", "America/Chicago", now);
    expect(range.start.toISOString()).toBe("2026-08-10T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-17T05:00:00.000Z");
    expect(range.previousStart.toISOString()).toBe("2026-08-03T05:00:00.000Z");
    expect(range.previousEnd.toISOString()).toBe(range.start.toISOString());
  });

  it("uses real calendar months instead of rolling 30-day windows", () => {
    const range = storeAnalyticsRange("month", "America/Chicago", now);
    expect(range.start.toISOString()).toBe("2026-08-01T05:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-01T05:00:00.000Z");
    expect(range.previousStart.toISOString()).toBe("2026-07-01T05:00:00.000Z");
  });

  it("honors daylight-saving offsets at year boundaries", () => {
    const range = storeAnalyticsRange("year", "America/Chicago", now);
    expect(range.start.toISOString()).toBe("2026-01-01T06:00:00.000Z");
    expect(range.end.toISOString()).toBe("2027-01-01T06:00:00.000Z");
  });

  it("groups timestamps by the store's local date and hour", () => {
    const timestamp = new Date("2026-08-14T04:30:00.000Z");
    expect(localDateKey(timestamp, "America/Chicago", false)).toBe("2026-08-13");
    expect(localHour(timestamp, "America/Chicago")).toBe(23);
    expect(localDateKey(timestamp, "America/New_York", false)).toBe("2026-08-14");
    expect(localHour(timestamp, "America/New_York")).toBe(0);
  });
});
