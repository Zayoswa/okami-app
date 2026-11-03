import test from "node:test";
import assert from "node:assert/strict";
import { createLocalReservationsRepository } from "../src/services/localReservationsRepository.js";

const admin = { id: 1, name: "Admin", role: "admin" };
const artist = { id: 2, name: "Bruno Toro", role: "tatuador" };
const reservation = (id) => ({
  id, cliente: "Cliente", tatuador: "Otro", precio: 50000, espacioId: "A",
  fecha: "2026-10-28", horaInicio: "10:00", horaFin: "12:00",
  estado: "Pendiente", fechaCreacion: "2026-10-28T10:00:00Z",
});

function memoryStorage() {
  let snapshot = JSON.stringify({ reservas: [] });
  return {
    getItem() { return snapshot; },
    setItem(key, value) { snapshot = value; },
  };
}

test("el repositorio conserva cambios entre instancias y asigna la identidad del tatuador", async () => {
  const storage = memoryStorage();
  const first = createLocalReservationsRepository(storage);
  const second = createLocalReservationsRepository(storage);
  assert.deepEqual(await first.list(admin), []);
  await first.save(artist, reservation("one"));
  await second.save(admin, reservation("two"));
  const rows = await first.list(admin);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.id === "one").tatuadorId, artist.id);
  await second.remove(artist, "one");
  assert.deepEqual((await first.list(admin)).map((row) => row.id), ["two"]);
});

test("las operaciones rechazadas no modifican el almacenamiento", async () => {
  const repository = createLocalReservationsRepository(memoryStorage());
  await repository.save(admin, reservation("one"));
  const before = await repository.list(admin);
  await assert.rejects(repository.remove(artist, "one"), /propias reservas/);
  await assert.rejects(repository.save(artist, reservation("one"), "one"), /propias reservas/);
  assert.deepEqual(await repository.list(admin), before);
});

test("un fallo al persistir rechaza la promesa y conserva los datos anteriores", async () => {
  const storage = memoryStorage();
  const repository = createLocalReservationsRepository(storage);
  await repository.save(artist, reservation("one"));
  const before = await repository.list(admin);
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  await assert.rejects(repository.save(artist, { ...reservation("one"), precio: 1000 }, "one"), /guardar/);
  await assert.rejects(repository.remove(artist, "one"), /guardar/);
  assert.deepEqual(await repository.list(admin), before);
});
