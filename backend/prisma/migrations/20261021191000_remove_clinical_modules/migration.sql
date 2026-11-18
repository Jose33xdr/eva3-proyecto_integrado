DROP TABLE IF EXISTS "sale_coverages" CASCADE;
DROP TABLE IF EXISTS "patient_coverages" CASCADE;
DROP TABLE IF EXISTS "agreement_benefits" CASCADE;
DROP TABLE IF EXISTS "agreement_plans" CASCADE;
DROP TABLE IF EXISTS "agreements" CASCADE;
DROP TABLE IF EXISTS "controlled_drug_records" CASCADE;
DROP TABLE IF EXISTS "dispensation_items" CASCADE;
DROP TABLE IF EXISTS "dispensations" CASCADE;
DROP TABLE IF EXISTS "prescription_items" CASCADE;
DROP TABLE IF EXISTS "prescriptions" CASCADE;
DROP TABLE IF EXISTS "patients" CASCADE;
DROP TABLE IF EXISTS "doctors" CASCADE;
DROP TABLE IF EXISTS "laboratories" CASCADE;

ALTER TABLE "sales" DROP COLUMN IF EXISTS "patientId";
ALTER TABLE "sales" DROP COLUMN IF EXISTS "coverageAmount";
ALTER TABLE "sale_items" DROP COLUMN IF EXISTS "prescriptionItemId";
ALTER TABLE "products" DROP COLUMN IF EXISTS "laboratoryId";
ALTER TABLE "products" DROP COLUMN IF EXISTS "controlledDrugType";
ALTER TABLE "products" DROP COLUMN IF EXISTS "requiresPrescription";
ALTER TABLE "products" DROP COLUMN IF EXISTS "isControlled";

ALTER TABLE "products" ALTER COLUMN "prescriptionType" DROP DEFAULT;
ALTER TABLE "products" ALTER COLUMN "prescriptionType" TYPE TEXT
  USING "prescriptionType"::TEXT;
DROP TYPE "PrescriptionType";
CREATE TYPE "PrescriptionType" AS ENUM ('NONE', 'SIMPLE', 'RETAINED');
ALTER TABLE "products" ALTER COLUMN "prescriptionType" TYPE "PrescriptionType"
  USING (
    CASE
      WHEN "prescriptionType" IN ('CHECK', 'BALANCE_CONTROL') THEN 'RETAINED'
      ELSE "prescriptionType"
    END
  )::"PrescriptionType";
ALTER TABLE "products" ALTER COLUMN "prescriptionType" SET DEFAULT 'NONE';
DROP TYPE "ControlledDrugType";

ALTER TABLE "sale_items"
  ADD COLUMN "prescriptionType" "PrescriptionType" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "prescriptionConfirmed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "prescriptionRetained" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "alerts" ALTER COLUMN "type" TYPE TEXT USING "type"::TEXT;
DROP TYPE "AlertType";
CREATE TYPE "AlertType" AS ENUM (
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'EXPIRING_SOON',
  'EXPIRED',
  'OTHER'
);
ALTER TABLE "alerts" ALTER COLUMN "type" TYPE "AlertType"
  USING (
    CASE
      WHEN "type" IN ('CONTROLLED_STOCK', 'PRESCRIPTION_EXPIRING') THEN 'OTHER'
      ELSE "type"
    END
  )::"AlertType";
