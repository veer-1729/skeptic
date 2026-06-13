interface Reservation {
  total: unknown;
}

export function totalInCents(reservation: Reservation): number {
  return (reservation.total as any) * 100;
}
