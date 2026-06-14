import { z } from "zod";

export const productSchema = z.object({ sku: z.string() });

export function createProduct(body: unknown) {
  return productSchema.parse(body);
}
