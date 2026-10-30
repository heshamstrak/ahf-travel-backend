import { Module } from "@nestjs/common";
import { BookingsController } from "./bookings.controller";
import { BookingsRepository } from "./bookings.repository";
import { BookingsService } from "./bookings.service";
import { BookingTransactionHooks } from "./failure-injection";
import { HoldExpirationService } from "./hold-expiration.service";
import { HoldExpirationScheduler } from "./hold-expiration.scheduler";

@Module({
  controllers: [BookingsController],
  providers: [BookingsRepository, BookingsService, BookingTransactionHooks, HoldExpirationService, HoldExpirationScheduler],
  exports: [HoldExpirationService, HoldExpirationScheduler, BookingsRepository, BookingsService],
})
export class BookingsModule {}
