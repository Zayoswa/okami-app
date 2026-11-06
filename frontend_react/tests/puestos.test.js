import test from "node:test";
import assert from "node:assert/strict";
import { puestoNumber, puestoOccupancy } from "../src/utils/puestos.js";

test("obtiene el número al final del nombre del puesto", () => {
  assert.equal(puestoNumber("Puesto 1"), "1");
  assert.equal(puestoNumber("Puesto 12"), "12");
  assert.equal(puestoNumber("puesto 4 "), "4");
});

test("sin número al final no muestra nada", () => {
  assert.equal(puestoNumber("Camilla VIP"), "");
  assert.equal(puestoNumber(""), "");
  assert.equal(puestoNumber(undefined), "");
});

const hoy = "2026-11-06";
const sesion = (id, puestoId, horaInicio, horaFin, estado = "Pendiente", fecha = hoy) =>
  ({ id, puestoId, fecha, horaInicio, horaFin, estado, tatuador: "Diego" });

test("detecta quién ocupa el espacio ahora y cuál es la próxima sesión", () => {
  const sesiones = [sesion("b", "2", "15:00", "16:00"), sesion("a", "2", "11:00", "13:00")];
  const { actual, proxima } = puestoOccupancy(sesiones, "2", hoy, "12:15");
  assert.equal(actual.id, "a");
  assert.equal(proxima.id, "b");
});

test("el inicio cuenta como ocupado y el término ya no", () => {
  const sesiones = [sesion("a", "2", "11:00", "13:00")];
  assert.equal(puestoOccupancy(sesiones, "2", hoy, "11:00").actual?.id, "a");
  assert.equal(puestoOccupancy(sesiones, "2", hoy, "13:00").actual, null);
});

test("ignora sesiones canceladas, completadas, de otro espacio o de otro día", () => {
  const sesiones = [
    sesion("c", "2", "11:00", "13:00", "Cancelado"),
    sesion("d", "2", "11:00", "13:00", "Completado"),
    sesion("e", "3", "11:00", "13:00"),
    sesion("f", "2", "11:00", "13:00", "Pendiente", "2026-11-07"),
  ];
  assert.deepEqual(puestoOccupancy(sesiones, "2", hoy, "12:00"), { actual: null, proxima: null });
});
