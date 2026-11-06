import { todayInSantiago } from "./calendar.js";
import { reservationStatus } from "./sessions.js";

// Una reserva coincide con el período si alguna de sus sesiones cae en él.
export function filterReservations(reservas, estado, periodo, now = new Date()) {
  const today = todayInSantiago(now);
  const weekStart = new Date(`${today}T12:00:00Z`);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);
  const weekStartKey = weekStart.toISOString().slice(0, 10);
  const inPeriod = (fecha) => {
    if (periodo === "hoy") return fecha === today;
    if (periodo === "semana") return fecha >= weekStartKey && fecha <= today;
    if (periodo === "mes") return fecha.slice(0, 7) === today.slice(0, 7);
    return true;
  };

  return reservas.filter((reserva) => {
    if (estado !== "todos" && reservationStatus(reserva) !== estado) return false;
    return (reserva.sesiones ?? []).some(({ fecha }) => inPeriod(fecha));
  });
}

export function filterReservationsByCustomer(reservas, query) {
  const normalized = query.trim().toLocaleLowerCase("es-CL");
  if (!normalized) return reservas;
  return reservas.filter((reserva) => reserva.cliente?.toLocaleLowerCase("es-CL").includes(normalized));
}
