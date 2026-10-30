import { BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { Role } from "@prisma/client";
import { APP_CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/env";
import { AuthenticatedUser } from "../../auth/jwt-auth.guard";
import { CurrentUser, Roles, RolesGuard } from "../../common/authz";
import { adminActorFrom } from "../common/admin-actor";
import { ListMediaQuery, UpdateMediaDto, UploadMediaDto } from "./admin-media.dto";
import { AdminMediaService } from "./admin-media.service";

@Controller("admin/media")
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AdminMediaController {
  constructor(
    private readonly media: AdminMediaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  list(@Query() query: ListMediaQuery) {
    return this.media.list(query);
  }

  @Post()
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async upload(@Body() dto: UploadMediaDto, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException({ code: "VALIDATION_FAILED", title: "Some fields are invalid", errors: [{ field: "file", message: "is required" }] });
    return this.media.upload(dto, { buffer: file.buffer, size: file.size }, this.config.publicMediaMaxBytes, adminActorFrom(user));
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateMediaDto, @CurrentUser() user: AuthenticatedUser) {
    return this.media.update(id, dto, adminActorFrom(user));
  }

  @Patch(":id/file")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }))
  async replaceFile(@Param("id") id: string, @UploadedFile() file: Express.Multer.File | undefined, @CurrentUser() user: AuthenticatedUser) {
    if (!file) throw new BadRequestException({ code: "VALIDATION_FAILED", title: "Some fields are invalid", errors: [{ field: "file", message: "is required" }] });
    return this.media.replaceFile(id, { buffer: file.buffer, size: file.size }, this.config.publicMediaMaxBytes, adminActorFrom(user));
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.media.remove(id, adminActorFrom(user));
  }
}
