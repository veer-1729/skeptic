import { z } from "zod";

export const refundSchema = z.object({ orderId: z.string() });

export function refund(body: unknown) {
  return refundSchema.parse(body);
}
