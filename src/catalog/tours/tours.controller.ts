import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../../auth/jwt-auth.guard";
import { parseIdOrSlug } from "../common/identifiers";
import { ListToursQuery, TourSessionsQuery } from "./tours.dto";
import { ToursService } from "./tours.service";

@Public()
@Controller("tours")
export class ToursController {
  constructor(private readonly tours: ToursService) {}

  @Get()
  list(@Query() query: ListToursQuery) {
    return this.tours.list(query);
  }

  @Get(":idOrSlug")
  detail(@Param("idOrSlug") idOrSlug: string) {
    return this.tours.detail(parseIdOrSlug(idOrSlug));
  }

  @Get(":idOrSlug/sessions")
  sessions(@Param("idOrSlug") idOrSlug: string, @Query() query: TourSessionsQuery) {
    return this.tours.sessions(parseIdOrSlug(idOrSlug), query);
  }
}
