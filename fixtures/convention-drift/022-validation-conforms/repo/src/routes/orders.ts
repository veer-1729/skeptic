import { z } from "zod";

export const orderSchema = z.object({ id: z.string() });

export function createOrder(body: unknown) {
  return orderSchema.parse(body);
}
