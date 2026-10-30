import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { Role } from "@prisma/client";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { CreateTourSessionDto, ListAllTourSessionsQuery, SetSessionStatusDto, SetTourSessionCapacityDto, UpdateTourSessionDto } from "./admin-tour-sessions.dto";
import { AdminTourSessionsService } from "./admin-tour-sessions.service";

/** The standalone, cross-tour "Tour Sessions" table — separate route from the nested
 *  `:tourId/sessions` controller below, same shared service. */
@Controller("admin/tour-sessions")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminTourSessionsIndexController {
  constructor(private readonly sessions: AdminTourSessionsService) {}

  @Get()
  listAll(@Query() query: ListAllTourSessionsQuery) {
    return this.sessions.listAll(query);
  }
}

@Controller("admin/tours/:tourId/sessions")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminTourSessionsController {
  constructor(private readonly sessions: AdminTourSessionsService) {}

  @Get()
  list(@Param("tourId") tourId: string) {
    return this.sessions.list(tourId);
  }

  @Get(":sessionId")
  get(@Param("tourId") tourId: string, @Param("sessionId") sessionId: string) {
    return this.sessions.get(tourId, sessionId);
  }

  @Post()
  create(@Param("tourId") tourId: string, @Body() dto: CreateTourSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.create(tourId, dto, adminActorFrom(user));
  }

  @Patch(":sessionId")
  update(@Param("tourId") tourId: string, @Param("sessionId") sessionId: string, @Body() dto: UpdateTourSessionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.update(tourId, sessionId, dto, adminActorFrom(user));
  }

  @Patch(":sessionId/capacity")
  setCapacity(@Param("tourId") tourId: string, @Param("sessionId") sessionId: string, @Body() dto: SetTourSessionCapacityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.setCapacity(tourId, sessionId, dto.capacity, adminActorFrom(user));
  }

  @Patch(":sessionId/status")
  setStatus(@Param("tourId") tourId: string, @Param("sessionId") sessionId: string, @Body() dto: SetSessionStatusDto, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.setStatus(tourId, sessionId, dto, adminActorFrom(user));
  }
}
