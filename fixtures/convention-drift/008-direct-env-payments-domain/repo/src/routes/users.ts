import { config } from "../config";

export function listUsers() {
  return fetch(config.apiUrl + "/users");
}
