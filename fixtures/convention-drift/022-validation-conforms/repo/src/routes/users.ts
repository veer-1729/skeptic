import { z } from "zod";

export const userSchema = z.object({ email: z.string().email() });

export function createUser(body: unknown) {
  return userSchema.parse(body);
}
