interface Reservation {
  total: number;
}

export function totalInCents(reservation: Reservation): number {
  return reservation.total * 100;
}
