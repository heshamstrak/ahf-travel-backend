import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { PrismaService } from "../prisma/prisma.service";
import { Public } from "../auth/jwt-auth.guard";

@Public()
@SkipThrottle()
@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Process is up. Does not touch dependencies. */
  @Get("live")
  @HttpCode(HttpStatus.OK)
  live(): { status: "ok" } {
    return { status: "ok" };
  }

  /** Process can serve traffic: the database answers a trivial query. */
  @Get("ready")
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<{ status: "ok"; database: "up" }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        code: "DEPENDENCY_UNAVAILABLE",
        title: "Database is unavailable",
      });
    }
    return { status: "ok", database: "up" };
  }
}
