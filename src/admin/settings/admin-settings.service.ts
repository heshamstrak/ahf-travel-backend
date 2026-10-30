import { Injectable } from "@nestjs/common";
import { Errors } from "../../common/errors";
import { writeAudit } from "../../common/audit";
import { PrismaService } from "../../prisma/prisma.service";
import { AdminActor, auditActorOf } from "../common/admin-actor";
import { ALLOWED_SETTING_KEYS, AllowedSettingKey, validateSettingValue } from "./allowed-settings";
import type { Prisma } from "@prisma/client";

@Injectable()
export class AdminSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.setting.findMany({ where: { key: { in: [...ALLOWED_SETTING_KEYS] } } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return ALLOWED_SETTING_KEYS.map((key) => ({ key, value: byKey.get(key)?.value ?? null, updatedAt: byKey.get(key)?.updatedAt?.toISOString() ?? null }));
  }

  async update(key: AllowedSettingKey, rawValue: unknown, actor: AdminActor) {
    let value: unknown;
    try {
      value = validateSettingValue(key, rawValue);
    } catch (error) {
      throw Errors.conflict("VALIDATION_FAILED", error instanceof Error ? error.message : "Invalid setting value");
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.setting.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue, updatedById: actor.id },
        update: { value: value as Prisma.InputJsonValue, updatedById: actor.id },
      });
      await writeAudit(tx, { actor: auditActorOf(actor), action: "setting.updated", aggregateType: "Setting", aggregateId: key, after: { key, value: value as Prisma.InputJsonValue } });
      return updated;
    });
    return { key: row.key, value: row.value, updatedAt: row.updatedAt.toISOString() };
  }
}
