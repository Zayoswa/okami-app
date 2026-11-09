import test from "node:test";
import assert from "node:assert/strict";
import { ageOn, consentError, consentPayload, emptyConsent, folioLabel, fromReservation, isMinor } from "../src/utils/consentimientos.js";

const TODAY = "2026-11-09";
const valid = () => ({
  ...emptyConsent(TODAY, "t1"), tatuadorRut: "12345678-5", clienteNombre: "Camila Rojas", clienteRut: "30000001-0",
  clienteNacimiento: "1995-02-02", descripcion: "Rosa en línea fina", zonaCuerpo: "Antebrazo derecho",
});

test("calcula la edad en años cumplidos", () => {
  assert.equal(ageOn("2008-11-10", TODAY), 17);
  assert.equal(ageOn("2008-11-09", TODAY), 18);
  assert.equal(ageOn("", TODAY), null);
});

test("un formulario completo de un adulto no tiene errores", () => {
  assert.equal(consentError(valid(), TODAY), "");
  assert.equal(isMinor(valid()), false);
});

test("un menor de edad necesita representante con RUT válido", () => {
  const menor = { ...valid(), clienteNacimiento: "2010-05-05" };
  assert.match(consentError(menor, TODAY), /menor de edad/);
  assert.match(consentError({ ...menor, representanteNombre: "María Fuentes", representanteRut: "11111111-2" }, TODAY), /RUT del representante/);
  assert.equal(consentError({ ...menor, representanteNombre: "María Fuentes", representanteRut: "11111111-1" }, TODAY), "");
});

test("revisa RUT del tatuador, teléfonos, fechas y campos del trabajo", () => {
  assert.match(consentError({ ...valid(), tatuadorRut: "12345678-0" }, TODAY), /RUT del tatuador/);
  assert.match(consentError({ ...valid(), clienteTelefono: "llamar en la tarde" }, TODAY), /teléfono del cliente/);
  assert.match(consentError({ ...valid(), fecha: "2026-11-10" }, TODAY), /fecha del consentimiento/);
  assert.match(consentError({ ...valid(), clienteNacimiento: "2027-01-01" }, TODAY), /nacimiento del cliente/);
  assert.match(consentError({ ...valid(), zonaCuerpo: " " }, TODAY), /zona del cuerpo/);
});

test("el cuerpo de la petición limpia RUT y espacios, y omite al representante de un adulto", () => {
  const body = consentPayload({ ...valid(), clienteNombre: "  Camila   Rojas ", representanteNombre: "Sobra", clienteTelefono: " " });
  assert.equal(body.clienteNombre, "Camila Rojas");
  assert.equal(body.clienteRut, "300000010");
  assert.equal(body.tatuadorRut, "123456785");
  assert.equal(body.representanteNombre, null);
  assert.equal(body.clienteTelefono, null);
  assert.equal(body.reservaId, null);
});

test("desde una reserva copia cliente, tatuador, zona y diseño", () => {
  const form = fromReservation(emptyConsent(TODAY), {
    id: "r1", tatuadorId: 7, cliente: "Ana Pérez", clienteRut: "300000010", zonaCuerpo: "Espalda",
    descripcionDiseno: "Dragón japonés\ncon nubes",
  });
  assert.deepEqual([form.reservaId, form.tatuadorId, form.clienteNombre, form.clienteRut, form.zonaCuerpo, form.descripcion],
    ["r1", "7", "Ana Pérez", "30000001-0", "Espalda", "Dragón japonés con nubes"]);
});

test("el folio se muestra con seis dígitos", () => {
  assert.equal(folioLabel(42), "000042");
});
