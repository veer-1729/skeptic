interface Session {
  userId: string | null;
}

export function currentUser(session: Session): string {
  const userId = session.userId;
  return userId!.toUpperCase();
}
