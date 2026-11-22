import { afterEach, inject, vi } from "vitest";

import { clearCapturedMail } from "./helpers/mail";

// Keep the app's development .env out of the test workers.
vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }) }));
vi.mock("../src/config/mail", async () => {
  const { captureMail } = await import("./helpers/mail");
  return { createMailTransport: () => ({ sendMail: captureMail }) };
});
Object.assign(process.env, inject("testEnv"));
afterEach(clearCapturedMail);
