import { z } from "zod";

export const PriceSchema = z.object({
  cents: z.number().int().nonnegative(),
});
