import { config } from "../config";

export function listOrders() {
  return fetch(config.apiUrl + "/orders");
}
