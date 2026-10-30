import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma, ProductType } from "@prisma/client";
import { businessDate, businessDay } from "../common/business-date";
import { Clock } from "../common/clock";
import { AppError, Errors } from "../common/errors";
import { generateOpaqueToken, hashToken } from "../security/crypto";
import { adjust, Adjustments, AdjustmentLine, RuleContext, RuleSnapshot } from "../pricing/rules";
import { PricingRejection } from "../pricing/errors";
import { baseSubtotal, BaseLine } from "../pricing/calculators";
import { convert, formatMoney, Money, parseMoney, parseRate } from "../pricing/money";
import { parseSelection } from "./quote-selection";
import { PricedProduct, ProductPricer } from "./product-pricer";
import { QuotesRepository } from "./quotes.repository";
import { CreateQuoteDto } from "./quotes.dto";

/** Who is asking. Authenticated users own their quotes; guests hold a token. */
export interface QuoteActor {
  userId?: string;
}

/** One line as the client sees it. Internal rule identifiers are never included. */
export interface QuoteLineView {
  kind: "BASE" | "DISCOUNT" | "SURCHARGE" | "FEE" | "TAX";
  code: string;
  label: string;
  quantity: number;
  unitAmount: string | null;
  amount: string;
  currency: string;
  rate: string | null;
  note: string | null;
  rule: { code: string; kind: string; label: string; version: string; percent: string | null; flatAmount: string | null; flatCurrency: string | null } | null;
}

export interface QuoteView {
  id: string;
  productType: ProductType;
  status: "ACTIVE" | "EXPIRED";
  createdAt: string;
  expiresAt: string;
  holdMinutes: number;
  currency: string;
  product: Record<string, unknown>;
  selection: Record<string, unknown>;
  lines: QuoteLineView[];
  totals: { subtotal: string; discount: string; surcharge: string; fee: string; tax: string; total: string; currency: string };
  display: { currency: string; rate: string; total: string } | null;
}

export interface CreatedQuote {
  quote: QuoteView;
  /** Shown once, to a guest only. The server keeps a hash. */
  guestToken: string | null;
}

/** The lines as stored in Quote.lines. Includes the rule snapshot id so the quote stays explainable. */
interface StoredLine extends Omit<QuoteLineView, "rule"> {
  rule: (RuleSnapshot & { code: string }) | null;
}

function baseLine(line: BaseLine, currency: string, notes: Record<string, string>): StoredLine {
  return {
    kind: "BASE",
    code: line.code,
    label: line.label,
    quantity: line.quantity,
    unitAmount: formatMoney(line.unit),
    amount: formatMoney(line.amount),
    currency,
    rate: null,
    note: notes[line.code] ?? null,
    rule: null,
  };
}

function adjustmentLine(line: AdjustmentLine): StoredLine {
  return {
    kind: line.kind,
    code: line.code,
    label: line.label,
    quantity: line.units,
    unitAmount: null,
    amount: formatMoney(line.amount),
    currency: line.amount.currency,
    rate: line.rate,
    note: null,
    rule: line.rule,
  };
}

/** Stored decimals are shown with the currency exponent, so 1440 is "1440.00". */
function amountText(value: Prisma.Decimal, currency: string): string {
  return formatMoney(parseMoney(value.toString(), currency));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

@Injectable()
export class QuotesService {
  constructor(
    private readonly repo: QuotesRepository,
    private readonly pricer: ProductPricer,
    private readonly clock: Clock,
  ) {}

  /**
   * Creates an immutable quote. The request contains only the product id and the selection, and every
   * amount is calculated here from catalogue and pricing data.
   */
  async create(dto: CreateQuoteDto, actor: QuoteActor): Promise<CreatedQuote> {
    const now = this.clock.now();
    const today = businessDate(now);
    try {
      const priced = await this.priceProduct(dto, today, now);

      const rules = await this.repo.activeRules(dto.productType, businessDay(now));
      const ctx: RuleContext = { productType: dto.productType, currency: priced.currency, today, ...priced.facts };
      const subtotal = baseSubtotal(priced.lines, priced.currency);
      const adjustments = adjust(subtotal, rules, ctx);
      const display = await this.displayFor(dto.displayCurrency, adjustments.total);

      const ttlMinutes = Number(await this.repo.settingValue("quote.ttlMinutes"));
      const holdMinutes = Number(await this.repo.settingValue("booking.holdMinutes"));
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);

      const guestToken = actor.userId ? null : generateOpaqueToken();
      const lines = this.storeLines(priced, adjustments);
      const row = await this.repo.createQuote({
        userId: actor.userId ?? null,
        guestTokenHash: guestToken ? hashToken(guestToken) : null,
        productType: dto.productType,
        productId: priced.productId,
        request: { selection: priced.selection, product: priced.product, today } as Prisma.InputJsonValue,
        lines: lines as unknown as Prisma.InputJsonValue,
        currency: priced.currency,
        subtotal: formatMoney(adjustments.subtotal),
        discount: formatMoney(adjustments.discount),
        surcharge: formatMoney(adjustments.surcharge),
        fee: formatMoney(adjustments.fee),
        tax: formatMoney(adjustments.tax),
        total: formatMoney(adjustments.total),
        displayCurrency: display?.currency ?? null,
        displayFxRate: display?.rate ?? null,
        displayTotal: display?.total ?? null,
        holdMinutes,
        expiresAt,
        createdAt: now,
      });
      return { quote: this.toView(row, now), guestToken };
    } catch (error) {
      throw this.toHttp(error);
    }
  }

  /**
   * Returns the stored snapshot. Nothing is recalculated, so the answer never changes after creation
   * even when pricing rules change. An owner check comes first: other users and guests without the token get 404.
   */
  async get(id: string, actor: QuoteActor, presentedToken: string | undefined): Promise<QuoteView> {
    if (!isUuid(id)) {
      throw new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
        { field: "id", message: "must be a UUID" },
      ]);
    }
    const row = await this.repo.findQuote(id);
    if (!row || !this.mayRead(row, actor, presentedToken)) throw Errors.notFound("Quote");
    return this.toView(row, this.clock.now());
  }

  private mayRead(row: { userId: string | null; guestTokenHash: string | null }, actor: QuoteActor, token: string | undefined): boolean {
    if (row.userId !== null) return actor.userId === row.userId;
    return token !== undefined && row.guestTokenHash !== null && hashToken(token) === row.guestTokenHash;
  }

  /** Each product parses its own strict selection, so the pricer receives a typed input. */
  private async priceProduct(dto: CreateQuoteDto, today: string, now: Date): Promise<PricedProduct> {
    switch (dto.productType) {
      case "HOTEL":
        return this.pricer.hotel(dto.productId, parseSelection("HOTEL", dto.selection), today);
      case "TOUR":
        return this.pricer.tour(dto.productId, parseSelection("TOUR", dto.selection), now);
      case "CAR":
        return this.pricer.car(dto.productId, parseSelection("CAR", dto.selection), today);
      case "TRANSFER":
        return this.pricer.transfer(dto.productId, parseSelection("TRANSFER", dto.selection), today);
      case "PACKAGE":
        return this.pricer.packageDeparture(dto.productId, parseSelection("PACKAGE", dto.selection), businessDay(now));
    }
  }

  private storeLines(priced: PricedProduct, adjustments: Adjustments): StoredLine[] {
    return [
      ...priced.lines.map((line) => baseLine(line, priced.currency, priced.notes)),
      ...adjustments.discounts.map(adjustmentLine),
      ...adjustments.surcharges.map(adjustmentLine),
      ...adjustments.fees.map(adjustmentLine),
      ...adjustments.taxes.map(adjustmentLine),
    ];
  }

  /** Display currency is presentation only. It needs a configured currency and an exchange rate. */
  private async displayFor(displayCurrency: string | undefined, total: Money): Promise<{ currency: string; rate: string; total: string } | null> {
    if (displayCurrency === undefined || displayCurrency === total.currency) return null;
    const allowed = (await this.repo.settingValue("currency.display")) as string[];
    if (!allowed.includes(displayCurrency)) {
      throw new PricingRejection(422, "CURRENCY_NOT_SUPPORTED", `${displayCurrency} is not offered for display`, "displayCurrency");
    }
    const row = await this.repo.exchangeRate(total.currency, displayCurrency);
    if (!row) {
      throw new PricingRejection(422, "CURRENCY_NOT_SUPPORTED", `no exchange rate for ${displayCurrency}`, "displayCurrency");
    }
    const rate = row.rate.toString();
    const converted = convert(total, displayCurrency, parseRate(rate, 8));
    return { currency: displayCurrency, rate, total: formatMoney(converted) };
  }

  /** Refusals become problem responses. Anything else (including PricingConfigError) stays an internal error. */
  private toHttp(error: unknown): unknown {
    if (!(error instanceof PricingRejection)) return error;
    const status = error.status === 404 ? HttpStatus.NOT_FOUND : error.status === 409 ? HttpStatus.CONFLICT : HttpStatus.UNPROCESSABLE_ENTITY;
    return new AppError(status, error.code, error.message, undefined, error.field ? [{ field: error.field, message: error.message }] : undefined);
  }

  private toView(row: {
    id: string;
    productType: ProductType;
    request: Prisma.JsonValue;
    lines: Prisma.JsonValue;
    currency: string;
    subtotal: Prisma.Decimal;
    discount: Prisma.Decimal;
    surcharge: Prisma.Decimal;
    fee: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    displayCurrency: string | null;
    displayFxRate: Prisma.Decimal | null;
    displayTotal: Prisma.Decimal | null;
    holdMinutes: number;
    expiresAt: Date;
    createdAt: Date;
  }, now: Date): QuoteView {
    const request = row.request as { selection: Record<string, unknown>; product: Record<string, unknown> };
    const stored = row.lines as unknown as StoredLine[];
    return {
      id: row.id,
      productType: row.productType,
      status: now >= row.expiresAt ? "EXPIRED" : "ACTIVE",
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      holdMinutes: row.holdMinutes,
      currency: row.currency,
      product: request.product,
      selection: request.selection,
      lines: stored.map((line) => ({
        kind: line.kind,
        code: line.code,
        label: line.label,
        quantity: line.quantity,
        unitAmount: line.unitAmount,
        amount: line.amount,
        currency: line.currency,
        rate: line.rate,
        note: line.note,
        rule: line.rule
          ? { code: line.rule.code, kind: line.rule.kind, label: line.rule.label, version: line.rule.version, percent: line.rule.percent, flatAmount: line.rule.flatAmount, flatCurrency: line.rule.flatCurrency }
          : null,
      })),
      totals: {
        subtotal: amountText(row.subtotal, row.currency),
        discount: amountText(row.discount, row.currency),
        surcharge: amountText(row.surcharge, row.currency),
        fee: amountText(row.fee, row.currency),
        tax: amountText(row.tax, row.currency),
        total: amountText(row.total, row.currency),
        currency: row.currency,
      },
      display:
        row.displayCurrency !== null && row.displayFxRate !== null && row.displayTotal !== null
          ? { currency: row.displayCurrency, rate: row.displayFxRate.toString(), total: amountText(row.displayTotal, row.displayCurrency) }
          : null,
    };
  }
}


