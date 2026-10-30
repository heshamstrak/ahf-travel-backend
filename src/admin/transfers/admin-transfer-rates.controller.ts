import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { PageQueryDto } from "../../catalog/common/query";
import { adminActorFrom } from "../common/admin-actor";
import { CreateTransferRateDto, UpdateTransferRateDto } from "./admin-transfer-rates.dto";
import { AdminTransferRatesService } from "./admin-transfer-rates.service";

@Controller("admin/transfer-rates")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminTransferRatesController {
  constructor(private readonly rates: AdminTransferRatesService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.rates.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.rates.get(id);
  }

  @Post()
  create(@Body() dto: CreateTransferRateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rates.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateTransferRateDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rates.update(id, dto, adminActorFrom(user));
  }
}
