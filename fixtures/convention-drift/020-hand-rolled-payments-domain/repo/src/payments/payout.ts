import { z } from "zod";

export const payoutSchema = z.object({ accountId: z.string() });

export function payout(body: unknown) {
  return payoutSchema.parse(body);
}
