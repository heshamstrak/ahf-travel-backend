import { Controller, Get, Query } from "@nestjs/common";
import { Public } from "../../auth/jwt-auth.guard";
import { ListLocationsQuery } from "./locations.dto";
import { LocationsService } from "./locations.service";

@Public()
@Controller("locations")
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  list(@Query() query: ListLocationsQuery) {
    return this.locations.list(query);
  }
}
