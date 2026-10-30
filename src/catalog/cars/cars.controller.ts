import { Controller, Get, Param, Query } from "@nestjs/common";
import { Public } from "../../auth/jwt-auth.guard";
import { parseIdOrSlug } from "../common/identifiers";
import { ListCarsQuery } from "./cars.dto";
import { CarsService } from "./cars.service";

@Public()
@Controller("cars")
export class CarsController {
  constructor(private readonly cars: CarsService) {}

  @Get()
  list(@Query() query: ListCarsQuery) {
    return this.cars.list(query);
  }

  @Get(":idOrSlug")
  detail(@Param("idOrSlug") idOrSlug: string) {
    return this.cars.detail(parseIdOrSlug(idOrSlug));
  }
}
