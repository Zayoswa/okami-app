import reservasMock from "../data/reservasMock.json" with { type: "json" };
import reservasDashboardMock from "../data/reservasDashboardMock.json" with { type: "json" };
import { reservationStatuses } from "../data/reservationStatuses.js";
import { migrateReservationHours } from "./spaceOccupancy.js";

const storageKey = "okami.reservas.v1";
const seedVersion = 2;
const initialReservations = [...reservasMock, ...reservasDashboardMock];
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidReservation(item) {
  if (!item || !["string", "number"].includes(typeof item.id)) return false;
  const start = item.horaInicio ?? item.hora;
  const date = typeof item.fecha === "string" ? new Date(`${item.fecha}T12:00:00Z`) : new Date(NaN);
  return typeof item.cliente === "string" && typeof item.tatuador === "string" &&
    Number.isSafeInteger(item.precio) && item.precio >= 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(item.fecha) &&
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === item.fecha &&
    typeof start === "string" && timePattern.test(start) &&
    (item.horaFin === undefined || (typeof item.horaFin === "string" && timePattern.test(item.horaFin) && item.horaFin > start)) &&
    typeof item.fechaCreacion === "string" && !Number.isNaN(Date.parse(item.fechaCreacion)) &&
    reservationStatuses.some(({ estado }) => estado === item.estado);
}

export function loadReservations(storage) {
  try {
    const snapshot = JSON.parse((storage ?? localStorage).getItem(storageKey));
    const saved = Array.isArray(snapshot) ? snapshot : snapshot?.reservas;
    if (Array.isArray(saved) && saved.every(isValidReservation) && new Set(saved.map((item) => item.id)).size === saved.length) {
      const migrated = saved.map((item) => ({
        ...migrateReservationHours(item),
        tatuador: ["Bruno Silva", "Bruno Zilva"].includes(item.tatuador) ? "Bruno Toro" : item.tatuador,
        espacioId: item.espacioId ?? reservasMock.find((mock) => mock.id === item.id)?.espacioId ?? "",
      }));
      // Añadir los nuevos ejemplos a snapshots antiguos sin restaurar reservas borradas.
      return Array.isArray(snapshot)
        ? [...migrated, ...reservasDashboardMock.filter((sample) => !saved.some((item) => item.id === sample.id))]
        : migrated;
    }
  } catch {
    // Un almacenamiento no disponible o inválido no impide usar los datos de prueba.
  }
  return initialReservations;
}

export function storeReservations(reservas, storage) {
  try {
    (storage ?? localStorage).setItem(storageKey, JSON.stringify({ seedVersion, reservas }));
  } catch {
    throw new Error("No se pudieron guardar los cambios en este navegador. Intenta nuevamente.");
  }
}
