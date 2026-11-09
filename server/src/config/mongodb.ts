import mongoose from "mongoose";

import { config } from "./config";

export async function connectToDatabase(): Promise<void> {
  try {
    const conn = await mongoose.connect(config.MONGO_URI);
    console.log("Database Connected.")
  } catch (error) {
    console.log("Error Connecting Database.\n", error);
  }
}
