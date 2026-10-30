import { Prisma } from "@prisma/client";

/** Money leaves the API as a decimal string with two places: {"amount":"6800.00","currency":"EGP"}. */
export function moneyAmount(value: Prisma.Decimal | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value).toFixed(2);
}

export function decimalText(value: Prisma.Decimal | number | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return new Prisma.Decimal(value).toString();
}
