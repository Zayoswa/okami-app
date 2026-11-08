// Todos entran por Inicio, que tiene un botón para cada módulo.
export function homeForUser(user) {
  if (["admin", "recepcion", "tatuador"].includes(user?.role)) return "/inicio";
  return "/login";
}

export function ownsReservation(user, reserva) {
  if (!user || !reserva) return false;
  return reserva.tatuadorId !== undefined
    ? reserva.tatuadorId === user.id
    : reserva.tatuador === user.name;
}

export function canManageReservation(user, reserva) {
  // Admin y recepción gestionan todas las reservas (recepción, desde el Calendario).
  return user?.role === "admin" || user?.role === "recepcion" || (user?.role === "tatuador" && ownsReservation(user, reserva));
}
