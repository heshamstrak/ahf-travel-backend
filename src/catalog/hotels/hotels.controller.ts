import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../../auth/jwt-auth.guard";
import { parseIdOrSlug } from "../common/identifiers";
import { ListHotelsQuery } from "./hotels.dto";
import { HotelsService } from "./hotels.service";

@Public()
@Controller("hotels")
export class HotelsController {
  constructor(private readonly hotels: HotelsService) {}

  @Get()
  search(@Query() query: ListHotelsQuery) {
    return this.hotels.search(query);
  }

  @Get(":idOrSlug")
  detail(@Param("idOrSlug") idOrSlug: string) {
    return this.hotels.detail(parseIdOrSlug(idOrSlug));
  }

  @Get(":idOrSlug/rooms")
  rooms(@Param("idOrSlug") idOrSlug: string) {
    return this.hotels.rooms(parseIdOrSlug(idOrSlug));
  }
}
