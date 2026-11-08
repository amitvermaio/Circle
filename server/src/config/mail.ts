import nodemailer, { type Transporter } from "nodemailer";

import { config } from "./config";

export function createMailTransport(): Transporter {
  if (!config.SMTP_HOST) {
    throw new Error("SMTP_HOST must be configured before creating a mail transport");
  }

  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT ?? 587,
    secure: config.SMTP_PORT === 465,
    auth:
      config.SMTP_USER && config.SMTP_PASS
        ? { user: config.SMTP_USER, pass: config.SMTP_PASS }
        : undefined,
  });
}
