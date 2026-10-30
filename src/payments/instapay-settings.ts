import { Injectable } from "@nestjs/common";
import { z } from "zod";
import { PrismaService } from "../prisma/prisma.service";

const SETTING_KEY = "payment.instapay";

const instapaySettingSchema = z.object({
  recipientName: z.string().min(1),
  handle: z.string().min(1),
  instructionsText: z.string().min(1),
});

export type InstapayInstructions = z.infer<typeof instapaySettingSchema>;

/**
 * Reads the InstaPay payment instructions (recipient name, handle/account, free-text instructions)
 * from the `Setting` table — never hard-coded in controller or frontend code. Only this one key is
 * ever exposed; nothing else in `Setting` is reachable through the payments module.
 */
@Injectable()
export class InstapaySettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInstructions(): Promise<InstapayInstructions> {
    const row = await this.prisma.setting.findUnique({ where: { key: SETTING_KEY } });
    if (!row) throw new Error(`Setting "${SETTING_KEY}" is not configured`);
    return instapaySettingSchema.parse(row.value);
  }
}
