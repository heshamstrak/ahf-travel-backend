import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { configureApp } from "./app.factory";
import { loadConfig } from "./config/env";

async function bootstrap(): Promise<void> {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  configureApp(app, config);
  await app.listen(config.port);
  Logger.log(`API listening on port ${config.port} (${config.nodeEnv})`, "Bootstrap");
}

void bootstrap();
