import { format } from "date-fns";

export function today(): string {
  return format(new Date(), "yyyy-MM-dd");
}
