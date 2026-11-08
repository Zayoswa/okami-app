import test from "node:test";
import assert from "node:assert/strict";
import { cleanClientName, clientNameError } from "../src/utils/clientName.js";

test("el nombre del cliente es solo texto", () => {
  for (const nombre of ["11585495k", "Ana 2", "12.345.678-5", "A", "@@@", ""]) {
    assert.notEqual(clientNameError(nombre), "", nombre);
  }
  assert.match(clientNameError("11585495k"), /RUT/);
  for (const nombre of ["María José O'Higgins-Pérez", "Ñuñoa Sr.", "  camila   rojas  "]) {
    assert.equal(clientNameError(nombre), "", nombre);
  }
  assert.equal(cleanClientName("  camila   rojas  "), "camila rojas");
});
