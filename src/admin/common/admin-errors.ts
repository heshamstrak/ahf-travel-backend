import { HttpStatus } from "@nestjs/common";
import { AppError } from "../../common/errors";
import { PricingRejection } from "../../pricing/errors";

/**
 * Every admin service maps its guarded-update rejections the same way bookings/payments already
 * do (PricingRejection.status -> HttpStatus). Centralised here instead of duplicated per module.
 */
export function toAdminHttp(error: unknown): unknown {
  if (!(error instanceof PricingRejection)) return error;
  const status =
    error.status === 404
      ? HttpStatus.NOT_FOUND
      : error.status === 409
        ? HttpStatus.CONFLICT
        : error.status === 410
          ? HttpStatus.GONE
          : HttpStatus.UNPROCESSABLE_ENTITY;
  return new AppError(status, error.code, error.message, undefined, error.field ? [{ field: error.field, message: error.message }] : undefined);
}
