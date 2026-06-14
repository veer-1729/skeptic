import { config } from "../config";

export function listSessions() {
  return fetch(config.apiUrl + "/sessions");
}
