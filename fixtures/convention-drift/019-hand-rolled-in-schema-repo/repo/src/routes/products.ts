import { z } from "zod";

export const productSchema = z.object({ sku: z.string() });

export function createProduct(body: unknown) {
  const parsed = productSchema.parse(body);
  return db.insert(parsed);
}
