-- Split from the columns/constraints migration that follows it: PostgreSQL will not let a newly
-- added enum value be referenced (e.g. by a CHECK constraint) in the same transaction that adds it.
-- This migration only adds the enum values, so they are committed before anything uses them.

-- AlterEnum
ALTER TYPE "MediaOwnerType" ADD VALUE 'PAYMENT_PROOF';

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'INSTAPAY';

-- AlterEnum
ALTER TYPE "PaymentState" ADD VALUE 'PENDING_VERIFICATION';
ALTER TYPE "PaymentState" ADD VALUE 'REJECTED';
