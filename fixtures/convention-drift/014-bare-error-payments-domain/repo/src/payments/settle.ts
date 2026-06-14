export function settle(_req: unknown, res: { send: (body: string) => void }) {
  try {
    return gateway.settle();
  } catch (err) {
    return res.send(String(err));
  }
}
