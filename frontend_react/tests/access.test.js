import test from "node:test";
import assert from "node:assert/strict";
import { ownsReservation, canManageReservation, homeForUser } from "../src/utils/access.js";

test("el tatuador accede a sus reservas y el admin administra todas", () => {
  const artist = { id: 2, name: "Bruno Toro", role: "tatuador" };
  assert.equal(homeForUser(artist), "/mis-reservas");
  assert.equal(homeForUser({ role: "admin" }), "/reservas");
  assert.ok(ownsReservation(artist, { tatuador: "Bruno Toro" }));
  assert.ok(ownsReservation(artist, { tatuadorId: 2, tatuador: "Otro nombre" }));
  assert.equal(canManageReservation(artist, { tatuador: "Antonia Muñoz" }), false);
  assert.equal(ownsReservation(artist, { tatuadorId: 3, tatuador: "Bruno Toro" }), false);
  assert.ok(canManageReservation({ role: "admin" }, { tatuadorId: 3 }));
  assert.equal(canManageReservation(null, {}), false);
});
