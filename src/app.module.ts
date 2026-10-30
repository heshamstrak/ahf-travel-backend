import { Inject, MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { APP_CONFIG, ConfigModule } from "./config/config.module";
import { ClockModule } from "./common/clock";
import type { AppConfig } from "./config/env";
import { RequestContextMiddleware } from "./common/request-context.middleware";
import { PrismaModule } from "./prisma/prisma.module";
import { MailModule } from "./mail/mail.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { DestinationsModule } from "./catalog/destinations/destinations.module";
import { LocationsModule } from "./catalog/locations/locations.module";
import { HotelsModule } from "./catalog/hotels/hotels.module";
import { ToursModule } from "./catalog/tours/tours.module";
import { CarsModule } from "./catalog/cars/cars.module";
import { TransfersModule } from "./catalog/transfers/transfers.module";
import { PackagesModule } from "./catalog/packages/packages.module";
import { QuotesModule } from "./quotes/quotes.module";
import { BookingsModule } from "./bookings/bookings.module";
import { PaymentsModule } from "./payments/payments.module";
import { PublicSettingsModule } from "./settings/public-settings.module";
import { AdminModule } from "./admin/admin.module";

@Module({
  imports: [
    ConfigModule,
    ClockModule,
    PrismaModule,
    MailModule,
    ThrottlerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        throttlers: [{ name: "default", ttl: 60_000, limit: 120 }],
        skipIf: () => !config.rateLimitEnabled,
      }),
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    DestinationsModule,
    LocationsModule,
    HotelsModule,
    ToursModule,
    CarsModule,
    TransfersModule,
    PackagesModule,
    QuotesModule,
    BookingsModule,
    PaymentsModule,
    PublicSettingsModule,
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes("*");
  }
}
