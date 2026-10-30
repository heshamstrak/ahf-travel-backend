import { ArgumentsHost, BadRequestException, HttpStatus, Logger } from "@nestjs/common";
import { AppError } from "./errors";
import { ProblemFilter } from "./problem.filter";

function hostWith(requestId?: string) {
  const json = jest.fn();
  const type = jest.fn().mockReturnValue({ json });
  const status = jest.fn().mockReturnValue({ type, json });
  const res = { status, type, json };
  const req = { requestId };
  const host = {
    switchToHttp: () => ({ getResponse: () => res, getRequest: () => req }),
  } as unknown as ArgumentsHost;
  return { host, status, type, json };
}

describe("ProblemFilter", () => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it("renders domain errors as application/problem+json with the stable code", () => {
    const { host, status, type, json } = hostWith("req-123456");
    new ProblemFilter().catch(new AppError(HttpStatus.CONFLICT, "SOLD_OUT", "No rooms left", "Try other dates"), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(type).toHaveBeenCalledWith("application/problem+json");
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 409,
        code: "SOLD_OUT",
        title: "No rooms left",
        detail: "Try other dates",
        requestId: "req-123456",
        type: "https://ahf-travel.example/problems/sold-out",
      }),
    );
  });

  it("keeps field-level validation errors", () => {
    const { host, json } = hostWith();
    const error = new AppError(HttpStatus.UNPROCESSABLE_ENTITY, "VALIDATION_FAILED", "Some fields are invalid", undefined, [
      { field: "email", message: "email must be an email" },
    ]);
    new ProblemFilter().catch(error, host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ errors: [{ field: "email", message: "email must be an email" }] }));
  });

  it("maps plain HTTP exceptions to a generic code without exposing internals", () => {
    const { host, json } = hostWith();
    new ProblemFilter().catch(new BadRequestException("bad input"), host);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ status: 400, code: "BAD_REQUEST", title: "bad input" }));
  });

  it("hides unexpected errors behind a generic 500 and logs them", () => {
    const { host, status, json } = hostWith("req-abcdef12");
    const secret = new Error("connection string postgresql://user:hunter2@db");
    new ProblemFilter().catch(secret, host);
    expect(status).toHaveBeenCalledWith(500);
    const calls = json.mock.calls as unknown[][];
    const body = calls[0]?.[0] as Record<string, unknown>;
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(errorLog).toHaveBeenCalled();
  });
});
