import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { RolesGuard } from "../common/authz";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    // Every route requires a valid session unless marked @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
