import test from "node:test";
import assert from "node:assert/strict";
import { canAccessModule, modulesForUser } from "../src/config/navigation.js";


const admin = { id: 1, name: "Admin Demo", role: "admin" };
const artist = { id: 2, name: "Bruno Toro", role: "tatuador" };
test("el menú y las rutas comparten permisos por rol", () => {
  assert.deepEqual(modulesForUser(artist).map((module) => module.id), ["inicio", "mi-panel", "mis-reservas", "calendario", "alertas"]);
  assert.deepEqual(modulesForUser(admin).map((module) => module.id), ["inicio", "dashboard", "arriendos", "calendario", "reservas", "tatuadores", "puestos", "actividad", "alertas", "documentacion"]);
  assert.ok(modulesForUser(admin).filter((module) => module.comingSoon).every((module) => !module.path));
  assert.equal(canAccessModule(artist, "tatuadores"), false);
  assert.equal(canAccessModule(admin, "tatuadores"), true);
  assert.equal(canAccessModule(admin, "puestos"), true);
  assert.equal(canAccessModule(artist, "puestos"), false);
  assert.equal(canAccessModule(artist, "historial"), false);
  assert.equal(canAccessModule(artist, "reservas"), false);
  assert.equal(canAccessModule(admin, "reservas"), true);
  assert.equal(canAccessModule({ role: "desconocido" }, "calendario"), false);
});
