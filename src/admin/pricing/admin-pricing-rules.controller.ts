import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { CreatePricingRuleDto, ListPricingRulesQuery, UpdatePricingRuleDto } from "./admin-pricing-rules.dto";
import { AdminPricingRulesService } from "./admin-pricing-rules.service";

@Controller("admin/pricing-rules")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminPricingRulesController {
  constructor(private readonly rules: AdminPricingRulesService) {}

  @Get()
  list(@Query() query: ListPricingRulesQuery) {
    return this.rules.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.rules.get(id);
  }

  @Post()
  create(@Body() dto: CreatePricingRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePricingRuleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.update(id, dto, adminActorFrom(user));
  }

  @Delete(":id")
  @HttpCode(204)
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rules.remove(id, adminActorFrom(user));
  }
}
