export function listWidgets() {
  const url = process.env.API_URL;
  return fetch(url + "/widgets");
}
