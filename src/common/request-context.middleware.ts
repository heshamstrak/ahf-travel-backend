import { Injectable, NestMiddleware } from "@nestjs/common";
import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";

export interface RequestMeta {
  requestId?: string;
  ipAddress?: string;
  userAgent?: string;
}

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Assigns a request id (echoed in problem responses and audit events) and records client metadata. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request & RequestMeta, res: Response, next: NextFunction): void {
    const incoming = req.header("x-request-id");
    const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    req.ipAddress = req.ip;
    req.userAgent = req.header("user-agent")?.slice(0, 255);
    next();
  }
}

export function metaOf(req: Request): { requestId?: string; ipAddress?: string; userAgent?: string } {
  const r = req as Request & RequestMeta;
  return { requestId: r.requestId, ipAddress: r.ipAddress, userAgent: r.userAgent };
}
