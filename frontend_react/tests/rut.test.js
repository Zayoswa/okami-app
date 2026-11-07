import test from "node:test";
import assert from "node:assert/strict";
import { formatRut, normalizeRut, rutValidationError, rutVerifier, typedRut } from "../src/utils/rut.js";

test("calcula y valida el dígito verificador chileno", () => {
  assert.equal(rutVerifier("12345678"), "5");
  assert.equal(rutValidationError("12345678-5"), "");
  assert.equal(rutValidationError("11585233-7"), "");
  assert.equal(rutValidationError("123456785"), "");
  assert.equal(rutValidationError("10.000.013-k"), "");
  assert.equal(rutValidationError("12345678-K"), "El dígito verificador no corresponde al RUT ingresado.");
});

test("el RUT es obligatorio y debe tener un formato válido", () => {
  assert.equal(rutValidationError(""), "Ingresa el RUT del cliente con su dígito verificador.");
  assert.equal(rutValidationError("0000000-0"), "Ingresa un RUT válido, sin puntos y con guion. Ej: 12345678-5.");
  assert.equal(rutValidationError("12K45678-5"), "Ingresa un RUT válido, sin puntos y con guion. Ej: 12345678-5.");
});

test("normaliza para guardar y formatea para mostrar", () => {
  assert.equal(normalizeRut(" 12.345.678-k "), "12345678K");
  assert.equal(formatRut("123456785"), "12345678-5");
  assert.equal(formatRut("10.000.013-k"), "10000013-K");
});

test("al escribir se quitan los puntos y queda un solo guion", () => {
  assert.equal(typedRut("11.222.333-k"), "11222333-K");
  assert.equal(typedRut("11222333"), "11222333");
  assert.equal(typedRut("11222333-"), "11222333-");
  assert.equal(typedRut("11222333-K9"), "11222333-K");
  assert.equal(typedRut("11-22-2"), "11-2");
});
