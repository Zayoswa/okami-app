import espacios from "../data/espacios.json" with { type: "json" };
import { canManageReservation } from "./access.js";
import { reservationCapacityError } from "./spaceOccupancy.js";

function requireUser(user) {
  if (!["admin", "tatuador"].includes(user?.role)) {
    throw new Error("Inicia sesión para gestionar reservas.");
  }
}

function requireEditableReservation(reservas, user, id) {
  const existing = reservas.find((item) => item.id === id);
  if (!existing) throw new Error("La reserva ya no existe.");
  if (!canManageReservation(user, existing)) {
    throw new Error("Solo puedes gestionar tus propias reservas.");
  }
  return existing;
}

export function saveReservationInList(reservas, user, candidate, editingId) {
  requireUser(user);
  const editing = editingId !== undefined;
  const existing = editing ? requireEditableReservation(reservas, user, editingId) : null;
  const reserva = { ...candidate };
  if (existing) {
    reserva.id = existing.id;
    reserva.fechaCreacion = existing.fechaCreacion;
    if (reserva.tatuador === existing.tatuador && existing.tatuadorId !== undefined) {
      reserva.tatuadorId = existing.tatuadorId;
    } else {
      delete reserva.tatuadorId;
    }
  } else if (reservas.some((item) => item.id === reserva.id)) {
    throw new Error("Ya existe una reserva con ese identificador.");
  }
  if (user.role === "tatuador") {
    reserva.tatuador = user.name;
    reserva.tatuadorId = user.id;
  }
  const espacio = espacios.find((item) => item.id === reserva.espacioId);
  const error = reservationCapacityError(reservas, reserva, espacio, editingId);
  if (error) throw new Error(error);
  return editing
    ? reservas.map((item) => item.id === editingId ? reserva : item)
    : [reserva, ...reservas];
}

export function deleteReservationFromList(reservas, user, id) {
  requireUser(user);
  requireEditableReservation(reservas, user, id);
  return reservas.filter((item) => item.id !== id);
}
