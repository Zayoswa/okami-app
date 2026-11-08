import test from "node:test";
import assert from "node:assert/strict";
import { actionTone, highlightParts } from "../src/utils/activityText.js";

const tones = (text) => highlightParts(text).filter((part) => part.tone).map(({ text: word, tone }) => [word, tone]);

test("las palabras clave de la actividad se pintan según su significado", () => {
  assert.deepEqual(tones("Marcó como Cancelada la sesión del 10-11-2026 (antes Programada)."),
    [["Marcó", "info"], ["Cancelada", "danger"], ["Programada", "info"]]);
  assert.deepEqual(tones("Registró un pago de $60.000 de Mcfry."), [["Registró", "ok"], ["$60.000", "money"]]);
  assert.deepEqual(tones("1 sesión, $100.000."), [["$100.000", "money"]], "el punto final no es parte del monto");
  assert.deepEqual(tones("Total $1.250.000 y $500"), [["$1.250.000", "money"], ["$500", "money"]]);
  assert.deepEqual(tones("Precio: $100.000 → $130.000"), [["Precio", "info"], ["$100.000", "money"], ["→", "arrow"], ["$130.000", "money"]]);
  assert.deepEqual(tones("Cambió Puesto 2 a Mantenimiento (antes Habilitado)."),
    [["Cambió", "info"], ["Mantenimiento", "warn"], ["Habilitado", "ok"]]);
});

test("solo palabras completas, y el texto se conserva entero", () => {
  assert.deepEqual(tones("Deshabilitados y Completadas no son estados"), []);
  const text = "Borró la reserva de Ana con Jaimito (2 sesiones).";
  assert.equal(highlightParts(text).map((part) => part.text).join(""), text);
  assert.deepEqual(highlightParts(""), []);
});

test("el tono de la tarjeta destaca lo que se borra o cancela", () => {
  assert.equal(actionTone({ accion: "borrar" }), "danger");
  assert.equal(actionTone({ accion: "cancelada" }), "danger");
  assert.equal(actionTone({ accion: "pago_registrado" }), "ok");
  assert.equal(actionTone({ accion: "editar" }), "info");
});
