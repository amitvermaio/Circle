import { Schema, model, models } from "mongoose";

export interface PendingRegistration {
  email: string;
  name: string;
  username: string;
  passwordHash: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
}

const pendingRegistrationSchema = new Schema<PendingRegistration>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, expires: 0 },
    attempts: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

export const PendingRegistrationModel =
  models.PendingRegistration || model<PendingRegistration>("PendingRegistration", pendingRegistrationSchema);
