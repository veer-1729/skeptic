interface Session {
  userId: string | null;
}

export function currentUser(session: Session): string {
  const userId = session.userId;
  if (userId === null) {
    throw new Error("no active session");
  }
  return userId!.toUpperCase();
}
