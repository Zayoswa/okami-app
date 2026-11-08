import test from "node:test";
import assert from "node:assert/strict";
import { filterReservationList } from "../src/utils/filterReservations.js";
import {
  artistConflicts, completedSessions, flattenSessions, overlappingWithinReservation,
  puestoConflicts, reservationRange, reservationStatus,
} from "../src/utils/sessions.js";

function session(id, overrides = {}) {
  return { id, puestoId: "4", puesto: "Puesto 4", fecha: "2026-10-04", horaInicio: "10:00", horaFin: "12:00", estado: "Programada", ...overrides };
}

function reservation(id, sesiones = [session(`${id}-1`)], overrides = {}) {
  return {
    id, cliente: "Cliente", tatuador: "Tatuador", tatuadorId: "t1", precio: 50000,
    fechaCreacion: "2026-10-01T12:00:00Z", sesiones, ...overrides,
  };
}

test("el estado de la reserva resume el de sus sesiones", () => {
  const withStates = (...estados) => reservation("r", estados.map((estado, i) => session(`${i}`, { estado })));
  assert.equal(reservationStatus(withStates("Completada", "Programada")), "Programada");
  assert.equal(reservationStatus(withStates("Completada", "Completada", "Cancelada")), "Completada");
  assert.equal(reservationStatus(withStates("Cancelada", "Cancelada")), "Cancelada");
  assert.equal(reservationStatus(withStates("Programada", "Cancelada")), "Programada");
  assert.equal(completedSessions(withStates("Completada", "Programada", "Completada")), 2);
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
  assert.equal(puestoConflicts(others, session("n", { estado: "Cancelada" }), "nueva").length, 0);
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
  sessions[1].estado = "Cancelada";
  assert.equal(overlappingWithinReservation(sessions).size, 0);
});

test("los filtros del listado combinan nombre, fecha y estado", () => {
  const rows = [
    reservation("a", [session("a1", { fecha: "2026-11-10" })], { cliente: "José Pérez", tatuador: "Ana" }),
    reservation("b", [session("b1", { fecha: "2026-11-12", estado: "Cancelada" })], { cliente: "Marta Soto", tatuador: "Bruno" }),
    reservation("c", [session("c1", { fecha: "2026-11-10" }), session("c2", { fecha: "2026-11-20" })], { cliente: "Luis Rojas", tatuador: "Ana" }),
  ];
  const ids = (filters) => filterReservationList(rows, filters).map(({ id }) => id);
  assert.deepEqual(ids({}), ["a", "b", "c"]);
  assert.deepEqual(ids({ busqueda: "jose" }), ["a"]);
  assert.deepEqual(ids({ busqueda: "ANA" }), ["a", "c"]);
  assert.deepEqual(ids({ fecha: "2026-11-20" }), ["c"]);
  assert.deepEqual(ids({ estado: "Cancelada" }), ["b"]);
  assert.deepEqual(ids({ busqueda: "ana", fecha: "2026-11-10", estado: "Programada" }), ["a", "c"]);
  assert.deepEqual(ids({ busqueda: "bruno", estado: "Programada" }), []);
});

test("el buscador encuentra reservas por el RUT del cliente, con o sin formato", () => {
  const rows = [
    reservation("a", undefined, { cliente: "José Pérez", clienteRut: "123456785" }),
    reservation("b", undefined, { cliente: "Marta Soto", clienteRut: "10000013K" }),
    reservation("c", undefined, { cliente: "Sin RUT" }),
  ];
  const ids = (busqueda) => filterReservationList(rows, { busqueda }).map(({ id }) => id);
  assert.deepEqual(ids("12.345.678-5"), ["a"]);
  assert.deepEqual(ids("12345678"), ["a"]);
  assert.deepEqual(ids("10000013-k"), ["b"]);
  assert.deepEqual(ids("999"), []);
  assert.deepEqual(ids("marta"), ["b"], "el nombre sigue funcionando");
});

test("una reserva con fecha de borrado está en el historial", async () => {
  const { isArchived } = await import("../src/utils/sessions.js");
  assert.equal(isArchived(reservation("a")), false);
  assert.equal(isArchived(reservation("a", undefined, { archivadaEn: null })), false);
  assert.equal(isArchived(reservation("a", undefined, { archivadaEn: "2026-11-07T12:00:00Z" })), true);
});

test("la tarjeta muestra la próxima sesión o, si no queda ninguna, la última", async () => {
  const { keySession } = await import("../src/utils/sessions.js");
  const row = reservation("r", [
    session("c", { fecha: "2026-11-24" }),
    session("a", { fecha: "2026-11-03", estado: "Completada" }),
    session("b", { fecha: "2026-11-10" }),
  ]);
  assert.deepEqual([keySession(row, "2026-11-07").tipo, keySession(row, "2026-11-07").sesion.id], ["proxima", "b"]);
  const done = reservation("d", [session("x", { fecha: "2026-10-01", estado: "Completada" }), session("y", { fecha: "2026-10-15", estado: "Cancelada" })]);
  assert.deepEqual([keySession(done, "2026-11-07").tipo, keySession(done, "2026-11-07").sesion.id], ["ultima", "y"]);
  assert.equal(keySession(reservation("e", []), "2026-11-07"), null);
});
