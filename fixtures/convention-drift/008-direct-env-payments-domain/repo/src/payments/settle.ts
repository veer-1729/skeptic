export function settle(batchId: string) {
  const key = process.env.STRIPE_KEY;
  return gateway.settle(batchId, key);
}
