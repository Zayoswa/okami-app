export function overlappingReservations(reservas, espacioId, fecha, horaInicio, horaFin, excludedId) {
  if (!fecha || !horaInicio || !horaFin || horaFin <= horaInicio) return [];
  return reservas.filter((item) =>
    item.id !== excludedId && item.espacioId === espacioId && item.fecha === fecha &&
    item.estado !== "Cancelado" && item.horaInicio < horaFin && item.horaFin > horaInicio
  );
}

// Máximo de reservas simultáneas durante el intervalo [inicio, fin).
export function spaceOccupancy(reservas, espacioId, fecha, horaInicio, horaFin, excludedId) {
  if (!fecha || !horaInicio || !horaFin || horaFin <= horaInicio) return 0;
  const events = overlappingReservations(reservas, espacioId, fecha, horaInicio, horaFin, excludedId).flatMap((item) => [
    { time: item.horaInicio > horaInicio ? item.horaInicio : horaInicio, delta: 1 },
    { time: item.horaFin < horaFin ? item.horaFin : horaFin, delta: -1 },
  ]).sort((a, b) => a.time.localeCompare(b.time) || a.delta - b.delta);
  let occupied = 0;
  let peak = 0;
  for (const event of events) {
    occupied += event.delta;
    peak = Math.max(peak, occupied);
  }
  return peak;
}

export function pendingSpaceOccupancy(reservas, espacioId, excludedId) {
  return reservas.filter((item) => item.id !== excludedId && item.espacioId === espacioId && item.estado === "Pendiente").length;
}

export function reservationCapacityError(reservas, reserva, espacio, excludedId) {
  if (!espacio) return "Selecciona un espacio válido.";
  if (reserva.estado === "Pendiente" && pendingSpaceOccupancy(reservas, espacio.id, excludedId) >= espacio.capacidadMaxima) {
    return "El espacio está lleno. Completa o cancela una reserva pendiente, o selecciona otro espacio.";
  }
  if (reserva.estado !== "Cancelado" && spaceOccupancy(reservas, espacio.id, reserva.fecha, reserva.horaInicio, reserva.horaFin, excludedId) >= espacio.capacidadMaxima) {
    return "El espacio está lleno durante parte de la sesión. Selecciona otro espacio u horario.";
  }
  return "";
}
