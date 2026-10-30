import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/env";
import { HoldExpirationService } from "./hold-expiration.service";

/**
 * Wires HoldExpirationService.run() to an in-process timer, closing the operational gap left open
 * at the end of Milestone 4. No new infrastructure dependency: a plain `setInterval`, not
 * `@nestjs/schedule` or a queue, and no Redis.
 *
 * Safety does not come from this class. It comes entirely from the guarded status transition inside
 * `HoldExpirationService` (`WHERE status = 'PENDING_PAYMENT' AND holdExpiresAt < now`), which is
 * what actually decides whether a given booking's hold is released, exactly once:
 *  - Multiple application instances: each runs its own independent timer. Two instances' timers
 *    firing at the same moment race on the same rows at the database level; the guard resolves
 *    that race the same way two overlapping ticks on one instance would (see below) — whichever
 *    UPDATE commits first wins, the other affects zero rows.
 *  - Overlapping executions: `tick()` refuses to start a second run while one is still in flight (a
 *    plain in-memory flag), purely so this instance does not pile up redundant scans under load.
 *    This is an efficiency guard, not a correctness one — even without it, two overlapping calls to
 *    `run()` would still be safe, by the same guarded transition.
 *  - Confirmed bookings are never expired, and sold inventory is never released: a booking that has
 *    moved to CONFIRMED (cash or InstaPay approval) no longer matches `status = 'PENDING_PAYMENT'`,
 *    so `findExpiredCandidateIds` never selects it and `guardedExpire` would affect zero rows even
 *    if it somehow did.
 */
@Injectable()
export class HoldExpirationScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("HoldExpirationScheduler");
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly service: HoldExpirationService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit(): void {
    if (!this.config.holdSchedulerEnabled) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.config.holdSchedulerIntervalMs);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs one batch unless a previous call is still in flight on this instance. Exposed directly so
   *  tests can call it (including concurrently) without waiting on a real interval. */
  async tick(): Promise<Awaited<ReturnType<HoldExpirationService["run"]>> | { skipped: true }> {
    if (this.running) return { skipped: true };
    this.running = true;
    try {
      return await this.service.run();
    } catch (error) {
      this.logger.error("hold expiration tick failed", error instanceof Error ? error.stack : String(error));
      throw error;
    } finally {
      this.running = false;
    }
  }
}
