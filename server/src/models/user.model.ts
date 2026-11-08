import { Schema, model, models, Types, type HydratedDocument } from "mongoose";

export interface User {
  userId: string;
  name: string;
  username: string;
  email: string;
  passwordHash: string;
  tokenVersion: number;
}

const userSchema = new Schema<User>(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      default: () => new Types.ObjectId().toString(),
    },
    name: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true, lowercase: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    tokenVersion: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

userSchema.set("toJSON", {
  transform: (_document, returnedUser) => {
    const sanitizedUser = returnedUser as unknown as Record<string, unknown>;
    delete sanitizedUser.passwordHash;
    delete sanitizedUser.__v;
    return returnedUser;
  },
});

export type UserDocument = HydratedDocument<User>;
export const UserModel = models.User || model<User>("User", userSchema);
