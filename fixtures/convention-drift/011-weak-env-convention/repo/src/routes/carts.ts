export function listCarts() {
  const url = process.env.API_URL;
  return fetch(url + "/carts");
}
