export function listUsers() {
  const url = process.env.API_URL;
  return fetch(url + "/users");
}
