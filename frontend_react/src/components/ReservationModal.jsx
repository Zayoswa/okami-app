import { useState } from "react";
import useModalDialog from "../hooks/useModalDialog";
import espacios from "../data/espacios.json";
import { reservationStatuses } from "../data/reservationStatuses";
import { overlappingReservations, spaceOccupancy, pendingSpaceOccupancy, reservationCapacityError } from "../utils/spaceOccupancy";

export default function ReservationModal({ user, reserva, reservas, initialDate = "", initialSpace = "", onSave, onClose }) {
  const dialogRef = useModalDialog();
  const [error, setError] = useState("");
  const [fecha, setFecha] = useState(reserva?.fecha ?? initialDate);
  const [horaInicio, setHoraInicio] = useState(reserva?.horaInicio ?? "");
  const [horaFin, setHoraFin] = useState(reserva?.horaFin ?? "");
  const [selectedSpace, setSelectedSpace] = useState(reserva?.espacioId ?? initialSpace);
  const [estado, setEstado] = useState(reserva?.estado ?? "Pendiente");
  const espacio = espacios.find((item) => item.id === selectedSpace);
  const hasSchedule = Boolean(fecha && horaInicio && horaFin && horaFin > horaInicio);
  const ocupacion = spaceOccupancy(reservas, selectedSpace, fecha, horaInicio, horaFin, reserva?.id);
  const pendientes = pendingSpaceOccupancy(reservas, selectedSpace, reserva?.id);
  const totalFull = espacio && pendientes >= espacio.capacidadMaxima;
  const scheduleFull = hasSchedule && espacio && ocupacion >= espacio.capacidadMaxima;
  const isFull = totalFull || scheduleFull;
  const capacityError = espacio ? reservationCapacityError(reservas, { estado, fecha, horaInicio, horaFin }, espacio, reserva?.id) : "";

  const overlapping = overlappingReservations(reservas, selectedSpace, fecha, horaInicio, horaFin, reserva?.id)
    .sort((a, b) => a.horaFin.localeCompare(b.horaFin));

  function handleSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const cliente = data.get("cliente").trim();
    const tatuador = data.get("tatuador").trim();
    const precio = Number(data.get("precio"));
    const espacioId = data.get("espacioId");
    const selected = espacios.find((item) => item.id === espacioId);
    if (!selected) {
      setError("Selecciona un espacio válido.");
      return;
    }
    if (!hasSchedule) {
      setError("La hora de término debe ser posterior a la hora de inicio, dentro del mismo día.");
      return;
    }
    const validationError = reservationCapacityError(reservas, { estado: data.get("estado"), fecha, horaInicio, horaFin }, selected, reserva?.id);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!cliente || !tatuador || !Number.isSafeInteger(precio) || precio < 0) {
      setError("Ingresa nombres válidos y un precio entero igual o mayor a cero.");
      return;
    }
    try {
      onSave({
        id: reserva?.id ?? crypto.randomUUID(),
        cliente,
        tatuador,
        precio,
        espacioId,
        fecha: data.get("fecha"),
        horaInicio,
        horaFin,
        estado: data.get("estado"),
        fechaCreacion: reserva?.fechaCreacion ?? new Date().toISOString(),
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la reserva en este navegador. Intenta nuevamente.");
    }
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal" aria-labelledby="reservation-modal-title" onCancel={onClose}>
      <div className="reservation-modal-header">
        <h2 id="reservation-modal-title">{reserva ? "Editar reserva" : "Crear reserva"}</h2>
        <button type="button" className="reservation-modal-close" onClick={onClose} aria-label="Cerrar formulario">×</button>
      </div>
      <p className="reservation-modal-description">{reserva ? "Actualiza los datos del ticket. Su fecha de creación se conserva." : "Completa los datos del ticket. Su fecha de creación se registra automáticamente."}</p>
      <form className="reservation-form" onSubmit={handleSubmit}>
        <label>Nombre del cliente<input name="cliente" defaultValue={reserva?.cliente ?? ""} required maxLength={100} autoFocus /></label>
        <label>Nombre del tatuador<input name="tatuador" defaultValue={user?.role === "tatuador" ? user.name : reserva?.tatuador ?? ""} readOnly={user?.role === "tatuador"} required maxLength={100} /></label>
        <label>Fecha<input name="fecha" value={fecha} onChange={(event) => { setFecha(event.target.value); setError(""); }} type="date" required /></label>
        <div className="reservation-form-row">
          <label>Hora de inicio<input name="horaInicio" value={horaInicio} onChange={(event) => { setHoraInicio(event.target.value); setError(""); }} type="time" required /></label>
          <label>Hora de término<input name="horaFin" value={horaFin} onChange={(event) => { setHoraFin(event.target.value); setError(""); }} type="time" required /></label>
        </div>
        {horaInicio && horaFin && horaFin <= horaInicio && <p className="reservation-form-error" role="alert">La hora de término debe ser posterior a la de inicio.</p>}
        <label>Espacio
          <select name="espacioId" value={selectedSpace} onChange={(event) => { setSelectedSpace(event.target.value); setError(""); }} className={isFull ? "reservation-space-full" : ""} aria-describedby="space-occupancy" required>
            <option value="" disabled>Selecciona un espacio</option>
            {espacios.map((item) => {
              const count = spaceOccupancy(reservas, item.id, fecha, horaInicio, horaFin, reserva?.id);
              const pending = pendingSpaceOccupancy(reservas, item.id, reserva?.id);
              const full = pending >= item.capacidadMaxima || (hasSchedule && count >= item.capacidadMaxima);
              return <option key={item.id} value={item.id} className={full ? "reservation-space-full" : ""}>
                {item.nombre} — {pending}/{item.capacidadMaxima} pendientes{full ? " · LLENO" : ""}
              </option>;
            })}
          </select>
        </label>
        <p id="space-occupancy" className={`reservation-occupancy ${isFull ? "reservation-space-full" : ""}`} role="status">
          {!espacio ? "Selecciona un espacio para ver su ocupación." : totalFull ? `${pendientes}/${espacio.capacidadMaxima} reservas pendientes — Espacio lleno. Selecciona otro espacio o libera un cupo.` : !hasSchedule ? `${pendientes}/${espacio.capacidadMaxima} pendientes. Selecciona fecha, inicio y término para consultar las sesiones.` : `${pendientes}/${espacio.capacidadMaxima} pendientes. Máximo durante la sesión: ${ocupacion}/${espacio.capacidadMaxima}${scheduleFull ? " — Horario lleno." : "."}`}
        </p>
        {espacio && overlapping.length > 0 && (
          <div className="reservation-space-sessions">
            <p>Sesiones que coinciden con tu horario:</p>
            <ul>{overlapping.map((item) => <li key={item.id}>{item.horaInicio} – {item.horaFin} · Cupo liberado a las {item.horaFin}</li>)}</ul>
          </div>
        )}
        <p className="reservation-occupancy-note">Las pendientes ocupan cupos en el resumen del espacio, aunque tengan distintos horarios. Completar o cancelar una reserva libera su cupo. También se comprueban las sesiones superpuestas.</p>
        <label>Precio (CLP)<input name="precio" defaultValue={reserva?.precio ?? ""} type="number" min="0" step="1" required /></label>
        <label>Status
          <select name="estado" value={estado} onChange={(event) => { setEstado(event.target.value); setError(""); }}>
            {reservationStatuses.map(({ estado: value }) => <option key={value}>{value}</option>)}
          </select>
        </label>
        {error && <p className="reservation-form-error" role="alert">{error}</p>}
        <div className="reservation-modal-actions">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="reservation-button" disabled={Boolean(capacityError)}>{reserva ? "Guardar cambios" : "Guardar reserva"}</button>
        </div>
      </form>
    </dialog>
  );
}
