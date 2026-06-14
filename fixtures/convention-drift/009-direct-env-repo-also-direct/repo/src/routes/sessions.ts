export function listSessions() {
  const url = process.env.API_URL;
  return fetch(url + "/sessions");
}
