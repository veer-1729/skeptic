import { z } from "zod";

export const widgetSchema = z.object({ name: z.string() });

export function createWidget(body: unknown) {
  return widgetSchema.parse(body);
}
