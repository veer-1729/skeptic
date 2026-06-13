export function chargeEndpoint(): string {
  return process.env.STRIPE_API_URL || "https://api.stripe.com";
}
