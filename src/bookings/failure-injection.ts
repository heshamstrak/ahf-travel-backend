import { Injectable } from "@nestjs/common";

/**
 * A checkpoint the booking transaction calls through at five fixed points. In production this is a
 * no-op; nothing here ever reads an environment variable or a request header, so there is no runtime
 * switch that could accidentally be left on in production. Tests prove rollback safety by overriding
 * this provider in their own NestJS testing module (Test.createTestingModule(...).overrideProvider(...)),
 * which only ever happens inside a test process, never inside the running application.
 */
@Injectable()
export class BookingTransactionHooks {
  after(step: BookingTransactionStep): Promise<void> {
    // Intentionally empty in production. Tests override this provider to throw for a chosen step.
    void step;
    return Promise.resolve();
  }
}

export const BOOKING_TRANSACTION_STEPS = [
  "quote_consumed",
  "first_inventory_mutation",
  "booking_created",
  "booking_item_created",
  "inventory_held",
] as const;

export type BookingTransactionStep = (typeof BOOKING_TRANSACTION_STEPS)[number];
