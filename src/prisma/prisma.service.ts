import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma, PrismaClient } from "@prisma/client";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/env";

export type QueryListener = (query: string) => void;

@Injectable()
export class PrismaService extends PrismaClient<Prisma.PrismaClientOptions, "query"> implements OnModuleInit, OnModuleDestroy {
  private readonly listeners = new Set<QueryListener>();

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      datasourceUrl: config.databaseUrl,
      // Query events are off by default. Tests enable them to prove query counts (no N+1).
      log: config.prismaQueryEvents ? [{ emit: "event", level: "query" }] : [],
    });
    if (config.prismaQueryEvents) {
      this.$on("query", (event) => {
        for (const listener of this.listeners) listener(event.query);
      });
    }
  }

  /** Test and diagnostics hook: receives the SQL text of every statement. */
  onQuery(listener: QueryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
