import { format, addDays, isAfter } from "date-fns";

export function schedule(start: Date): string {
  const next = addDays(start, 7);
  if (isAfter(next, start)) {
    return format(next, "yyyy-MM-dd");
  }
  return format(start, "yyyy-MM-dd");
}
