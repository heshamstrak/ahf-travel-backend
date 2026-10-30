/**
 * Exact money arithmetic. Amounts are integers in minor units (piastres for EGP), held as bigint.
 * JavaScript floating point is never used for an authoritative value. Every rounding is half-up,
 * applied once per computed line, and every line carries its currency.
 */

/** Minor-unit exponent per ISO 4217 currency. A standard, so it lives in code, not in data. */
const EXPONENTS: Record<string, number> = { EGP: 2, USD: 2, EUR: 2, GBP: 2, JPY: 0, KWD: 3 };

export interface Money {
  readonly currency: string;
  /** Integer count of minor units, never negative in a quote. */
  readonly minor: bigint;
}

export class MoneyError extends Error {}

export function exponentOf(currency: string): number {
  const exponent = EXPONENTS[currency];
  if (exponent === undefined) throw new MoneyError(`unsupported currency ${currency}`);
  return exponent;
}

export function money(currency: string, minor: bigint): Money {
  exponentOf(currency);
  if (minor < 0n) throw new MoneyError("money cannot be negative");
  return { currency, minor };
}

export function zero(currency: string): Money {
  return money(currency, 0n);
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) throw new MoneyError(`cannot combine ${a.currency} with ${b.currency}`);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.currency, a.minor + b.minor);
}

/** Subtraction that refuses to go below zero, so a discount can never exceed what it discounts. */
export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  if (b.minor > a.minor) throw new MoneyError("result would be negative");
  return money(a.currency, a.minor - b.minor);
}

export function multiplyByCount(amount: Money, count: number): Money {
  if (!Number.isInteger(count) || count < 0) throw new MoneyError("count must be a non-negative integer");
  return money(amount.currency, amount.minor * BigInt(count));
}

export function sum(items: Money[], currency: string): Money {
  return items.reduce((total, item) => add(total, item), zero(currency));
}

/** Integer division of non-negative numbers, rounding halves up: round(numerator / denominator). */
export function divideHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new MoneyError("rounding expects a non-negative numerator");
  return (numerator * 2n + denominator) / (denominator * 2n);
}

/**
 * Applies a rate expressed as value / scale, e.g. 14% is 1400n / 10000n.
 * The result is rounded half-up to whole minor units, so each line is rounded once.
 */
export function applyRate(amount: Money, rate: Rate): Money {
  return money(amount.currency, divideHalfUp(amount.minor * rate.value, rate.scale));
}

/** A decimal rate kept exact: value / scale. */
export interface Rate {
  readonly value: bigint;
  readonly scale: bigint;
}

/** Parses a non-negative decimal such as "0.1400" into an exact rate with the given number of places. */
export function parseRate(text: string, places: number): Rate {
  const normalised = normaliseDecimal(text, places);
  return { value: BigInt(normalised.replace(".", "")), scale: 10n ** BigInt(places) };
}

/** "0.1400" with 4 places -> "0.1400". Rejects signs, exponents and extra digits. */
function normaliseDecimal(text: string, places: number): string {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) throw new MoneyError(`not a plain decimal: ${text}`);
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  if (fraction.length > places) {
    if (/[1-9]/.test(fraction.slice(places))) throw new MoneyError(`too many decimal places: ${text}`);
  }
  const padded = (fraction + "0".repeat(places)).slice(0, places);
  return places === 0 ? whole : `${whole}.${padded}`;
}

/** Parses a money amount such as "5200.00" in its currency's exponent. */
export function parseMoney(text: string, currency: string): Money {
  const exponent = exponentOf(currency);
  const normalised = normaliseDecimal(text, exponent);
  return money(currency, BigInt(normalised.replace(".", "")));
}

/** Formats minor units as a decimal string with the currency's exponent: 520000n EGP -> "5200.00". */
export function formatMoney(amount: Money): string {
  const exponent = exponentOf(amount.currency);
  if (exponent === 0) return amount.minor.toString();
  const digits = amount.minor.toString().padStart(exponent + 1, "0");
  return `${digits.slice(0, -exponent)}.${digits.slice(-exponent)}`;
}

/** Renders a rate at its own precision: 1400/10000 is "0.1400". Exact, never floating point. */
export function formatRate(rate: Rate): string {
  const places = rate.scale.toString().length - 1;
  const whole = rate.value / rate.scale;
  const fraction = (rate.value % rate.scale).toString().padStart(places, "0");
  return places === 0 ? whole.toString() : `${whole}.${fraction}`;
}

/**
 * Converts an amount with a currency exchange rate (1 base = rate quote), rounded half-up to the
 * target currency's minor units. The rate is itself an exact value / scale.
 */
export function convert(amount: Money, toCurrency: string, rate: Rate): Money {
  const from = exponentOf(amount.currency);
  const to = exponentOf(toCurrency);
  const scaleUp = 10n ** BigInt(to);
  const scaleDown = 10n ** BigInt(from);
  return money(toCurrency, divideHalfUp(amount.minor * rate.value * scaleUp, rate.scale * scaleDown));
}
