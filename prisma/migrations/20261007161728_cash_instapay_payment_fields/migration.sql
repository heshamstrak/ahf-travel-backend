-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "proofSubmittedAt" TIMESTAMP(3),
ADD COLUMN     "rejectionReason" VARCHAR(255),
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" UUID,
ADD COLUMN     "transferReference" VARCHAR(120),
ALTER COLUMN "providerName" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Payment_status_proofSubmittedAt_idx" ON "Payment"("status", "proofSubmittedAt");

-- Hand-written: Prisma does not model CHECK constraints. Mirrors the convention established in
-- 20261006202716_db_constraints_and_audit_immutability. The enum values these reference were added
-- by the previous migration, in its own committed transaction, so they are safe to use here.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_rejection_reason_required"
  CHECK ("status" <> 'REJECTED' OR "rejectionReason" IS NOT NULL);

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_manual_states_instapay_only"
  CHECK ("method" = 'INSTAPAY' OR "status" NOT IN ('PENDING_VERIFICATION', 'REJECTED'));
