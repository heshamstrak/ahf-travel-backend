import { Controller, Get, Query } from "@nestjs/common";
import { Public } from "../../auth/jwt-auth.guard";
import { TransferRatesQuery } from "./transfers.dto";
import { TransfersService } from "./transfers.service";

@Public()
@Controller("transfers")
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get("vehicle-classes")
  vehicleClasses() {
    return this.transfers.vehicleClasses();
  }

  @Get("rates")
  rates(@Query() query: TransferRatesQuery) {
    return this.transfers.rates(query);
  }
}
