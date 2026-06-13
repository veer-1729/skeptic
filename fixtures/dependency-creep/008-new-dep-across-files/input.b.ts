import { addDays } from "date-fns";

export function nextWeek(start: Date): Date {
  return addDays(start, 7);
}
