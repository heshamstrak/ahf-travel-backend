import { Module } from "@nestjs/common";
import { BookingsModule } from "../bookings/bookings.module";
import { AdminPaymentsController } from "./admin-payments.controller";
import { PaymentTransactionHooks } from "./failure-injection";
import { InstapaySettingsService } from "./instapay-settings";
import { PaymentsController } from "./payments.controller";
import { PaymentsRepository } from "./payments.repository";
import { PaymentsService } from "./payments.service";
import { FILE_STORAGE, LocalFileStorage } from "./storage";

@Module({
  imports: [BookingsModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [
    PaymentsRepository,
    PaymentsService,
    PaymentTransactionHooks,
    InstapaySettingsService,
    { provide: FILE_STORAGE, useClass: LocalFileStorage },
  ],
})
export class PaymentsModule {}
