import { todayInSantiago } from "./calendar.js";

export function filterReservations(reservas, estado, periodo, now = new Date()) {
  const today = todayInSantiago(now);
  const weekStart = new Date(`${today}T12:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekStartKey = weekStart.toISOString().slice(0, 10);

  return reservas.filter((reserva) => {
    if (estado !== "todos" && reserva.estado !== estado) return false;
    if (periodo === "hoy") return reserva.fecha === today;
    if (periodo === "semana") return reserva.fecha >= weekStartKey && reserva.fecha <= today;
    if (periodo === "mes") return reserva.fecha.slice(0, 7) === today.slice(0, 7);
    return true;
  });
}

export function filterReservationsByCustomer(reservas, query) {
  const normalized = query.trim().toLocaleLowerCase("es-CL");
  if (!normalized) return reservas;
  return reservas.filter((reserva) => reserva.cliente?.toLocaleLowerCase("es-CL").includes(normalized));
}
