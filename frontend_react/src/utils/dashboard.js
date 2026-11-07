// Métricas del Dashboard gerencial, calculadas a partir de las reservas que ya carga la app.
//
// Ingreso de una sesión: el precio total de la reserva se reparte en partes iguales entre sus
// sesiones no canceladas. Ejemplo: $300.000 en 3 sesiones → $100.000 cada una.
// - "Ganancias" de un período = sesiones Completadas en ese período.
// - "Por cobrar" de un período = sesiones Programadas en ese período.
// Las fechas son "YYYY-MM-DD" en hora de Santiago, igual que en el resto de la app.

import { shiftDate, weekDays } from "./calendar.js";
import { reservationStatus } from "./sessions.js";

export const STATUS_ORDER = ["Completada", "Programada", "Cancelada"];

// Lunes de la semana que contiene la fecha.
export function weekStart(fecha) {
  return weekDays(fecha)[0].fecha;
}

// Ingreso que corresponde a cada sesión no cancelada de la reserva (0 si está toda cancelada).
export function sessionShare(reserva) {
  const activas = (reserva.sesiones ?? []).filter(({ estado }) => estado !== "Cancelada").length;
  return activas ? (Number(reserva.precio) || 0) / activas : 0;
}

// Todas las sesiones con su reserva y su parte del precio.
function sessionsWithShare(reservas) {
  return reservas.flatMap((reserva) => {
    const share = sessionShare(reserva);
    return (reserva.sesiones ?? []).map((sesion) => ({ ...sesion, reserva, ingreso: sesion.estado === "Cancelada" ? 0 : share }));
  });
}

const inRange = (fecha, desde, hasta) => fecha >= desde && fecha <= hasta;

// Resumen de una semana (lunes a domingo).
export function weekSummary(reservas, lunes) {
  const domingo = shiftDate(lunes, 6);
  const semana = sessionsWithShare(reservas).filter(({ fecha }) => inRange(fecha, lunes, domingo));
  const sum = (estado) => semana.filter((item) => item.estado === estado).reduce((total, item) => total + item.ingreso, 0);
  const count = (estado) => semana.filter((item) => item.estado === estado).length;
  return {
    desde: lunes,
    hasta: domingo,
    ganancias: Math.round(sum("Completada")),
    porCobrar: Math.round(sum("Programada")),
    completadas: count("Completada"),
    programadas: count("Programada"),
    canceladas: count("Cancelada"),
  };
}

// Ganancias de las últimas `weeks` semanas, terminando en la semana de `lunes`.
export function revenueByWeek(reservas, lunes, weeks = 12) {
  return Array.from({ length: weeks }, (_, index) => {
    const inicio = shiftDate(lunes, (index - weeks + 1) * 7);
    const { ganancias, porCobrar } = weekSummary(reservas, inicio);
    return { inicio, ganancias, porCobrar };
  });
}

// Cantidad de reservas según su estado resumido, en el orden de STATUS_ORDER.
export function statusCounts(reservas) {
  return STATUS_ORDER.map((estado) => ({ estado, total: reservas.filter((reserva) => reservationStatus(reserva) === estado).length }));
}

const minutes = (hora) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3, 5));

// Horas agendadas (sesiones no canceladas) por puesto entre dos fechas, de más a menos.
export function hoursByPuesto(sesiones, puestos, desde, hasta) {
  return puestos
    .map((puesto) => {
      const total = sesiones
        .filter((item) => item.puestoId === puesto.id && item.estado !== "Cancelada" && inRange(item.fecha, desde, hasta))
        .reduce((sum, item) => sum + (minutes(item.horaFin) - minutes(item.horaInicio)), 0);
      return { id: puesto.id, nombre: puesto.nombre, horas: total / 60 };
    })
    .sort((a, b) => b.horas - a.horas || a.nombre.localeCompare(b.nombre, "es", { numeric: true }));
}

// Precio promedio de las reservas que no están completamente canceladas.
export function averageTicket(reservas) {
  const validas = reservas.filter((reserva) => reservationStatus(reserva) !== "Cancelada");
  return validas.length ? Math.round(validas.reduce((sum, reserva) => sum + (Number(reserva.precio) || 0), 0) / validas.length) : 0;
}

// Sesiones que ya terminaron y siguen Programadas: hay que marcarlas como Completadas o Canceladas.
export function sessionsToClose(sesiones, fecha, hora) {
  return sesiones
    .filter((item) => item.estado === "Programada" && (item.fecha < fecha || (item.fecha === fecha && item.horaFin <= hora)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio));
}

// Próximas sesiones Programadas desde ahora y durante `days` días.
export function upcomingSessions(sesiones, fecha, hora, days = 7) {
  const hasta = shiftDate(fecha, days);
  return sesiones
    .filter((item) => item.estado === "Programada" && item.fecha <= hasta &&
      (item.fecha > fecha || (item.fecha === fecha && item.horaFin > hora)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio));
}

// Variación porcentual entre dos valores; null si no hay base para comparar.
export function percentChange(actual, anterior) {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}
