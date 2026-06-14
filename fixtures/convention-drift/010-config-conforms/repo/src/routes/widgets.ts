import { config } from "../config";

export function listWidgets() {
  return fetch(config.apiUrl + "/widgets");
}
