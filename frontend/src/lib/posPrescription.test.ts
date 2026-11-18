import { describe, expect, it } from "vitest";
import { hasUnconfirmedPrescription } from "./posPrescription";

describe("prescription sale confirmation", () => {
  it("does not require prescription checks for products sold without a prescription", () => {
    expect(
      hasUnconfirmedPrescription([
        {
          product: { prescriptionType: "NONE" },
          prescriptionConfirmed: false,
          prescriptionRetained: false,
        },
      ]),
    ).toBe(false);
  });

  it("requires a review confirmation for simple prescriptions", () => {
    expect(
      hasUnconfirmedPrescription([
        {
          product: { prescriptionType: "SIMPLE" },
          prescriptionConfirmed: false,
          prescriptionRetained: false,
        },
      ]),
    ).toBe(true);
    expect(
      hasUnconfirmedPrescription([
        {
          product: { prescriptionType: "SIMPLE" },
          prescriptionConfirmed: true,
          prescriptionRetained: false,
        },
      ]),
    ).toBe(false);
  });

  it("requires both review and retention confirmations for retained prescriptions", () => {
    expect(
      hasUnconfirmedPrescription([
        {
          product: { prescriptionType: "RETAINED" },
          prescriptionConfirmed: true,
          prescriptionRetained: false,
        },
      ]),
    ).toBe(true);
    expect(
      hasUnconfirmedPrescription([
        {
          product: { prescriptionType: "RETAINED" },
          prescriptionConfirmed: false,
          prescriptionRetained: true,
        },
      ]),
    ).toBe(true);
    expect(
      hasUnconfirmedPrescription([
        {
          product: { prescriptionType: "RETAINED" },
          prescriptionConfirmed: true,
          prescriptionRetained: true,
        },
      ]),
    ).toBe(false);
  });
});
