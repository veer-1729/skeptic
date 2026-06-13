export function vaultToken(): string {
  return process.env.ACME_VAULT || "local-dev-token";
}
