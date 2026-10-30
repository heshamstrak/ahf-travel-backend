import { Matches } from "class-validator";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Both ends required — the frontend always resolves "Today"/"7 Days"/"30 Days"/a custom range to
 *  explicit dates before calling this, so there is no implicit "default range" to get wrong here. */
export class DashboardAnalyticsQuery {
  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  from!: string;

  @Matches(DATE, { message: "must be a date (YYYY-MM-DD)" })
  to!: string;
}
