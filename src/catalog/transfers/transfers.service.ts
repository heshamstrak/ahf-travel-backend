import { Injectable } from "@nestjs/common";
import { businessDate, pastDateMessage } from "../../common/business-date";
import { Clock } from "../../common/clock";
import { validationFailed } from "../../common/errors";
import { MediaReader, PublicImage } from "../common/media";
import { moneyAmount } from "../common/money";
import { isValidIsoDate, Page, toPage, utcDate } from "../common/query";
import { TransferRatesQuery } from "./transfers.dto";
import { TransfersRepository } from "./transfers.repository";

export interface VehicleClassView {
  id: string;
  code: string;
  name: string;
  passengersMax: number;
  luggageMax: number;
  features: string[];
  image: PublicImage | null;
}

export interface TransferRateView {
  id: string;
  amount: { amount: string; currency: string };
  durationMinutes: number;
  origin: { id: string; name: string; code: string | null; type: string };
  destination: { id: string; name: string; code: string | null; type: string };
  vehicleClass: Omit<VehicleClassView, "id">;
  validDate: string;
  /** DEV_PLACEHOLDER rows are development values, not confirmed business prices. */
  priceBasis: "CONFIRMED" | "DEV_PLACEHOLDER";
  echo: { time: string | null; passengers: number; luggage: number };
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly repo: TransfersRepository,
    private readonly media: MediaReader,
    private readonly clock: Clock,
  ) {}

  /** Small reference list (at most a handful of classes), so it is not paginated. */
  async vehicleClasses(): Promise<{ items: VehicleClassView[] }> {
    const classes = await this.repo.vehicleClasses();
    const covers = await this.media.coversByOwner(
      "TRANSFER_VEHICLE_CLASS",
      classes.map((c) => c.id),
    );
    return {
      items: classes.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        passengersMax: c.passengersMax,
        luggageMax: c.luggageMax,
        features: c.features,
        image: covers.get(c.id) ?? null,
      })),
    };
  }

  async rates(query: TransferRatesQuery): Promise<Page<TransferRateView>> {
    if (query.originLocationId === query.destinationLocationId) {
      throw validationFailed([{ field: "destinationLocationId", message: "must differ from originLocationId" }]);
    }
    const today = businessDate(this.clock.now());
    if (query.date !== undefined && !isValidIsoDate(query.date)) {
      throw validationFailed([{ field: "date", message: "must be a real calendar date" }]);
    }
    const past = query.date !== undefined ? pastDateMessage(query.date, today) : null;
    if (past) throw validationFailed([{ field: "date", message: past }]);
    const date = utcDate(query.date ?? today);
    const passengers = query.passengers ?? 1;
    const luggage = query.luggage ?? 0;
    const { rows, total } = await this.repo.rates({
      originLocationId: query.originLocationId,
      destinationLocationId: query.destinationLocationId,
      date,
      passengers,
      luggage,
      page: query.page,
      pageSize: query.pageSize,
    });
    const covers = await this.media.coversByOwner(
      "TRANSFER_VEHICLE_CLASS",
      [...new Set(rows.map((row) => row.vehicleClassId))],
    );
    const items: TransferRateView[] = rows.map((row) => ({
      id: row.id,
      amount: { amount: moneyAmount(row.amount) as string, currency: row.currency },
      durationMinutes: row.durationMinutes,
      origin: row.origin,
      destination: row.destination,
      vehicleClass: {
        code: row.vehicleClass.code,
        name: row.vehicleClass.name,
        passengersMax: row.vehicleClass.passengersMax,
        luggageMax: row.vehicleClass.luggageMax,
        features: row.vehicleClass.features,
        image: covers.get(row.vehicleClassId) ?? null,
      },
      validDate: date.toISOString().slice(0, 10),
      priceBasis: row.isDevPlaceholder ? "DEV_PLACEHOLDER" : "CONFIRMED",
      echo: { time: query.time ?? null, passengers, luggage },
    }));
    return toPage(items, query, total);
  }
}
