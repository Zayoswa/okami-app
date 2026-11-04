import test from "node:test";
import assert from "node:assert/strict";
import { formatRut, normalizeRut, rutValidationError, rutVerifier } from "../src/utils/rut.js";

test("calcula y valida el dígito verificador chileno", () => {
  assert.equal(rutVerifier("12345678"), "5");
  assert.equal(rutValidationError("12.345.678-5"), "");
  assert.equal(rutValidationError("123456785"), "");
  assert.equal(rutValidationError("10.000.013-k"), "");
  assert.equal(rutValidationError("12345678-K"), "El dígito verificador no corresponde al RUT ingresado.");
});

test("el RUT es obligatorio y debe tener un formato válido", () => {
  assert.equal(rutValidationError(""), "Ingresa el RUT del cliente con su dígito verificador.");
  assert.equal(rutValidationError("0000000-0"), "Ingresa un RUT válido, por ejemplo 12.345.678-5.");
  assert.equal(rutValidationError("12K45678-5"), "Ingresa un RUT válido, por ejemplo 12.345.678-5.");
});

test("normaliza para guardar y formatea para mostrar", () => {
  assert.equal(normalizeRut(" 12.345.678-k "), "12345678K");
  assert.equal(formatRut("123456785"), "12.345.678-5");
  assert.equal(formatRut("10000013K"), "10.000.013-K");
});
