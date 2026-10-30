import { Injectable } from "@nestjs/common";

/**
 * The Milestone 5 counterpart of bookings/failure-injection.ts's BookingTransactionHooks: a no-op in
 * production, overridden only inside a test's own TestingModuleBuilder to prove that the payment /
 * confirmation transaction rolls back cleanly at each of five checkpoints.
 */
@Injectable()
export class PaymentTransactionHooks {
  after(step: PaymentTransactionStep): Promise<void> {
    void step;
    return Promise.resolve();
  }
}

export const PAYMENT_TRANSACTION_STEPS = [
  "payment_created",
  "booking_confirmed",
  "first_inventory_conversion",
  "inventory_converted",
  "proof_created",
] as const;

export type PaymentTransactionStep = (typeof PAYMENT_TRANSACTION_STEPS)[number];
