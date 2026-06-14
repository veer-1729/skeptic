import { z } from "zod";

export const chargeSchema = z.object({ orderId: z.string(), amount: z.number() });

export function charge(body: unknown) {
  return chargeSchema.parse(body);
}
