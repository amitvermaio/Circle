import mongoose from "mongoose";

import { config } from "./config";

export async function connectToDatabase(): Promise<void> {
  await mongoose.connect(config.MONGO_URI);
}
