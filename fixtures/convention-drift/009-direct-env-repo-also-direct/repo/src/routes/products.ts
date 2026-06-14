export function listProducts() {
  const url = process.env.API_URL;
  return fetch(url + "/products");
}
