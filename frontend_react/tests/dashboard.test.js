import test from "node:test";
import assert from "node:assert/strict";
import {
  averageTicket, hoursByPuesto, percentChange, revenueByWeek, sessionShare, sessionsToClose,
  statusCounts, upcomingSessions, weekStart, weekSummary,
} from "../src/utils/dashboard.js";
import { flattenSessions } from "../src/utils/sessions.js";

const sesion = (id, fecha, estado, overrides = {}) => ({ id, fecha, estado, puestoId: "4", horaInicio: "10:00", horaFin: "12:00", ...overrides });
const reserva = (id, precio, sesiones) => ({ id, precio, tatuador: "Ana", tatuadorId: "t1", cliente: "Cliente", sesiones });

// Semana del lunes 2 al domingo 8 de noviembre de 2026.
const rows = [
  reserva("a", 300000, [sesion("a1", "2026-11-03", "Completada"), sesion("a2", "2026-11-05", "Programada"), sesion("a3", "2026-11-20", "Programada")]),
  reserva("b", 100000, [sesion("b1", "2026-11-04", "Completada"), sesion("b2", "2026-11-06", "Cancelada")]),
  reserva("c", 80000, [sesion("c1", "2026-10-28", "Completada")]),
  reserva("d", 50000, [sesion("d1", "2026-11-07", "Cancelada")]),
];

test("la semana empieza el lunes", () => {
  assert.equal(weekStart("2026-11-08"), "2026-11-02");
  assert.equal(weekStart("2026-11-02"), "2026-11-02");
});

test("el precio se reparte entre las sesiones no canceladas", () => {
  assert.equal(sessionShare(rows[0]), 100000);
  assert.equal(sessionShare(rows[1]), 100000, "la sesión cancelada no cuenta");
  assert.equal(sessionShare(rows[3]), 0, "una reserva toda cancelada no genera ingreso");
});

test("el resumen semanal separa ganancias (completadas) de lo que falta por cobrar", () => {
  assert.deepEqual(weekSummary(rows, "2026-11-02"), {
    desde: "2026-11-02", hasta: "2026-11-08",
    ganancias: 200000, porCobrar: 100000, completadas: 2, programadas: 1, canceladas: 2,
  });
});

test("las ganancias por semana terminan en la semana pedida", () => {
  const weeks = revenueByWeek(rows, "2026-11-02", 3);
  assert.deepEqual(weeks.map(({ inicio, ganancias }) => [inicio, ganancias]),
    [["2026-10-19", 0], ["2026-10-26", 80000], ["2026-11-02", 200000]]);
});

test("las reservas se cuentan por su estado resumido", () => {
  assert.deepEqual(statusCounts(rows), [
    { estado: "Completada", total: 2 }, { estado: "Programada", total: 1 }, { estado: "Cancelada", total: 1 },
  ]);
});

test("las horas por puesto excluyen canceladas y fechas fuera del rango", () => {
  const puestos = [{ id: "4", nombre: "Puesto 4" }, { id: "9", nombre: "Puesto 9" }];
  const sesiones = flattenSessions(rows);
  assert.deepEqual(hoursByPuesto(sesiones, puestos, "2026-11-02", "2026-11-08").map(({ id, horas }) => [id, horas]),
    [["4", 6], ["9", 0]]);
});

test("ticket promedio, sesiones por cerrar, próximas y variación", () => {
  assert.equal(averageTicket(rows), Math.round((300000 + 100000 + 80000) / 3));
  const sesiones = flattenSessions(rows);
  assert.deepEqual(sessionsToClose(sesiones, "2026-11-06", "11:00").map(({ id }) => id), ["a2"]);
  assert.deepEqual(upcomingSessions(sesiones, "2026-11-05", "11:00", 30).map(({ id }) => id), ["a2", "a3"]);
  assert.equal(percentChange(150, 100), 50);
  assert.equal(percentChange(100, 0), null);
});
