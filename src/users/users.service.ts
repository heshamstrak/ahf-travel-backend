import { Injectable } from "@nestjs/common";
import { ActorType } from "@prisma/client";
import { writeAudit } from "../common/audit";
import { Errors } from "../common/errors";
import type { RequestMeta } from "../common/request-context.middleware";
import { PrismaService } from "../prisma/prisma.service";
import { PublicUser, toPublicUser } from "../auth/auth.service";
import type { UpdatePreferencesDto, UpdateProfileDto } from "./users.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt) throw Errors.notFound("Account");
    return toPublicUser(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto, meta: RequestMeta): Promise<PublicUser> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
          ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.countryCode !== undefined ? { countryCode: dto.countryCode } : {}),
        },
      });
      await writeAudit(tx, {
        actor: { type: ActorType.USER, id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, role: user.role },
        action: "user.profile_updated",
        aggregateType: "User",
        aggregateId: userId,
        // Field names only: values can be personal data and the event must stay minimal.
        after: { changedFields: Object.keys(dto) },
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
      return user;
    });
    return toPublicUser(updated);
  }

  async updatePreferences(userId: string, dto: UpdatePreferencesDto, meta: RequestMeta): Promise<PublicUser> {
    const updated = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: {
          ...(dto.language !== undefined ? { language: dto.language } : {}),
          ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        },
      });
      await writeAudit(tx, {
        actor: { type: ActorType.USER, id: user.id, email: user.email, name: `${user.firstName} ${user.lastName}`, role: user.role },
        action: "user.preferences_updated",
        aggregateType: "User",
        aggregateId: userId,
        after: { language: user.language, currency: user.currency },
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
      return user;
    });
    return toPublicUser(updated);
  }
}
