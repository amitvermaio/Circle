import nodemailer, { type Transporter } from "nodemailer";

import { config } from "./config";

export function createMailTransport(): Transporter {
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASS || !config.MAIL_FROM) {
    throw new Error("Set SMTP_HOST, SMTP_USER, SMTP_PASS, and MAIL_FROM to enable email delivery");
  }

  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: true,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}
