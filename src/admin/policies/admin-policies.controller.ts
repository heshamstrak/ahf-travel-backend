import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { PageQueryDto } from "../../catalog/common/query";
import { adminActorFrom } from "../common/admin-actor";
import { CreatePolicyDto, UpdatePolicyDto } from "./admin-policies.dto";
import { AdminPoliciesService } from "./admin-policies.service";

@Controller("admin/cancellation-policies")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminPoliciesController {
  constructor(private readonly policies: AdminPoliciesService) {}

  @Get()
  list(@Query() query: PageQueryDto) {
    return this.policies.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.policies.get(id);
  }

  @Post()
  create(@Body() dto: CreatePolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.policies.create(dto, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePolicyDto, @CurrentUser() user: AuthenticatedUser) {
    return this.policies.update(id, dto, adminActorFrom(user));
  }
}
