import { z } from "zod";

export const userSchema = z.object({ email: z.string().email() });

export function createUser(body: unknown) {
  const parsed = userSchema.parse(body);
  return db.insert(parsed);
}
