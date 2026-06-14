import { debounce } from "lodash";

export function register(fn: () => void): void {
  debounce(fn);
}
