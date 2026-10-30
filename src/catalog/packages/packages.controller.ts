import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../../auth/jwt-auth.guard";
import { parseIdOrSlug } from "../common/identifiers";
import { ListPackagesQuery, PackageDeparturesQuery } from "./packages.dto";
import { PackagesService } from "./packages.service";

@Public()
@Controller("packages")
export class PackagesController {
  constructor(private readonly packages: PackagesService) {}

  @Get()
  list(@Query() query: ListPackagesQuery) {
    return this.packages.list(query);
  }

  @Get(":idOrSlug")
  detail(@Param("idOrSlug") idOrSlug: string) {
    return this.packages.detail(parseIdOrSlug(idOrSlug));
  }

  @Get(":idOrSlug/departures")
  departures(@Param("idOrSlug") idOrSlug: string, @Query() query: PackageDeparturesQuery) {
    return this.packages.departures(parseIdOrSlug(idOrSlug), query);
  }
}
