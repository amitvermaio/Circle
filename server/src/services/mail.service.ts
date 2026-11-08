import { config } from "../config/config";

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailInput): Promise<void> {
  if (config.NODE_ENV === "development") {
    console.info("Development email (not sent)", { to, subject, html });
  }

  // TODO: Create the mail transport and call transport.sendMail() when email delivery is enabled.
}
