export function listOrders() {
  const url = process.env.API_URL;
  return fetch(url + "/orders");
}
