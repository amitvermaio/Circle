import { inject, vi } from "vitest";

// Keep the app's development .env out of the test workers.
vi.mock("dotenv", () => ({ config: () => ({ parsed: {} }) }));
Object.assign(process.env, inject("testEnv"));
