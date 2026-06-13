export function handleCharge(req: Request, res: Response): void {
  try {
    settleCharge(req.body);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Something went wrong" });
  }
}
