import test from "node:test";
import assert from "node:assert/strict";
import { filterReservations, filterReservationsByCustomer } from "../src/utils/filterReservations.js";
import {
  artistConflicts, completedSessions, flattenSessions, overlappingWithinReservation,
  puestoConflicts, reservationRange, reservationStatus,
} from "../src/utils/sessions.js";

function session(id, overrides = {}) {
  return { id, puestoId: "4", puesto: "Puesto 4", fecha: "2026-10-04", horaInicio: "10:00", horaFin: "12:00", estado: "Pendiente", ...overrides };
}

function reservation(id, sesiones = [session(`${id}-1`)], overrides = {}) {
  return {
    id, cliente: "Cliente", tatuador: "Tatuador", tatuadorId: "t1", precio: 50000,
    fechaCreacion: "2026-10-01T12:00:00Z", sesiones, ...overrides,
  };
}

test("los filtros respetan el cambio de mes y la fecha de Santiago", () => {
  const rows = ["2026-09-27", "2026-09-28", "2026-10-03", "2026-10-04", "2026-10-05"]
    .map((fecha, id) => reservation(id, [session(`${id}`, { fecha })]));
  const now = new Date("2026-10-05T01:00:00Z");
  assert.deepEqual(filterReservations(rows, "todos", "hoy", now).map((row) => row.id), [3]);
  assert.deepEqual(filterReservations(rows, "todos", "semana", now).map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(filterReservations(rows, "todos", "mes", now).map((row) => row.id), [2, 3, 4]);
  assert.equal(filterReservations(rows, "Cancelado", "mes", now).length, 0);
});

test("una reserva coincide con el período si alguna de sus sesiones cae en él", () => {
  const rows = [reservation("r", [session("a", { fecha: "2026-09-01" }), session("b", { fecha: "2026-10-04" })])];
  const now = new Date("2026-10-05T01:00:00Z");
  assert.equal(filterReservations(rows, "todos", "hoy", now).length, 1);
  assert.equal(filterReservations(rows, "todos", "todas", now).length, 1);
});

test("la búsqueda por cliente ignora mayúsculas", () => {
  const rows = [reservation(1, undefined, { cliente: "Ana Pérez" }), reservation(2, undefined, { cliente: "Bruno Toro" })];
  assert.deepEqual(filterReservationsByCustomer(rows, "ana").map(({ id }) => id), [1]);
  assert.deepEqual(filterReservationsByCustomer(rows, "TORO").map(({ id }) => id), [2]);
  assert.equal(filterReservationsByCustomer(rows, "").length, 2);
});

test("el estado de la reserva resume el de sus sesiones", () => {
  const withStates = (...estados) => reservation("r", estados.map((estado, i) => session(`${i}`, { estado })));
  assert.equal(reservationStatus(withStates("Completado", "Pendiente")), "Pendiente");
  assert.equal(reservationStatus(withStates("Completado", "Completado", "Cancelado")), "Completado");
  assert.equal(reservationStatus(withStates("Cancelado", "Cancelado")), "Cancelado");
  assert.equal(reservationStatus(withStates("Confirmada", "Completado")), "Confirmada");
  assert.equal(completedSessions(withStates("Completado", "Pendiente", "Completado")), 2);
});

test("el rango de la reserva va de la primera a la última sesión", () => {
  const row = reservation("r", [session("b", { fecha: "2026-12-08" }), session("a", { fecha: "2026-11-10" })]);
  assert.deepEqual(reservationRange(row), { primera: "2026-11-10", ultima: "2026-12-08" });
});

test("la lista plana numera las sesiones y conserva los datos de la reserva", () => {
  const flat = flattenSessions([reservation("r", [session("a"), session("b", { fecha: "2026-10-11" })])]);
  assert.deepEqual(flat.map(({ id, reservaId, numero, total, tatuadorId }) => [id, reservaId, numero, total, tatuadorId]),
    [["a", "r", 1, 2, "t1"], ["b", "r", 2, 2, "t1"]]);
});

test("un puesto atiende una sesión a la vez; las contiguas y canceladas no chocan", () => {
  const others = flattenSessions([reservation("otra", [session("x")])]);
  assert.equal(puestoConflicts(others, session("n", { horaInicio: "11:00", horaFin: "13:00" }), "nueva").length, 1);
  assert.equal(puestoConflicts(others, session("n", { horaInicio: "12:00", horaFin: "14:00" }), "nueva").length, 0);
  assert.equal(puestoConflicts(others, session("n", { puestoId: "5" }), "nueva").length, 0);
  assert.equal(puestoConflicts(others, session("n", { estado: "Cancelado" }), "nueva").length, 0);
  // Al editar la misma reserva, sus propias sesiones no cuentan como choque.
  assert.equal(puestoConflicts(others, session("x"), "otra").length, 0);
});

test("un tatuador no puede estar en dos puestos a la misma hora", () => {
  const others = flattenSessions([reservation("otra", [session("x", { puestoId: "1" })])]);
  assert.equal(artistConflicts(others, session("n", { puestoId: "9" }), "t1", "nueva").length, 1);
  assert.equal(artistConflicts(others, session("n", { puestoId: "9" }), "t2", "nueva").length, 0);
});

test("detecta sesiones de la misma reserva que se cruzan", () => {
  const sessions = [session("a"), session("b", { horaInicio: "11:00", horaFin: "13:00" }), session("c", { fecha: "2026-10-05" })];
  assert.deepEqual([...overlappingWithinReservation(sessions)].sort(), [0, 1]);
  sessions[1].estado = "Cancelado";
  assert.equal(overlappingWithinReservation(sessions).size, 0);
});
