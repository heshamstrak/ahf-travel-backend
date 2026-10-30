import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { AppErrorBody } from "./errors";

export interface ProblemBody {
  type: string;
  title: string;
  status: number;
  code: string;
  detail?: string;
  errors?: { field: string; message: string }[];
  requestId?: string;
}

const PROBLEM_BASE = "https://ahf-travel.example/problems/";

/** Renders every error as RFC 9457 application/problem+json. Never leaks stack traces. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger("Errors");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: AppErrorBody = { code: "INTERNAL_ERROR", title: "Something went wrong" };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "object" && response !== null && "code" in response) {
        body = response as AppErrorBody;
      } else {
        body = { code: codeForStatus(status), title: exception.message || "Request failed" };
      }
    } else {
      this.logger.error(
        `Unhandled error [${req.requestId ?? "-"}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const problem: ProblemBody = {
      type: `${PROBLEM_BASE}${body.code.toLowerCase().replace(/_/g, "-")}`,
      title: body.title,
      status,
      code: body.code,
      ...(body.detail ? { detail: body.detail } : {}),
      ...(body.errors ? { errors: body.errors } : {}),
      ...(req.requestId ? { requestId: req.requestId } : {}),
    };

    res.status(status).type("application/problem+json").json(problem);
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 413:
      return "PAYLOAD_TOO_LARGE";
    case 422:
      return "VALIDATION_FAILED";
    case 429:
      return "RATE_LIMITED";
    default:
      return "ERROR";
  }
}
