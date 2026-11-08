// Todos entran por Inicio, que tiene un botón para cada módulo.
export function homeForUser(user) {
  if (user?.role === "admin" || user?.role === "tatuador") return "/inicio";
  return "/login";
}

export function ownsReservation(user, reserva) {
  if (!user || !reserva) return false;
  return reserva.tatuadorId !== undefined
    ? reserva.tatuadorId === user.id
    : reserva.tatuador === user.name;
}

export function canManageReservation(user, reserva) {
  return user?.role === "admin" || (user?.role === "tatuador" && ownsReservation(user, reserva));
}
