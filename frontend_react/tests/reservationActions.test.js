import test from "node:test";
import assert from "node:assert/strict";
import { saveReservationInList, deleteReservationFromList } from "../src/utils/reservationActions.js";
import { canAccessModule, modulesForUser } from "../src/config/navigation.js";

const admin = { id: 1, name: "Admin Demo", role: "admin" };
const artist = { id: 2, name: "Bruno Toro", role: "tatuador" };
const reservation = (id, overrides = {}) => ({
  id, cliente: "Cliente", tatuador: "Bruno Toro", espacioId: "A", precio: 50000,
  fecha: "2026-10-04", horaInicio: "10:00", horaFin: "12:00",
  estado: "Pendiente", fechaCreacion: "2026-10-01T12:00:00Z", ...overrides,
});

test("el menú y las rutas comparten permisos por rol", () => {
  assert.deepEqual(modulesForUser(artist).map((module) => module.id), ["mis-reservas", "calendario", "alertas"]);
  assert.deepEqual(modulesForUser(admin).map((module) => module.id), ["calendario", "reservas", "alertas", "dashboard", "tatuadores"]);
  assert.ok(modulesForUser(admin).filter((module) => module.comingSoon).every((module) => !module.path));
  assert.equal(canAccessModule(artist, "historial"), false);
  assert.equal(canAccessModule(artist, "reservas"), false);
  assert.equal(canAccessModule(admin, "reservas"), true);
  assert.equal(canAccessModule({ role: "desconocido" }, "calendario"), false);
});

test("las reservas nuevas del tatuador se asignan a su identidad", () => {
  const updated = saveReservationInList([], artist, reservation(10, { tatuador: "Otro", tatuadorId: 99 }));
  assert.equal(updated[0].tatuadorId, artist.id);
  assert.equal(updated[0].tatuador, artist.name);
});

test("no se permite modificar ni borrar reservas de otro tatuador", () => {
  const other = reservation(10, { tatuador: "Antonia Muñoz", tatuadorId: 3 });
  assert.throws(() => saveReservationInList([other], artist, { ...other, tatuadorId: 2 }, 10), /propias reservas/);
  assert.throws(() => deleteReservationFromList([other], artist, 10), /propias reservas/);
  assert.equal(deleteReservationFromList([other], admin, 10).length, 0);
  assert.throws(() => saveReservationInList([], null, reservation(1)), /Inicia sesión/);
});

test("editar conserva identidad y fecha de creación", () => {
  const original = reservation(10, { tatuadorId: 2 });
  const updated = saveReservationInList([original], artist, { ...original, id: 99, fechaCreacion: "2026-10-03", precio: 75000 }, 10);
  assert.equal(updated[0].id, 10);
  assert.equal(updated[0].fechaCreacion, original.fechaCreacion);
  assert.equal(updated[0].precio, 75000);
  assert.equal(original.precio, 50000);
  assert.throws(() => saveReservationInList([], admin, original, 10), /ya no existe/);
  assert.throws(() => saveReservationInList([original], admin, original), /identificador/);
});

test("el flujo de guardar mantiene la validación de capacidad", () => {
  const rows = [reservation(1, { espacioId: "D" })];
  assert.throws(() => saveReservationInList(rows, admin, reservation(2, { espacioId: "D", fecha: "2026-10-05" })), /lleno/);
  const released = saveReservationInList(rows, admin, { ...rows[0], estado: "Cancelado" }, 1);
  const updated = saveReservationInList(released, artist, reservation(2, { espacioId: "D" }));
  assert.equal(updated.length, 2);
  assert.equal(updated.filter((row) => row.estado === "Pendiente").length, 1);
});
