export function listProducts(_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  try {
    return db.query("select * from products");
  } catch (err) {
    return res.status(500).json({ message: String(err) });
  }
}
