import { z } from "zod";

export const sessionSchema = z.object({ token: z.string() });

export function createSession(body: unknown) {
  const parsed = sessionSchema.parse(body);
  return db.insert(parsed);
}
