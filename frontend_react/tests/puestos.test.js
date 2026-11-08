import test from "node:test";
import assert from "node:assert/strict";
import { maxTitulares, puestoBlockReason, puestoNumber, puestoOccupancy, titularPuesto } from "../src/utils/puestos.js";

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
const sesion = (id, puestoId, horaInicio, horaFin, estado = "Programada", fecha = hoy) =>
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
    sesion("c", "2", "11:00", "13:00", "Cancelada"),
    sesion("d", "2", "11:00", "13:00", "Completada"),
    sesion("e", "3", "11:00", "13:00"),
    sesion("f", "2", "11:00", "13:00", "Programada", "2026-11-07"),
  ];
  assert.deepEqual(puestoOccupancy(sesiones, "2", hoy, "12:00"), { actual: null, proxima: null });
});

test("cada tipo de puesto admite su número de titulares", () => {
  assert.equal(maxTitulares("Full"), 1);
  assert.equal(maxTitulares("Compartido"), 2);
  assert.equal(maxTitulares("Rotativo"), 0);
  assert.equal(maxTitulares(undefined), 0);
});

test("encuentra el puesto del que un tatuador es titular", () => {
  const puestos = [
    { id: "1", tipo: "Full", titulares: [{ id: "a", nombre: "Ana" }] },
    { id: "2", tipo: "Compartido", titulares: [{ id: "b", nombre: "Bruno" }, { id: "c", nombre: "Caro" }] },
    { id: "3", tipo: "Rotativo", titulares: [] },
  ];
  assert.equal(titularPuesto(puestos, "c")?.id, "2");
  assert.equal(titularPuesto(puestos, "z"), null);
  assert.equal(titularPuesto(puestos, ""), null);
});

test("Full y Compartido solo admiten a sus titulares; Rotativo a todos", () => {
  const full = { tipo: "Full", disponible: true, estado: "Habilitado", titulares: [{ id: "a" }] };
  const rotativo = { tipo: "Rotativo", disponible: true, estado: "Habilitado", titulares: [] };
  assert.equal(puestoBlockReason(full, "a"), "");
  assert.equal(puestoBlockReason(full, "b"), "Solo titulares");
  assert.equal(puestoBlockReason(rotativo, "b"), "");
  assert.equal(puestoBlockReason({ ...rotativo, disponible: false, estado: "Mantenimiento" }, "b"), "Mantenimiento");
});

test("un puesto Guest no tiene titulares y solo admite tatuadores Guest", () => {
  const guest = { tipo: "Guest", disponible: true, estado: "Habilitado", titulares: [] };
  assert.equal(maxTitulares("Guest"), 0);
  assert.equal(puestoBlockReason(guest, "b", "Guest"), "");
  assert.equal(puestoBlockReason(guest, "b", "guest"), "");
  assert.equal(puestoBlockReason(guest, "b", "Rotativo light"), "Solo Guest");
  assert.equal(puestoBlockReason(guest, "b"), "Solo Guest");
  assert.equal(puestoBlockReason({ ...guest, disponible: false, estado: "Deshabilitado" }, "b", "Guest"), "Deshabilitado");
});

test("las sesiones próximas de un puesto excluyen las pasadas, canceladas, completadas y de otros puestos", async () => {
  const { upcomingSessions } = await import("../src/utils/puestos.js");
  const base = { puestoId: "5", estado: "Programada", horaInicio: "10:00", horaFin: "12:00" };
  const sesiones = [
    { ...base, id: "pasada", fecha: "2026-11-09" },
    { ...base, id: "hoy-terminada", fecha: "2026-11-10", horaInicio: "08:00", horaFin: "09:00" },
    { ...base, id: "hoy-en-curso", fecha: "2026-11-10" },
    { ...base, id: "cancelada", fecha: "2026-11-12", estado: "Cancelada" },
    { ...base, id: "completada", fecha: "2026-11-12", estado: "Completada" },
    { ...base, id: "otro-puesto", fecha: "2026-11-12", puestoId: "6" },
    { ...base, id: "futura-tarde", fecha: "2026-11-18", horaInicio: "15:00", horaFin: "16:00" },
    { ...base, id: "futura", fecha: "2026-11-18" },
  ];
  assert.deepEqual(upcomingSessions(sesiones, "5", "2026-11-10", "11:00").map(({ id }) => id),
    ["hoy-en-curso", "futura", "futura-tarde"]);
});

test("el estado del puesto se lee bien dentro de una frase", async () => {
  const { puestoStateText } = await import("../src/utils/puestos.js");
  assert.equal(puestoStateText("Deshabilitado"), "deshabilitado");
  assert.equal(puestoStateText("Mantenimiento"), "en mantenimiento");
  assert.equal(puestoStateText(""), "sin estado");
});
