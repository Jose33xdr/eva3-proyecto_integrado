import { describe, expect, it } from "vitest";
import { formatDateOnly, localDateBound } from "./dateBounds";

describe("date-only handling", () => {
  it("formats a stored UTC date without shifting its calendar day", () => {
    expect(formatDateOnly("2027-12-31T00:00:00.000Z")).toBe("31-12-2027");
  });

  it("converts selected local dates to inclusive time bounds", () => {
    expect(localDateBound("2026-11-17", "start")).toBe(
      new Date("2026-11-17T00:00:00.000").toISOString(),
    );
    expect(localDateBound("2026-11-17", "end")).toBe(
      new Date("2026-11-17T23:59:59.999").toISOString(),
    );
  });
});
