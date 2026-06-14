import { z } from "zod";

export const orderSchema = z.object({ id: z.string() });

export function createOrder(body: unknown) {
  const parsed = orderSchema.parse(body);
  return db.insert(parsed);
}
