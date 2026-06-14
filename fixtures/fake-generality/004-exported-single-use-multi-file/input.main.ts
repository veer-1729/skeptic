import { buildHeaders } from "./helper";

export async function callApi(token: string): Promise<Response> {
  return fetch("/x", { headers: buildHeaders(token) });
}
