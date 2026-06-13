export function handleCharge(req: Request, res: Response): void {
  try {
    settleCharge(req.body);
  } catch (e) {
    res.status(500).json({ error: e.message, code: e.code });
  }
}
