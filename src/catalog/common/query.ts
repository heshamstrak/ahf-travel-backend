import { Transform } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";

/** Query strings arrive as text. These transforms convert them; validators then reject bad input. */

export const toInt = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return /^-?\d+$/.test(trimmed) ? Number(trimmed) : value;
};

export const toNumber = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : value;
};

/** "a,b,c" -> ["a","b","c"]. Empty items are dropped. Non-strings pass through for validation. */
export const toCsv = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

/** "manual" or "Manual" -> "MANUAL". For a single enum code. Use toCodeList for lists. */
export const toCodeValue = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim().toUpperCase().replace(/[ -]/g, "_") : value;

export const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === "true") return true;
  if (value === "false") return false;
  return value;
};

export const toTrimmed = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export const MAX_PAGE = 10_000;
export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 20;

/** Offset pagination with hard bounds. Page numbers past the end return an empty page, not an error. */
export class PageQueryDto {
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page: number = 1;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Page<T> {
  items: T[];
  meta: PageMeta;
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

/** Text from a JSON field that may be missing or of another type. Anything that is not a string becomes "". */
export function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function pageOffset(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/** Keeps a whole list response in one shape across modules. */
export function toPage<T>(items: T[], query: { page: number; pageSize: number }, total: number): Page<T> {
  return { items, meta: pageMeta(query.page, query.pageSize, total) };
}

/** Date-only strings (YYYY-MM-DD). Validation of real calendar dates happens in isValidIsoDate. */
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function utcDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * Later of the requested lower bound and the floor (now by default). Departures that have already
 * started are never sold, so a public query can never start before the floor.
 */
export function notBefore(requested: Date, floor: Date = new Date()): Date {
  return requested.getTime() > floor.getTime() ? requested : floor;
}

/** Whole nights between two UTC dates. Check-out day is not a night. */
export function nightsBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}
