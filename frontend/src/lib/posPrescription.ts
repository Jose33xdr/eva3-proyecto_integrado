type PrescriptionConfirmation = {
  product: { prescriptionType: string };
  prescriptionConfirmed: boolean;
  prescriptionRetained: boolean;
};

export const hasUnconfirmedPrescription = (
  items: readonly PrescriptionConfirmation[],
) =>
  items.some(
    (item) =>
      (item.product.prescriptionType !== "NONE" &&
        !item.prescriptionConfirmed) ||
      (item.product.prescriptionType === "RETAINED" &&
        !item.prescriptionRetained),
  );
