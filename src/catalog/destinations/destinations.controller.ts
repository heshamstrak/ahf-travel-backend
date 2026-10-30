import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../../auth/jwt-auth.guard";
import { parseIdOrSlug } from "../common/identifiers";
import { ListDestinationsQuery } from "./destinations.dto";
import { DestinationsService } from "./destinations.service";

@Public()
@Controller("destinations")
export class DestinationsController {
  constructor(private readonly destinations: DestinationsService) {}

  @Get()
  list(@Query() query: ListDestinationsQuery) {
    return this.destinations.list(query);
  }

  @Get(":idOrSlug")
  detail(@Param("idOrSlug") idOrSlug: string) {
    return this.destinations.detail(parseIdOrSlug(idOrSlug));
  }
}
