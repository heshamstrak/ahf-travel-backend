import { HttpException, HttpStatus } from "@nestjs/common";

export interface FieldError {
  field: string;
  message: string;
}

export interface AppErrorBody {
  code: string;
  title: string;
  detail?: string;
  errors?: FieldError[];
}

/** Domain error with a stable machine-readable code. Rendered as application/problem+json. */
export class AppError extends HttpException {
  constructor(status: HttpStatus, code: string, title: string, detail?: string, errors?: FieldError[]) {
    const body: AppErrorBody = { code, title, ...(detail ? { detail } : {}), ...(errors ? { errors } : {}) };
    super(body, status);
  }
}

export const Errors = {
  invalidCredentials: () =>
    new AppError(HttpStatus.UNAUTHORIZED, "INVALID_CREDENTIALS", "Email or password is incorrect"),
  emailNotVerified: () =>
    new AppError(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED", "Verify your email address before signing in"),
  accountLocked: (retryAfterMinutes: number) =>
    new AppError(
      HttpStatus.FORBIDDEN,
      "ACCOUNT_LOCKED",
      "Too many failed sign-in attempts",
      `Try again in about ${retryAfterMinutes} minutes`,
    ),
  accountUnavailable: () =>
    new AppError(HttpStatus.FORBIDDEN, "ACCOUNT_UNAVAILABLE", "This account cannot sign in"),
  invalidToken: () =>
    new AppError(HttpStatus.BAD_REQUEST, "INVALID_OR_EXPIRED_TOKEN", "The link is invalid or has expired"),
  invalidRefreshToken: () =>
    new AppError(HttpStatus.UNAUTHORIZED, "INVALID_REFRESH_TOKEN", "Your session has ended. Sign in again"),
  unauthenticated: () =>
    new AppError(HttpStatus.UNAUTHORIZED, "UNAUTHENTICATED", "Authentication is required"),
  notFound: (what: string) => new AppError(HttpStatus.NOT_FOUND, "NOT_FOUND", `${what} was not found`),
  conflict: (code: string, title: string) => new AppError(HttpStatus.CONFLICT, code, title),
  wrongCurrentPassword: () =>
    new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "WRONG_CURRENT_PASSWORD", "Your current password is incorrect"),
};

/** Business-level validation failure with the same shape as DTO validation (422, field list). */
export function validationFailed(errors: FieldError[]): AppError {
  return new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, errors);
}
