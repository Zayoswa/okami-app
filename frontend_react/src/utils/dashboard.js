// Métricas del Dashboard gerencial, calculadas a partir de las reservas que ya carga la app.
//
// Ingreso de una sesión: el precio total de la reserva se reparte en partes iguales entre sus
// sesiones no canceladas. Ejemplo: $300.000 en 3 sesiones → $100.000 cada una.
// - "Ganancias" de un período = sesiones Completadas en ese período.
// - "Por cobrar" de un período = sesiones Programadas en ese período.
// - Reservas del historial (borradas): solo cuentan sus sesiones Completadas, porque ese trabajo ya se hizo y se cobró.
//   Sus sesiones Programadas o Canceladas no cuentan en nada.
// Las fechas son "YYYY-MM-DD" en hora de Santiago, igual que en el resto de la app.

import { shiftDate, weekDays } from "./calendar.js";
import { shiftMonth } from "./arriendos.js";
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

// Todas las sesiones con su reserva y su parte del precio (de las reservas archivadas, solo las Completadas).
function sessionsWithShare(reservas) {
  return reservas.flatMap((reserva) => {
    const share = sessionShare(reserva);
    return (reserva.sesiones ?? [])
      .filter((sesion) => !reserva.archivadaEn || sesion.estado === "Completada")
      .map((sesion) => ({ ...sesion, reserva, ingreso: sesion.estado === "Cancelada" ? 0 : share }));
  });
}

const inRange = (fecha, desde, hasta) => fecha >= desde && fecha <= hasta;

// Primer y último día del mes "YYYY-MM".
export function monthRange(mes) {
  return { desde: `${mes}-01`, hasta: shiftDate(`${shiftMonth(mes, 1)}-01`, -1) };
}

// Resumen de un período (fechas incluidas).
export function rangeSummary(reservas, desde, hasta) {
  const semana = sessionsWithShare(reservas).filter(({ fecha }) => inRange(fecha, desde, hasta));
  const sum = (estado) => semana.filter((item) => item.estado === estado).reduce((total, item) => total + item.ingreso, 0);
  const count = (estado) => semana.filter((item) => item.estado === estado).length;
  return {
    desde,
    hasta,
    ganancias: Math.round(sum("Completada")),
    porCobrar: Math.round(sum("Programada")),
    completadas: count("Completada"),
    programadas: count("Programada"),
    canceladas: count("Cancelada"),
  };
}

// Resumen de una semana (lunes a domingo).
export function weekSummary(reservas, lunes) {
  return rangeSummary(reservas, lunes, shiftDate(lunes, 6));
}

// Resumen de un mes "YYYY-MM".
export function monthSummary(reservas, mes) {
  const { desde, hasta } = monthRange(mes);
  return rangeSummary(reservas, desde, hasta);
}

// Ganancias de los últimos `months` meses, terminando en `mes`.
export function revenueByMonth(reservas, mes, months = 6) {
  return Array.from({ length: months }, (_, index) => {
    const periodo = shiftMonth(mes, index - months + 1);
    const { ganancias, porCobrar } = monthSummary(reservas, periodo);
    return { periodo, ganancias, porCobrar };
  });
}

// Arriendo del mes agrupado por modalidad: [{ modalidad, cargo, pagado, tatuadores }], de mayor a menor.
export function rentByModality(filas) {
  const groups = new Map();
  for (const fila of filas) {
    const key = fila.modalidad ?? "Sin modalidad";
    const group = groups.get(key) ?? { modalidad: key, cargo: 0, pagado: 0, tatuadores: 0 };
    group.cargo += fila.cargo;
    group.pagado += fila.pagado;
    group.tatuadores += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.cargo - a.cargo || a.modalidad.localeCompare(b.modalidad, "es"));
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

// Ranking de tatuadores por ganancias entre dos fechas (sesiones completadas), de mayor a menor.
// semana: { desde, hasta } para la columna de la semana seleccionada.
export function artistRanking(reservas, desde, hasta, semana) {
  const rows = new Map();
  for (const item of sessionsWithShare(reservas)) {
    const { reserva } = item;
    const key = reserva.tatuadorId ?? reserva.tatuador;
    if (!rows.has(key)) rows.set(key, { id: key, nombre: reserva.tatuador, ganancias: 0, semana: 0, sesiones: 0, reservas: new Set() });
    if (item.estado !== "Completada") continue;
    const row = rows.get(key);
    if (inRange(item.fecha, desde, hasta)) {
      row.ganancias += item.ingreso;
      row.sesiones += 1;
      row.reservas.add(reserva.id);
    }
    if (inRange(item.fecha, semana.desde, semana.hasta)) row.semana += item.ingreso;
  }
  return [...rows.values()]
    .map(({ reservas: ids, ...row }) => ({
      ...row,
      ganancias: Math.round(row.ganancias),
      semana: Math.round(row.semana),
      reservas: ids.size,
      promedioSesion: row.sesiones ? Math.round(row.ganancias / row.sesiones) : 0,
    }))
    .sort((a, b) => b.ganancias - a.ganancias || a.nombre.localeCompare(b.nombre, "es"));
}
