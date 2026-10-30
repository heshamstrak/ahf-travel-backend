import { Injectable, Logger } from "@nestjs/common";
import { Clock } from "../common/clock";
import { writeAudit } from "../common/audit";
import { PrismaService } from "../prisma/prisma.service";
import { BookingsRepository } from "./bookings.repository";
import { releaseBookingItem } from "./inventory-hold";

/**
 * Releases expired holds. Wired to a scheduler by HoldExpirationScheduler (Milestone 5); `run()` is
 * the complete, tested unit it calls on a timer. It is safe to call from several application
 * instances at once, and safe to call repeatedly: the guarded status transition in `guardedExpire`
 * is what decides who performs a given release, not anything in this class. A booking already moved
 * out of PENDING_PAYMENT (by this worker, by a cancellation, by a payment confirmation, or because
 * it no longer qualifies) is simply skipped.
 */
@Injectable()
export class HoldExpirationService {
  private readonly logger = new Logger("HoldExpirationService");

  constructor(
    private readonly repo: BookingsRepository,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /**
   * One candidate failing to expire (an unexpected error, not just "lost the guard") must never
   * stop the rest of the batch from being processed — otherwise a single bad row would silently
   * block every other overdue hold in the same scan, indefinitely, on every future run too. Each
   * candidate's failure is logged and counted; the scan continues.
   */
  async run(batchSize = 50): Promise<{ scanned: number; expired: number; failed: number }> {
    const now = this.clock.now();
    const candidates = await this.repo.findExpiredCandidateIds(now, batchSize);
    let expired = 0;
    let failed = 0;
    for (const candidate of candidates) {
      try {
        if (await this.expireOne(candidate.id, now)) expired++;
      } catch (error) {
        failed++;
        this.logger.error(`failed to expire booking ${candidate.id}`, error instanceof Error ? error.stack : String(error));
      }
    }
    return { scanned: candidates.length, expired, failed };
  }

  /** One short transaction per booking, so no release ever holds a lock longer than it has to. */
  private async expireOne(bookingId: string, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const guarded = await this.repo.guardedExpire(tx, bookingId, now);
      if (!guarded) return false;

      const items = await this.repo.itemsOf(tx, bookingId);
      for (const item of items) await releaseBookingItem(tx, item);
      await this.repo.updateBookingItemsStatus(tx, bookingId, "EXPIRED");

      await writeAudit(tx, { actor: { type: "SYSTEM" }, action: "hold.expired", aggregateType: "Booking", aggregateId: bookingId, after: {} });
      await writeAudit(tx, {
        actor: { type: "SYSTEM" },
        action: "inventory.released",
        aggregateType: "Booking",
        aggregateId: bookingId,
        after: { reason: "hold_expired" },
      });
      return true;
    });
  }
}
