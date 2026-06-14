export function settle(body: unknown) {
  if (!body || typeof body !== "object") {
    throw new Error("invalid body");
  }
  const b = body as { batchId?: unknown };
  if (!b.batchId || typeof b.batchId !== "string") {
    throw new Error("batchId required");
  }
  return gateway.settle(b.batchId);
}
