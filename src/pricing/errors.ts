/**
 * A pricing or availability refusal that the caller can fix (wrong dates, party too big, sold out).
 * The quote service maps it to an RFC 9457 problem with a stable code.
 */
export class PricingRejection extends Error {
  constructor(
    readonly status: 404 | 409 | 410 | 422,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** Server-side data that breaks a pricing rule (for example an unknown condition). Never shown as a client error. */
export class PricingConfigError extends Error {}
