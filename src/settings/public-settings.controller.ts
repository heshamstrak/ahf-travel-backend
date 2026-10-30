import { Controller, Get } from "@nestjs/common";
import { Public } from "../auth/jwt-auth.guard";
import { PublicSettingsService } from "./public-settings.service";

@Public()
@Controller("settings")
export class PublicSettingsController {
  constructor(private readonly settings: PublicSettingsService) {}

  @Get("branding")
  branding() {
    return this.settings.branding();
  }
}
