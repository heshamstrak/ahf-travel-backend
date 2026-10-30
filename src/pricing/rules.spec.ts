import { PricingConfigError } from "./errors";
import { formatMoney, money, parseMoney } from "./money";
import { adjust, RuleContext, RuleSnapshot } from "./rules";

const TODAY = "2026-10-07";

function rule(overrides: Partial<RuleSnapshot> & Pick<RuleSnapshot, "code" | "kind">): RuleSnapshot {
  return {
    id: `id-${overrides.code}`,
    label: overrides.code,
    productType: null,
    percent: null,
    flatAmount: null,
    flatCurrency: null,
    conditions: null,
    priority: 0,
    validFrom: "2026-01-01",
    validTo: null,
    version: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const VAT = rule({ code: "vat-eg", kind: "TAX", percent: "0.1400" });
const FEE = rule({ code: "platform-fee", kind: "FEE", percent: "0.0300" });
const LONG_STAY = rule({ code: "long-stay", kind: "DISCOUNT", percent: "0.0500", productType: "HOTEL", conditions: { minNights: 7 } });
const YOUNG = rule({
  code: "young-driver",
  kind: "SURCHARGE",
  flatAmount: "150.00",
  flatCurrency: "EGP",
  productType: "CAR",
  conditions: { driverAgeBelow: 25, perDay: true },
});

function ctx(overrides: Partial<RuleContext> = {}): RuleContext {
  return { productType: "HOTEL", currency: "EGP", today: TODAY, ...overrides };
}

describe("pricing rules (adjustment order and snapshots)", () => {
  it("computes discounts and surcharges on the base, then fees and taxes on the net", () => {
    // Surcharge: 150.00 x 3 days = 450.00 on a car.
    const car = adjust(parseMoney("1000.00", "EGP"), [YOUNG, FEE, VAT, LONG_STAY], ctx({ productType: "CAR", driverAge: 22, days: 3 }));
    expect(formatMoney(car.surcharge)).toBe("450.00");
    expect(car.discount.minor).toBe(0n); // the long-stay discount is for hotels only

    // Discount 5% of 1000.00 = 50.00. Net 950.00. Fee 3% of net = 28.50. VAT 14% of net = 133.00.
    const hotel = adjust(parseMoney("1000.00", "EGP"), [LONG_STAY, FEE, VAT], ctx({ nights: 7 }));
    expect(formatMoney(hotel.discount)).toBe("50.00");
    expect(formatMoney(hotel.net)).toBe("950.00");
    expect(formatMoney(hotel.fee)).toBe("28.50");
    expect(formatMoney(hotel.tax)).toBe("133.00");
    expect(formatMoney(hotel.total)).toBe("1111.50");
  });

  it("the breakdown always adds up to the total", () => {
    const result = adjust(parseMoney("1234.56", "EGP"), [FEE, VAT], ctx());
    expect(result.total.minor).toBe(result.net.minor + result.fee.minor + result.tax.minor);
    expect(result.net.minor).toBe(result.subtotal.minor - result.discount.minor + result.surcharge.minor);
  });

  it("is deterministic for identical inputs, whatever the rule order", () => {
    const a = adjust(parseMoney("777.77", "EGP"), [VAT, FEE], ctx());
    const b = adjust(parseMoney("777.77", "EGP"), [FEE, VAT], ctx());
    expect(a.total.minor).toBe(b.total.minor);
    expect(formatMoney(a.total)).toBe(formatMoney(b.total));
  });

  it("applies a young-driver surcharge only below the threshold and only in its own currency", () => {
    const young = adjust(parseMoney("1000.00", "EGP"), [YOUNG], ctx({ productType: "CAR", driverAge: 24, days: 2 }));
    expect(formatMoney(young.surcharge)).toBe("300.00");
    const mature = adjust(parseMoney("1000.00", "EGP"), [YOUNG], ctx({ productType: "CAR", driverAge: 25, days: 2 }));
    expect(mature.surcharge.minor).toBe(0n);
    // A flat EGP amount is not applied to a USD quote.
    const usd = adjust(money("USD", 100_000n), [YOUNG], ctx({ productType: "CAR", currency: "USD", driverAge: 22, days: 2 }));
    expect(usd.surcharge.minor).toBe(0n);
  });

  it("caps a discount at the base it discounts", () => {
    const flat = rule({ code: "big", kind: "DISCOUNT", flatAmount: "5000.00", flatCurrency: "EGP" });
    const result = adjust(parseMoney("100.00", "EGP"), [flat], ctx());
    expect(formatMoney(result.discount)).toBe("100.00");
    expect(result.net.minor).toBe(0n);
  });

  it("skips rules outside their validity window or for another product", () => {
    const expired = rule({ code: "old-vat", kind: "TAX", percent: "0.1000", validTo: "2026-01-31" });
    const future = rule({ code: "next-vat", kind: "TAX", percent: "0.2000", validFrom: "2026-12-01" });
    const tour = rule({ code: "tour-fee", kind: "FEE", percent: "0.5000", productType: "TOUR" });
    const result = adjust(parseMoney("100.00", "EGP"), [expired, future, tour], ctx());
    expect(result.taxes).toHaveLength(0);
    expect(result.fees).toHaveLength(0);
  });

  it("fails closed on an unknown condition and on a perDay rule without days", () => {
    const unknown = rule({ code: "weird", kind: "FEE", percent: "0.01", conditions: { mood: "good" } });
    expect(() => adjust(parseMoney("1.00", "EGP"), [unknown], ctx())).toThrow(PricingConfigError);
    const perDay = rule({ code: "per-day", kind: "SURCHARGE", flatAmount: "10.00", flatCurrency: "EGP", conditions: { perDay: true } });
    expect(() => adjust(parseMoney("1.00", "EGP"), [perDay], ctx())).toThrow(PricingConfigError);
  });

  it("keeps the rule snapshot on every line so the quote can be explained later", () => {
    const result = adjust(parseMoney("1000.00", "EGP"), [VAT], ctx());
    expect(result.taxes[0]?.rule.version).toBe("2026-01-01T00:00:00.000Z");
    expect(result.taxes[0]?.rule.id).toBe("id-vat-eg");
    expect(result.taxes[0]?.rate).toBe("0.1400");
  });
});
