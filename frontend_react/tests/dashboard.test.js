import test from "node:test";
import assert from "node:assert/strict";
import {
  artistRanking, averageTicket, hoursByPuesto, percentChange, revenueByWeek, sessionShare, sessionsToClose,
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

test("de una reserva borrada solo cuentan sus sesiones completadas", () => {
  const borrada = { ...reserva("e", 200000, [sesion("e1", "2026-11-03", "Completada"), sesion("e2", "2026-11-05", "Programada")]), archivadaEn: "2026-11-06T10:00:00Z" };
  const semana = weekSummary([...rows, borrada], "2026-11-02");
  assert.equal(semana.ganancias, 300000, "suma los $100.000 de la sesión completada");
  assert.equal(semana.porCobrar, 100000, "su sesión programada ya no se cobrará");
  assert.equal(semana.programadas, 1);
  const [ana] = artistRanking([...rows, borrada], "2026-10-26", "2026-11-08", { desde: "2026-11-02", hasta: "2026-11-08" });
  assert.equal(ana.ganancias, 380000);
});

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

test("el ranking de tatuadores ordena por ganancias de sesiones completadas", () => {
  const otros = [
    ...rows,
    { id: "e", precio: 400000, tatuador: "Bruno", tatuadorId: "t2", cliente: "X", sesiones: [sesion("e1", "2026-11-04", "Completada"), sesion("e2", "2026-10-29", "Completada")] },
  ];
  const ranking = artistRanking(otros, "2026-10-26", "2026-11-08", { desde: "2026-11-02", hasta: "2026-11-08" });
  assert.deepEqual(ranking.map(({ nombre, ganancias, semana, sesiones, reservas, promedioSesion }) => [nombre, ganancias, semana, sesiones, reservas, promedioSesion]), [
    ["Bruno", 400000, 200000, 2, 1, 200000],
    ["Ana", 280000, 200000, 3, 3, 93333],
  ]);
});

test("textos del arriendo: meses y cálculo", async () => {
  const { formatMonth, monthOf, rentDetail, shiftMonth, tariffText } = await import("../src/utils/arriendos.js");
  assert.equal(monthOf("2026-11-18"), "2026-11");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.match(formatMonth("2026-11"), /noviembre/);
  const fila = { cobro: "turno", turnos: 7, precioUnitario: 12000, minimo: 60000 };
  assert.equal(rentDetail(fila), "7 turnos × $12.000");
  assert.equal(rentDetail({ ...fila, turnos: 2 }), "Mínimo mensual $60.000 (2 turnos)");
  assert.equal(rentDetail({ cobro: "dia", dias: 1, precioUnitario: 15000 }), "1 día × $15.000");
  assert.equal(rentDetail({ cobro: "mensual" }), "Monto mensual fijo");
  assert.match(rentDetail({ cobro: null }), /Sin modalidad/);
  assert.equal(tariffText({ cobro: "dia", monto: 15000, minimo: 0, montoReducido: 12000, diasReducido: 5 }),
    "$15.000 por día · desde 5 días en el mes, $12.000 cada día");
});

test("métricas por mes y arriendo por modalidad", async () => {
  const { monthRange, monthSummary, rentByModality, revenueByMonth } = await import("../src/utils/dashboard.js");
  assert.deepEqual(monthRange("2026-02"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(monthRange("2026-12"), { desde: "2026-12-01", hasta: "2026-12-31" });
  const noviembre = monthSummary(rows, "2026-11");
  assert.equal(noviembre.ganancias, 200000, "a1 y b1 completadas en noviembre");
  assert.equal(noviembre.porCobrar, 200000, "a2 y a3 programadas en noviembre");
  const meses = revenueByMonth(rows, "2026-11", 2);
  assert.deepEqual(meses.map(({ periodo, ganancias }) => [periodo, ganancias]), [["2026-10", 80000], ["2026-11", 200000]]);
  const grupos = rentByModality([
    { modalidad: "Rotativo", cargo: 60000, pagado: 0 }, { modalidad: "Full", cargo: 220000, pagado: 220000 },
    { modalidad: "Rotativo", cargo: 84000, pagado: 60000 }, { modalidad: null, cargo: 0, pagado: 0 },
  ]);
  assert.deepEqual(grupos.map(({ modalidad, cargo, tatuadores }) => [modalidad, cargo, tatuadores]),
    [["Full", 220000, 1], ["Rotativo", 144000, 2], ["Sin modalidad", 0, 1]]);
});
