import { Module } from "@nestjs/common";
import { AdminStaffModule } from "./staff/admin-staff.module";
import { AdminDashboardModule } from "./dashboard/admin-dashboard.module";
import { AdminDestinationsModule } from "./destinations/admin-destinations.module";
import { AdminLocationsModule } from "./locations/admin-locations.module";
import { AdminPoliciesModule } from "./policies/admin-policies.module";
import { AdminHotelsModule } from "./hotels/admin-hotels.module";
import { AdminToursModule } from "./tours/admin-tours.module";
import { AdminCarsModule } from "./cars/admin-cars.module";
import { AdminTransfersModule } from "./transfers/admin-transfers.module";
import { AdminPackagesModule } from "./packages/admin-packages.module";
import { AdminMediaModule } from "./media/admin-media.module";
import { AdminSettingsModule } from "./settings/admin-settings.module";
import { AdminBookingsModule } from "./bookings/admin-bookings.module";
import { AdminPricingRulesModule } from "./pricing/admin-pricing-rules.module";

/**
 * The whole admin surface, gathered in one place for AppModule to import. Payment review
 * (approve/reject InstaPay, record cash collected) already lives in PaymentsModule as of
 * Milestone 5 (AdminPaymentsController, `/admin/payments/...`) and is deliberately not
 * duplicated here — see the Milestone 6 report.
 */
@Module({
  imports: [
    AdminStaffModule,
    AdminDashboardModule,
    AdminDestinationsModule,
    AdminLocationsModule,
    AdminPoliciesModule,
    AdminHotelsModule,
    AdminToursModule,
    AdminCarsModule,
    AdminTransfersModule,
    AdminPackagesModule,
    AdminMediaModule,
    AdminSettingsModule,
    AdminBookingsModule,
    AdminPricingRulesModule,
  ],
})
export class AdminModule {}
