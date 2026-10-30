import { PricingRejection } from "./errors";
import {
  assertDriverAge,
  assertTransferParty,
  hotelLines,
  HotelStay,
  packageLines,
  PackageInput,
  rentalDays,
  splitAcross,
  tourLines,
} from "./calculators";
import { formatMoney, Money, money, parseMoney } from "./money";

const egp = (value: string): Money => parseMoney(value, "EGP");
const nightDates = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `2026-10-${String(10 + index).padStart(2, "0")}`);

function stay(overrides: Partial<HotelStay> = {}): HotelStay {
  return {
    nightDates: nightDates(2),
    nightlyOverrides: new Map(),
    rooms: 1,
    adults: 2,
    children: 0,
    rate: {
      basePerNight: egp("6800.00"),
      baseOccupancy: 2,
      maxAdults: 2,
      maxChildren: 0,
      extraAdultPerNight: null,
      extraChildPerNight: null,
    },
    ...overrides,
  };
}

function expectRejection(fn: () => unknown, code: string): void {
  let caught: unknown;
  try {
    fn();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(PricingRejection);
  expect((caught as PricingRejection).code).toBe(code);
}

function sumMinor(amounts: Money[]): string {
  return formatMoney(amounts.reduce<Money>((total, amount) => money("EGP", total.minor + amount.minor), money("EGP", 0n)));
}

describe("occupancy split", () => {
  it("gives earlier rooms the remainder, deterministically", () => {
    expect(splitAcross(3, 2)).toEqual([2, 1]);
    expect(splitAcross(5, 3)).toEqual([2, 2, 1]);
    expect(splitAcross(4, 4)).toEqual([1, 1, 1, 1]);
  });
});

describe("hotel pricing", () => {
  it("prices room nights exactly for a standard party", () => {
    const [room] = hotelLines(stay());
    expect(room?.code).toBe("ROOM");
    expect(formatMoney(room.amount)).toBe("13600.00");
  });

  it("uses a RoomRate override for a night and the base rate for the rest", () => {
    const overrides = new Map([[nightDates(2)[1], egp("7000.00")]]);
    const [room] = hotelLines(stay({ nightlyOverrides: overrides }));
    expect(formatMoney(room.amount)).toBe("13800.00");
  });

  it("charges extra adults and children per night on top of the room", () => {
    const lines = hotelLines(
      stay({
        adults: 3,
        children: 1,
        rate: {
          basePerNight: egp("6800.00"),
          baseOccupancy: 2,
          maxAdults: 3,
          maxChildren: 2,
          extraAdultPerNight: egp("900.00"),
          extraChildPerNight: egp("450.00"),
        },
      }),
    );
    expect(formatMoney(lines.find((line) => line.code === "EXTRA_ADULT")!.amount)).toBe("1800.00");
    expect(formatMoney(lines.find((line) => line.code === "EXTRA_CHILD")!.amount)).toBe("900.00");
  });

  it("multiplies the room by the number of rooms", () => {
    const [room] = hotelLines(stay({ rooms: 2, adults: 4 }));
    expect(room?.quantity).toBe(2);
    expect(formatMoney(room.amount)).toBe("27200.00");
  });

  it("refuses a party that needs an extra rate the plan does not offer", () => {
    expectRejection(() => hotelLines(stay({ adults: 3, rate: { ...stay().rate, maxAdults: 3 } })), "PARTY_NOT_ALLOWED");
    expectRejection(() => hotelLines(stay({ children: 1 })), "PARTY_NOT_ALLOWED");
  });

  it("refuses more people than a room holds and a room with no adult", () => {
    expectRejection(() => hotelLines(stay({ adults: 3, rooms: 1 })), "PARTY_NOT_ALLOWED");
    expectRejection(() => hotelLines(stay({ adults: 1, rooms: 2 })), "PARTY_NOT_ALLOWED");
  });
});

describe("tour pricing", () => {
  it("multiplies the unit price by participants", () => {
    const [line] = tourLines({ unit: egp("950.00"), participants: 3, maxGroupSize: 12 });
    expect(formatMoney(line.amount)).toBe("2850.00");
  });

  it("refuses groups above the tour's maximum and empty groups", () => {
    expectRejection(() => tourLines({ unit: egp("1.00"), participants: 13, maxGroupSize: 12 }), "PARTY_NOT_ALLOWED");
    expectRejection(() => tourLines({ unit: egp("1.00"), participants: 0, maxGroupSize: 12 }), "VALIDATION_FAILED");
  });
});

describe("car rental", () => {
  it("counts whole calendar days and refuses drop-off on or before pick-up", () => {
    expect(rentalDays("2026-10-10", "2026-10-13")).toBe(3);
    expectRejection(() => rentalDays("2026-10-10", "2026-10-10"), "VALIDATION_FAILED");
    expectRejection(() => rentalDays("2026-10-13", "2026-10-10"), "VALIDATION_FAILED");
    expectRejection(() => rentalDays("2026-10-01", "2026-12-15"), "VALIDATION_FAILED");
  });

  it("refuses a driver below the model's minimum age, and accepts the minimum exactly", () => {
    expectRejection(() => assertDriverAge(20, 21), "DRIVER_TOO_YOUNG");
    expect(() => assertDriverAge(21, 21)).not.toThrow();
  });
});

describe("transfer party limits", () => {
  it("refuses more passengers or bags than the vehicle takes", () => {
    expectRejection(() => assertTransferParty(4, 0, 3, 2), "PARTY_NOT_ALLOWED");
    expectRejection(() => assertTransferParty(1, 3, 3, 2), "PARTY_NOT_ALLOWED");
    expect(() => assertTransferParty(3, 2, 3, 2)).not.toThrow();
  });
});

describe("package pricing bases", () => {
  const base: PackageInput = {
    basis: "PER_PERSON",
    basePrice: egp("3600.00"),
    singleSupplement: egp("400.00"),
    childPrice: egp("1800.00"),
    extraPersonPrice: null,
    minTravellers: 1,
    maxTravellers: 10,
    adults: 2,
    children: 0,
    rooms: null,
  };

  it("PER_PERSON: each adult pays the base, children their child price, and a solo traveller the supplement", () => {
    expect(sumMinor(packageLines({ ...base, adults: 2, children: 1 }).map((l) => l.amount))).toBe("9000.00");
    expect(sumMinor(packageLines({ ...base, adults: 1, children: 0 }).map((l) => l.amount))).toBe("4000.00");
  });

  it("PER_PERSON: children are refused when the package does not offer a child price", () => {
    expectRejection(() => packageLines({ ...base, childPrice: null, children: 1 }), "PARTY_NOT_ALLOWED");
  });

  it("PER_ROOM: rooms at base occupancy plus extra people above two per room", () => {
    const perRoom: PackageInput = {
      ...base,
      basis: "PER_ROOM",
      basePrice: egp("5600.00"),
      singleSupplement: null,
      childPrice: null,
      extraPersonPrice: egp("700.00"),
      adults: 5,
      rooms: 2,
    };
    // 2 rooms x 5600 + 1 extra person x 700
    expect(sumMinor(packageLines(perRoom).map((l) => l.amount))).toBe("11900.00");
    expectRejection(() => packageLines({ ...perRoom, extraPersonPrice: null }), "PARTY_NOT_ALLOWED");
    expectRejection(() => packageLines({ ...perRoom, rooms: null }), "VALIDATION_FAILED");
  });

  it("PER_PACKAGE: a flat price for the group, with an extra price beyond the maximum", () => {
    const flat: PackageInput = {
      ...base,
      basis: "PER_PACKAGE",
      basePrice: egp("27900.00"),
      singleSupplement: null,
      childPrice: null,
      extraPersonPrice: egp("1000.00"),
      adults: 6,
      children: 6,
      maxTravellers: 10,
    };
    // 27900 flat + 2 people beyond 10 at 1000 each
    expect(sumMinor(packageLines(flat).map((l) => l.amount))).toBe("29900.00");
    expect(sumMinor(packageLines({ ...flat, adults: 2, children: 2, extraPersonPrice: null }).map((l) => l.amount))).toBe("27900.00");
    expectRejection(() => packageLines({ ...flat, adults: 8, children: 4, extraPersonPrice: null }), "PARTY_NOT_ALLOWED");
  });

  it("enforces the minimum group size for every basis", () => {
    expectRejection(() => packageLines({ ...base, minTravellers: 4, adults: 2 }), "PARTY_NOT_ALLOWED");
  });
});
