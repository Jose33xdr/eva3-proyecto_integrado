import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  sale: {
    findMany: vi.fn(),
  },
};

vi.mock("../../config/prisma.js", () => ({
  prisma: mockPrisma,
}));

const { salesReport } = await import("./reports.service.js");

describe("Sales report date filtering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.sale.findMany.mockResolvedValue([]);
  });

  it("uses the last 30 days when no date range is supplied", async () => {
    await salesReport({});

    expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          saleDate: expect.objectContaining({ gte: expect.any(Date) }),
        }),
      }),
    );

    const filter = mockPrisma.sale.findMany.mock.calls[0]?.[0].where.saleDate;
    const expectedFrom = new Date();
    expectedFrom.setUTCHours(0, 0, 0, 0);
    expectedFrom.setUTCDate(expectedFrom.getUTCDate() - 29);
    expect(filter.gte).toEqual(expectedFrom);
  });

  it("uses the supplied local end-of-day instant for a selected range", async () => {
    const from = new Date("2026-10-01T00:00:00.000Z");
    const to = new Date("2026-11-01T02:59:59.999Z");

    await salesReport({ from, to });

    expect(mockPrisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "COMPLETED",
          saleDate: {
            gte: from,
            lte: to,
          },
        },
      }),
    );
  });
});
