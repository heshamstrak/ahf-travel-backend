import { Global, Injectable, Module } from "@nestjs/common";

/**
 * The only source of "now" for pricing, expiry and business dates. Tests move it forward with
 * advance() to prove expiry without sleeping. Production code never calls advance().
 */
@Injectable()
export class Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(ms: number): void {
    this.offsetMs += ms;
  }

  reset(): void {
    this.offsetMs = 0;
  }
}

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
