import { INestApplication } from "@nestjs/common";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import type { AppConfig } from "./config/env";
import { ProblemFilter } from "./common/problem.filter";
import { createValidationPipe } from "./common/validation";

/** Shared by the entry point and integration tests so both run the same HTTP pipeline. */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.use(helmet());
  app.use(cookieParser());
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: config.appOrigin, credentials: true });
  app.useGlobalFilters(new ProblemFilter());
  app.useGlobalPipes(createValidationPipe());
  app.enableShutdownHooks();
}
