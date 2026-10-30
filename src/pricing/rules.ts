import { add, applyRate, formatRate, Money, money, parseMoney, parseRate, subtract, sum } from "./money";
import { PricingConfigError } from "./errors";

export interface RuleSnapshot {
  id: string;
  code: string;
  kind: "TAX" | "FEE" | "SURCHARGE" | "DISCOUNT";
  label: string;
  productType: string | null;
  percent: string | null;
  flatAmount: string | null;
  flatCurrency: string | null;
  conditions: Record<string, unknown> | null;
  priority: number;
  validFrom: string;
  validTo: string | null;
  version: string;
}

export interface RuleContext {
  productType: string;
  currency: string;
  today: string;
  nights?: number;
  days?: number;
  travellers?: number;
  driverAge?: number;
}

export interface AdjustmentLine {
  kind: "DISCOUNT" | "SURCHARGE" | "FEE" | "TAX";
  code: string;
  label: string;
  amount: Money;
  rule: RuleSnapshot;
  /** Percent applied, as text, when the rule is percentage based. */
  rate: string | null;
  /** Units multiplied into a flat amount (perDay), or 1. */
  units: number;
}

export interface Adjustments {
  discounts: AdjustmentLine[];
  surcharges: AdjustmentLine[];
  fees: AdjustmentLine[];
  taxes: AdjustmentLine[];
  subtotal: Money;
  discount: Money;
  surcharge: Money;
  net: Money;
  fee: Money;
  tax: Money;
  total: Money;
}

const KNOWN_CONDITIONS = new Set(["driverAgeBelow", "minNights", "minTravellers", "perDay"]);

const PERCENT_PLACES = 4;

export function conditionsHold(rule: RuleSnapshot, ctx: RuleContext): boolean {
  const conditions = rule.conditions ?? {};
  for (const key of Object.keys(conditions)) {
    if (!KNOWN_CONDITIONS.has(key)) {
      throw new PricingConfigError(`rule ${rule.code} has unknown condition ${key}`);
    }
  }
  if ("driverAgeBelow" in conditions) {
    if (ctx.driverAge === undefined || !(ctx.driverAge < Number(conditions.driverAgeBelow))) return false;
  }
  if ("minNights" in conditions) {
    if (ctx.nights === undefined || !(ctx.nights >= Number(conditions.minNights))) return false;
  }
  if ("minTravellers" in conditions) {
    if (ctx.travellers === undefined || !(ctx.travellers >= Number(conditions.minTravellers))) return false;
  }
  return true;
}

/** A rule applies when it is active for this business day, matches the product, and its conditions hold. */
export function ruleApplies(rule: RuleSnapshot, ctx: RuleContext): boolean {
  if (rule.productType !== null && rule.productType !== ctx.productType) return false;
  if (rule.validFrom > ctx.today) return false;
  if (rule.validTo !== null && rule.validTo < ctx.today) return false;
  return conditionsHold(rule, ctx);
}

/**
 * Units a flat amount is multiplied by. perDay needs a day count. Without one the rule cannot be
 * priced correctly, so the quote fails rather than pricing it once.
 */
function unitsFor(rule: RuleSnapshot, ctx: RuleContext): number {
  if (!rule.conditions?.perDay) return 1;
  if (ctx.days === undefined) throw new PricingConfigError(`rule ${rule.code} is perDay but the product has no days`);
  return ctx.days;
}

function amountFor(
  rule: RuleSnapshot,
  ctx: RuleContext,
  base: Money,
): { amount: Money; rate: string | null; units: number } | null {
  if (rule.percent !== null) {
    const rate = parseRate(rule.percent, PERCENT_PLACES);
    return { amount: applyRate(base, rate), rate: formatRate(rate), units: 1 };
  }
  if (rule.flatAmount !== null) {
    // A flat amount is only applied in its own currency. A mismatch makes the rule not applicable.
    if (rule.flatCurrency !== ctx.currency) return null;
    const units = unitsFor(rule, ctx);
    const flat = parseMoney(rule.flatAmount, ctx.currency);
    return { amount: money(ctx.currency, flat.minor * BigInt(units)), rate: null, units };
  }
  throw new PricingConfigError(`rule ${rule.code} has neither a percent nor a flat amount`);
}

function byPriority(a: RuleSnapshot, b: RuleSnapshot): number {
  return a.priority - b.priority || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
}

/**
 * Applies the adjustment order from ARCHITECTURE section 6.2:
 *   1. discounts and surcharges are computed on the gross base (subtotal);
 *   2. net = subtotal - discount + surcharge;
 *   3. fees and taxes are each computed on the net, and each rule is rounded separately.
 * Percent amounts never compound on each other, so the order of rules does not change any amount.
 */
export function adjust(subtotal: Money, rules: RuleSnapshot[], ctx: RuleContext): Adjustments {
  const applicable = rules.filter((rule) => ruleApplies(rule, ctx)).sort(byPriority);

  const discounts: AdjustmentLine[] = [];
  const surcharges: AdjustmentLine[] = [];
  const fees: AdjustmentLine[] = [];
  const taxes: AdjustmentLine[] = [];

  for (const rule of applicable.filter((r) => r.kind === "DISCOUNT")) {
    const priced = amountFor(rule, ctx, subtotal);
    if (!priced) continue;
    // A discount never exceeds the base it discounts.
    const capped = priced.amount.minor > subtotal.minor ? subtotal : priced.amount;
    discounts.push({ kind: "DISCOUNT", code: rule.code, label: rule.label, amount: capped, rule, rate: priced.rate, units: priced.units });
  }
  for (const rule of applicable.filter((r) => r.kind === "SURCHARGE")) {
    const priced = amountFor(rule, ctx, subtotal);
    if (!priced) continue;
    surcharges.push({ kind: "SURCHARGE", code: rule.code, label: rule.label, amount: priced.amount, rule, rate: priced.rate, units: priced.units });
  }

  const discount = sum(discounts.map((d) => d.amount), ctx.currency);
  const surcharge = sum(surcharges.map((s) => s.amount), ctx.currency);
  const net = add(subtract(subtotal, discount), surcharge);

  for (const rule of applicable.filter((r) => r.kind === "FEE")) {
    const priced = amountFor(rule, ctx, net);
    if (!priced) continue;
    fees.push({ kind: "FEE", code: rule.code, label: rule.label, amount: priced.amount, rule, rate: priced.rate, units: priced.units });
  }
  for (const rule of applicable.filter((r) => r.kind === "TAX")) {
    const priced = amountFor(rule, ctx, net);
    if (!priced) continue;
    taxes.push({ kind: "TAX", code: rule.code, label: rule.label, amount: priced.amount, rule, rate: priced.rate, units: priced.units });
  }

  const fee = sum(fees.map((f) => f.amount), ctx.currency);
  const tax = sum(taxes.map((t) => t.amount), ctx.currency);
  const total = add(add(net, fee), tax);
  return { discounts, surcharges, fees, taxes, subtotal, discount, surcharge, net, fee, tax, total };
}

