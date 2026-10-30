import { Inject, Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { ActorType, AuthTokenType, Prisma, Role, User, UserStatus } from "@prisma/client";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/env";
import { writeAudit, AuditActor } from "../common/audit";
import { Errors } from "../common/errors";
import type { RequestMeta } from "../common/request-context.middleware";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { burnPasswordTime, hashPassword, verifyPassword } from "../security/password";
import { generateOpaqueToken, hashToken } from "../security/crypto";
import { EdDsaJwt } from "../security/jwt";
import type { ChangePasswordDto, LoginDto, RegisterDto } from "./auth.dto";

export interface PublicUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  countryCode: string | null;
  language: string;
  currency: string;
  role: Role;
  emailVerified: boolean;
}

export interface SessionTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

export interface RefreshedTokens {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const log = new Logger("Auth");

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    countryCode: user.countryCode,
    language: user.language,
    currency: user.currency,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
  };
}

function actorOf(user: Pick<User, "id" | "email" | "firstName" | "lastName" | "role">): AuditActor {
  return {
    type: ActorType.USER,
    id: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
  };
}

const GUEST_ACTOR: AuditActor = { type: ActorType.GUEST, id: null };

@Injectable()
export class AuthService {
  private readonly jwt: EdDsaJwt;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly mail: MailService,
  ) {
    this.jwt = new EdDsaJwt({
      privateKeyPem: config.jwt.privateKeyPem,
      publicKeyPem: config.jwt.publicKeyPem,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      ttlSeconds: config.jwt.accessTtlSeconds,
    });
  }

  verifyAccessToken(token: string): { sub: string; role: string; sid: string } {
    return this.jwt.verifyAccessToken(token);
  }

  /** A session is alive while its refresh-token family has a non-revoked, unexpired member. */
  async isSessionActive(sid: string): Promise<boolean> {
    const count = await this.prisma.authToken.count({
      where: {
        familyId: sid,
        type: AuthTokenType.REFRESH,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    return count > 0;
  }

  // ---------- Registration and email verification ----------

  async register(dto: RegisterDto, meta: RequestMeta): Promise<void> {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      // Same response as a new registration. The owner is told, nothing is created.
      await this.mail.send({
        to: email,
        subject: "Your AHF Travel account",
        text: "Someone tried to register this email address. If it was you, sign in instead.",
      });
      return;
    }

    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            language: dto.language ?? "EN",
            currency: dto.currency ?? "EGP",
          },
        });
        await writeAudit(tx, {
          actor: actorOf(created),
          action: "auth.registered",
          aggregateType: "User",
          aggregateId: created.id,
          requestId: meta.requestId,
          ipAddress: meta.ipAddress,
        });
        return created;
      });
      await this.issueOneTimeToken(user, AuthTokenType.VERIFY_EMAIL, this.config.emailVerificationTtlHours * 60, "verify-email", "Verify your email");
    } catch (error) {
      // A concurrent registration with the same email won the race. Treat it as an existing account.
      if (isUniqueViolation(error)) return;
      throw error;
    }
  }

  async verifyEmail(token: string, meta: RequestMeta): Promise<void> {
    const row = await this.findUsableToken(token, AuthTokenType.VERIFY_EMAIL);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw Errors.invalidToken();
      const user = await tx.user.update({
        where: { id: row.userId },
        data: { emailVerifiedAt: row.user.emailVerifiedAt ?? now },
      });
      await writeAudit(tx, {
        actor: actorOf(user),
        action: "auth.email_verified",
        aggregateType: "User",
        aggregateId: user.id,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
    });
  }

  async resendVerification(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && user.emailVerifiedAt === null && user.status === UserStatus.ACTIVE) {
      await this.issueOneTimeToken(user, AuthTokenType.VERIFY_EMAIL, this.config.emailVerificationTtlHours * 60, "verify-email", "Verify your email");
    }
  }

  // ---------- Sign in and sessions ----------

  async login(dto: LoginDto, meta: RequestMeta): Promise<SessionTokens> {
    const email = dto.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      await burnPasswordTime(dto.password);
      await writeAudit(this.prisma, {
        actor: GUEST_ACTOR,
        action: "auth.login_failed",
        aggregateType: "User",
        aggregateId: "unknown",
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
      throw Errors.invalidCredentials();
    }

    const now = new Date();
    if (user.lockedUntil && user.lockedUntil > now) {
      const minutes = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 60000);
      throw Errors.accountLocked(minutes);
    }
    if (user.status !== UserStatus.ACTIVE) throw Errors.accountUnavailable();

    const passwordOk = await verifyPassword(user.passwordHash, dto.password);
    if (!passwordOk) {
      await this.recordFailedLogin(user.id, user);
      throw Errors.invalidCredentials();
    }
    if (user.emailVerifiedAt === null) throw Errors.emailNotVerified();

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null },
      });
      const issued = await this.createRefreshToken(tx, user.id, undefined, meta);
      await writeAudit(tx, {
        actor: actorOf(user),
        action: "auth.login_succeeded",
        aggregateType: "User",
        aggregateId: user.id,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
      return issued;
    });

    return {
      accessToken: this.jwt.signAccessToken({ sub: user.id, role: user.role, sid: session.familyId }),
      expiresIn: this.config.jwt.accessTtlSeconds,
      refreshToken: session.plain,
      refreshExpiresAt: session.expiresAt,
      user: toPublicUser({ ...user, emailVerifiedAt: user.emailVerifiedAt }),
    };
  }

  /**
   * Rotates the refresh token. The presented row is locked for the duration of the transaction,
   * so two concurrent requests with the same token cannot both succeed. A token that was already
   * rotated is evidence of theft: the whole session family is revoked.
   */
  async refresh(presented: string | undefined, meta: RequestMeta): Promise<RefreshedTokens> {
    if (!presented) throw Errors.invalidRefreshToken();
    const hash = hashToken(presented);

    type Outcome =
      | { kind: "invalid" }
      | { kind: "reuse" }
      | { kind: "ok"; userId: string; role: Role; familyId: string; plain: string; expiresAt: Date };

    const outcome: Outcome = await this.prisma.$transaction(async (tx): Promise<Outcome> => {
      const rows = await tx.$queryRaw<
        { id: string; userId: string; familyId: string | null; expiresAt: Date; revokedAt: Date | null; replacedById: string | null }[]
      >`SELECT id, "userId", "familyId", "expiresAt", "revokedAt", "replacedById"
          FROM "AuthToken"
         WHERE "tokenHash" = ${hash} AND type = 'REFRESH'
         FOR UPDATE`;
      const row = rows[0];
      if (!row || !row.familyId) return { kind: "invalid" };

      const now = new Date();
      if (row.replacedById !== null) {
        await tx.authToken.updateMany({
          where: { familyId: row.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        await writeAudit(tx, {
          actor: { type: ActorType.USER, id: row.userId },
          action: "auth.refresh_reuse_detected",
          aggregateType: "AuthTokenFamily",
          aggregateId: row.familyId,
          requestId: meta.requestId,
          ipAddress: meta.ipAddress,
        });
        return { kind: "reuse" };
      }
      if (row.revokedAt !== null || row.expiresAt <= now) return { kind: "invalid" };

      const user = await tx.user.findUnique({ where: { id: row.userId } });
      if (!user || user.status !== UserStatus.ACTIVE) {
        await tx.authToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: now } });
        return { kind: "invalid" };
      }

      const next = await this.createRefreshToken(tx, row.userId, row.familyId, meta);
      await tx.authToken.update({
        where: { id: row.id },
        data: { usedAt: now, revokedAt: now, replacedById: next.id },
      });
      return { kind: "ok", userId: row.userId, role: user.role, familyId: row.familyId, plain: next.plain, expiresAt: next.expiresAt };
    });

    if (outcome.kind !== "ok") {
      log.warn(`refresh rejected: ${outcome.kind}`);
      throw Errors.invalidRefreshToken();
    }
    return {
      accessToken: this.jwt.signAccessToken({ sub: outcome.userId, role: outcome.role, sid: outcome.familyId }),
      expiresIn: this.config.jwt.accessTtlSeconds,
      refreshToken: outcome.plain,
      refreshExpiresAt: outcome.expiresAt,
    };
  }

  async logout(presented: string | undefined, meta: RequestMeta): Promise<void> {
    if (!presented) return;
    const row = await this.prisma.authToken.findUnique({ where: { tokenHash: hashToken(presented) } });
    if (!row || row.type !== AuthTokenType.REFRESH || !row.familyId) return;
    const now = new Date();
    await this.prisma.authToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    const user = await this.prisma.user.findUnique({ where: { id: row.userId } });
    if (user) {
      await writeAudit(this.prisma, {
        actor: actorOf(user),
        action: "auth.logout",
        aggregateType: "AuthTokenFamily",
        aggregateId: row.familyId,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
    }
  }

  async logoutAll(userId: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.authToken.updateMany({
        where: { userId, type: AuthTokenType.REFRESH, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await writeAudit(tx, {
        actor: actorOf(user),
        action: "auth.logout_all",
        aggregateType: "User",
        aggregateId: userId,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
    });
  }

  // ---------- Password reset and change ----------

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user && user.status === UserStatus.ACTIVE) {
      await this.issueOneTimeToken(user, AuthTokenType.PASSWORD_RESET, this.config.passwordResetTtlMinutes, "reset-password", "Reset your password");
    }
  }

  async resetPassword(token: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const row = await this.findUsableToken(token, AuthTokenType.PASSWORD_RESET);
    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
      if (consumed.count !== 1) throw Errors.invalidToken();
      const user = await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });
      await tx.authToken.updateMany({
        where: { userId: row.userId, type: AuthTokenType.REFRESH, revokedAt: null },
        data: { revokedAt: now },
      });
      await writeAudit(tx, {
        actor: actorOf(user),
        action: "auth.password_reset",
        aggregateType: "User",
        aggregateId: user.id,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
    });
  }

  /** Changes the password and ends every other session. The current session stays signed in. */
  async changePassword(userId: string, dto: ChangePasswordDto, currentSid: string, meta: RequestMeta): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await verifyPassword(user.passwordHash, dto.currentPassword);
    if (!ok) throw Errors.wrongCurrentPassword();
    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.authToken.updateMany({
        where: { userId, type: AuthTokenType.REFRESH, revokedAt: null, NOT: { familyId: currentSid } },
        data: { revokedAt: new Date() },
      });
      await writeAudit(tx, {
        actor: actorOf(user),
        action: "auth.password_changed",
        aggregateType: "User",
        aggregateId: userId,
        requestId: meta.requestId,
        ipAddress: meta.ipAddress,
      });
    });
  }

  // ---------- Internals ----------

  private async recordFailedLogin(userId: string, user: User): Promise<void> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (updated.failedLoginCount >= this.config.loginMaxFailures) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + this.config.loginLockMinutes * 60_000),
        },
      });
    }
    await writeAudit(this.prisma, {
      actor: actorOf(user),
      action: "auth.login_failed",
      aggregateType: "User",
      aggregateId: userId,
    });
  }

  private async createRefreshToken(
    tx: Prisma.TransactionClient,
    userId: string,
    familyId: string | undefined,
    meta: RequestMeta,
  ): Promise<{ id: string; plain: string; familyId: string; expiresAt: Date }> {
    const plain = generateOpaqueToken();
    const expiresAt = new Date(Date.now() + this.config.refreshTtlDays * 86_400_000);
    const family = familyId ?? randomUUID();
    const row = await tx.authToken.create({
      data: {
        userId,
        type: AuthTokenType.REFRESH,
        tokenHash: hashToken(plain),
        familyId: family,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
        expiresAt,
      },
    });
    return { id: row.id, plain, familyId: family, expiresAt };
  }

  private async issueOneTimeToken(
    user: User,
    type: AuthTokenType,
    ttlMinutes: number,
    path: string,
    subject: string,
  ): Promise<void> {
    const plain = generateOpaqueToken();
    await this.prisma.authToken.create({
      data: {
        userId: user.id,
        type,
        tokenHash: hashToken(plain),
        expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
      },
    });
    await this.mail.send({
      to: user.email,
      subject,
      text: `${subject}: ${this.config.appOrigin}/${path}?token=${plain}\nThis link can be used once.`,
    });
  }

  private async findUsableToken(token: string, type: AuthTokenType) {
    const row = await this.prisma.authToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!row || row.type !== type || row.usedAt !== null || row.expiresAt <= new Date()) {
      throw Errors.invalidToken();
    }
    return row;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "P2002";
}

