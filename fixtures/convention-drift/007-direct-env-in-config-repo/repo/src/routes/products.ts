import { config } from "../config";

export function listProducts() {
  return fetch(config.apiUrl + "/products");
}
