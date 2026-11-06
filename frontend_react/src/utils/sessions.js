// Una reserva (el tatuaje) tiene una o más sesiones; cada sesión ocupa un puesto en un horario.
// Cada puesto tiene capacidad 1 y un tatuador no puede estar en dos sesiones a la vez.

// Lista plana de sesiones con los datos de su reserva, para el calendario y las validaciones.
export function flattenSessions(reservas) {
  return reservas.flatMap((reserva) => (reserva.sesiones ?? []).map((sesion, index, all) => ({
    ...sesion,
    reservaId: reserva.id,
    tatuadorId: reserva.tatuadorId,
    tatuador: reserva.tatuador,
    cliente: reserva.cliente,
    numero: index + 1,
    total: all.length,
    reserva,
  })));
}

// Estado resumido de la reserva a partir de sus sesiones.
export function reservationStatus(reserva) {
  const sesiones = reserva.sesiones ?? [];
  const active = sesiones.filter(({ estado }) => estado !== "Cancelado");
  if (active.length === 0) return "Cancelado";
  if (active.every(({ estado }) => estado === "Completado")) return "Completado";
  if (active.some(({ estado }) => estado === "Pendiente")) return "Pendiente";
  return "Confirmada";
}

export function completedSessions(reserva) {
  return (reserva.sesiones ?? []).filter(({ estado }) => estado === "Completado").length;
}

// Primera y última fecha de la reserva.
export function reservationRange(reserva) {
  const fechas = (reserva.sesiones ?? []).map(({ fecha }) => fecha).sort();
  return { primera: fechas[0] ?? "", ultima: fechas.at(-1) ?? "" };
}

function overlaps(a, b) {
  return a.fecha === b.fecha && a.horaInicio < b.horaFin && b.horaInicio < a.horaFin;
}

function isActive(sesion) {
  return sesion.estado !== "Cancelado";
}

// Sesiones de OTRAS reservas que ocupan el mismo puesto en ese horario.
export function puestoConflicts(sesiones, candidate, reservaId) {
  if (!isActive(candidate) || !candidate.puestoId || !hasValidHours(candidate)) return [];
  return sesiones.filter((item) => item.reservaId !== reservaId && isActive(item) &&
    item.puestoId === candidate.puestoId && overlaps(item, candidate));
}

// Sesiones de OTRAS reservas del mismo tatuador en ese horario.
export function artistConflicts(sesiones, candidate, tatuadorId, reservaId) {
  if (!isActive(candidate) || !tatuadorId || !hasValidHours(candidate)) return [];
  return sesiones.filter((item) => item.reservaId !== reservaId && isActive(item) &&
    item.tatuadorId === tatuadorId && overlaps(item, candidate));
}

export function hasValidHours(sesion) {
  return Boolean(sesion.fecha && sesion.horaInicio && sesion.horaFin && sesion.horaFin > sesion.horaInicio);
}

// Índices de las sesiones del formulario que se cruzan con otra sesión de la misma reserva.
export function overlappingWithinReservation(sesiones) {
  const result = new Set();
  sesiones.forEach((a, i) => sesiones.forEach((b, j) => {
    if (i < j && isActive(a) && isActive(b) && hasValidHours(a) && hasValidHours(b) && overlaps(a, b)) {
      result.add(i);
      result.add(j);
    }
  }));
  return result;
}
