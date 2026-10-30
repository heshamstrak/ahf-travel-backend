import { ActorType, Prisma } from "@prisma/client";

export interface AuditActor {
  type: ActorType;
  /** Kept as a plain id with no foreign key: the record must survive account deletion. */
  id?: string | null;
  /** Snapshots taken when the event is written, so the record stays readable if the account is later removed. */
  email?: string | null;
  name?: string | null;
  role?: string | null;
}

export interface AuditInput {
  actor: AuditActor;
  action: string;
  aggregateType: string;
  aggregateId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  requestId?: string;
  ipAddress?: string;
}

/** Minimal client surface needed to write an audit row (works inside or outside a transaction). */
export interface AuditWriter {
  auditEvent: { create: (args: { data: Prisma.AuditEventUncheckedCreateInput }) => Promise<unknown> };
}

/**
 * Writes an append-only AuditEvent. Call it with the transaction client so the audit row
 * commits or rolls back together with the change it describes.
 */
export async function writeAudit(db: AuditWriter, input: AuditInput): Promise<void> {
  await db.auditEvent.create({
    data: {
      actorType: input.actor.type,
      actorId: input.actor.id ?? null,
      actorEmail: input.actor.email ?? null,
      actorName: input.actor.name ?? null,
      actorRole: input.actor.role ?? null,
      action: input.action,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      before: input.before ?? Prisma.JsonNull,
      after: input.after ?? Prisma.JsonNull,
      requestId: input.requestId ?? null,
      ipAddress: input.ipAddress ?? null,
    },
  });
}
