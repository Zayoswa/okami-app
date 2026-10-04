import test from "node:test";
import assert from "node:assert/strict";
import { filterReservations } from "../src/utils/filterReservations.js";
import { spaceOccupancy, reservationCapacityError } from "../src/utils/spaceOccupancy.js";
import { loadReservations, storeReservations } from "../src/utils/reservationStorage.js";
import initialMock from "../src/data/reservasMock.json" with { type: "json" };
import reportMock from "../src/data/reservasDashboardMock.json" with { type: "json" };

function reservation(id, overrides = {}) {
  return {
    id, cliente: "Cliente", tatuador: "Tatuador", precio: 50000,
    espacioId: "B", fecha: "2026-10-04", horaInicio: "10:00", horaFin: "12:00",
    estado: "Pendiente", fechaCreacion: "2026-10-01T12:00:00Z", ...overrides,
  };
}

test("los filtros respetan el cambio de mes y la fecha de Santiago", () => {
  const rows = ["2026-09-27", "2026-09-28", "2026-10-03", "2026-10-04", "2026-10-05"]
    .map((fecha, id) => reservation(id, { fecha }));
  const now = new Date("2026-10-05T01:00:00Z");
  assert.deepEqual(filterReservations(rows, "todos", "hoy", now).map((row) => row.id), [3]);
  assert.deepEqual(filterReservations(rows, "todos", "semana", now).map((row) => row.id), [1, 2, 3]);
  assert.deepEqual(filterReservations(rows, "todos", "mes", now).map((row) => row.id), [2, 3, 4]);
  assert.equal(filterReservations(rows, "Cancelado", "mes", now).length, 0);
});

test("las sesiones contiguas no se superponen y se calcula el máximo simultáneo", () => {
  const rows = [reservation(1), reservation(2, { horaInicio: "12:00", horaFin: "14:00" })];
  assert.equal(spaceOccupancy(rows, "B", "2026-10-04", "10:00", "14:00"), 1);
  assert.equal(spaceOccupancy([...rows, reservation(3, { horaInicio: "11:00", horaFin: "13:00" })], "B", "2026-10-04", "10:00", "14:00"), 2);
  assert.equal(spaceOccupancy(rows, "B", "2026-10-04", "10:00", "12:00", 1), 0);
});

test("el límite de pendientes bloquea distintos horarios y permite liberar cupos", () => {
  const space = { id: "B", capacidadMaxima: 2 };
  const rows = [reservation(1), reservation(2, { fecha: "2026-10-05" })];
  const candidate = reservation(3, { fecha: "2026-10-06" });
  assert.ok(reservationCapacityError(rows, candidate, space));
  assert.equal(reservationCapacityError(rows, rows[0], space, 1), "");
  assert.equal(reservationCapacityError(rows, { ...candidate, estado: "Cancelado" }, space), "");
  assert.equal(reservationCapacityError([rows[0], { ...rows[1], estado: "Completado" }], candidate, space), "");
});

test("la persistencia conserva cambios y migra reservas antiguas", () => {
  let value = null;
  const storage = { getItem: () => value, setItem: (_key, data) => { value = data; } };
  const old = reservation(99);
  delete old.horaInicio;
  delete old.horaFin;
  old.hora = "15:00";
  storeReservations([old], storage);
  const restored = loadReservations(storage);
  assert.equal(restored[0].horaInicio, "15:00");
  assert.equal(restored[0].horaFin, "17:00");
  assert.equal(restored[0].id, 99);
  storeReservations([], storage);
  assert.deepEqual(loadReservations(storage), []);
});

test("datos corruptos no rompen la página y fallos de escritura se informan", () => {
  const invalidRows = [reservation(1, { horaInicio: "incorrecto" })];
  for (const value of ["JSON roto", JSON.stringify(invalidRows), JSON.stringify([reservation(1), reservation(1)])]) {
    assert.equal(loadReservations({ getItem: () => value }).length, initialMock.length + reportMock.length);
  }
  assert.throws(() => storeReservations([], { setItem: () => { throw new Error("Sin espacio"); } }), /No se pudieron guardar/);
});
