import { config } from "../config/config";
import { createMailTransport } from "../config/mail";

let transport: ReturnType<typeof createMailTransport> | undefined;

export async function verifyMailTransport(): Promise<void> {
  try {
    transport ??= createMailTransport();
    await transport.verify();
    console.info("SMTP connection verified");
  } catch (error) {
    console.error("SMTP verification failed. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and MAIL_FROM.", smtpErrorCode(error));
  }
}

function smtpErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
    ? error.code
    : "";
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailInput): Promise<void> {
  try {
    transport ??= createMailTransport();
    await transport.sendMail({ from: config.MAIL_FROM, to, subject, html });
  } catch (error) {
    console.error("SMTP delivery failed", smtpErrorCode(error));
    throw Object.assign(new Error("Email delivery is temporarily unavailable. Try again later."), {
      statusCode: 503,
      code: "MAIL_UNAVAILABLE",
    });
  }
}
