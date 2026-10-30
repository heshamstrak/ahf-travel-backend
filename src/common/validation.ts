import { ValidationError, ValidationPipe } from "@nestjs/common";
import { AppError, FieldError } from "./errors";
import { HttpStatus } from "@nestjs/common";

function flatten(errors: ValidationError[], parent = ""): FieldError[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own: FieldError[] = Object.values(error.constraints ?? {}).map((message) => ({ field, message }));
    return [...own, ...flatten(error.children ?? [], field)];
  });
}

/** Strict request validation: unknown fields are rejected, values are coerced to DTO types. */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) =>
      new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "VALIDATION_FAILED",
        "Some fields are invalid",
        undefined,
        flatten(errors),
      ),
  });
}
