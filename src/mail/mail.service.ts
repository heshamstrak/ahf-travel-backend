import { Inject, Injectable, Logger } from "@nestjs/common";
import { APP_CONFIG } from "../config/config.module";
import type { AppConfig } from "../config/env";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Delivery is a port. V1 ships a logging transport for development and an in-memory
 * outbox for tests. A provider adapter (SES, SendGrid, ...) is added without changing callers.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger("Mail");
  private readonly sent: OutgoingMail[] = [];

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  send(mail: OutgoingMail): Promise<void> {
    if (this.config.mailTransport === "memory") {
      this.sent.push(mail);
      return Promise.resolve();
    }
    // The body can contain a single-use link. Log only the recipient and subject in production.
    this.logger.log(`to=${mail.to} subject="${mail.subject}"`);
    if (this.config.nodeEnv !== "production") {
      this.logger.debug(mail.text);
    }
    return Promise.resolve();
  }

  /** Test helper: messages sent through the memory transport. */
  outbox(): readonly OutgoingMail[] {
    return this.sent;
  }

  clearOutbox(): void {
    this.sent.length = 0;
  }
}
