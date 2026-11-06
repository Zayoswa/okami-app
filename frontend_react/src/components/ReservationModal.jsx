import { useEffect, useState } from "react";
import useModalDialog from "../hooks/useModalDialog";
import { reservationStatuses } from "../data/reservationStatuses";
import { isFutureReservationStart, todayInSantiago } from "../utils/calendar";
import { artistConflicts, overlappingWithinReservation, puestoConflicts } from "../utils/sessions";
import { authRequest } from "../services/authService";
import { formatRut, normalizeRut, rutValidationError, typedRut } from "../utils/rut";

function newSession(fecha, puestoId = "") {
  return { id: crypto.randomUUID(), fecha, horaInicio: "", horaFin: "", puestoId, estado: "Pendiente" };
}

// sesiones: todas las sesiones del estudio (lista plana) para detectar choques de puesto y tatuador.
export default function ReservationModal({ puestos, catalogos, user, reserva, sesiones, initialDate = "", initialPuesto = "", onSave, onClose }) {
  const dialogRef = useModalDialog();
  const today = todayInSantiago();
  const [requestId] = useState(() => reserva?.id ?? crypto.randomUUID());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [clienteId, setClienteId] = useState(reserva?.clienteId ?? "");
  const [clienteNombre, setClienteNombre] = useState(reserva?.cliente ?? "");
  const [clienteRut, setClienteRut] = useState("");
  const [clientMatches, setClientMatches] = useState([]);
  const [searchingClients, setSearchingClients] = useState(false);
  const [tatuadorId, setTatuadorId] = useState(user.role === "tatuador" ? user.id : reserva?.tatuadorId ?? "");
  const [precio, setPrecio] = useState(reserva?.precio ?? "");
  const [sessions, setSessions] = useState(() => reserva?.sesiones?.length
    ? reserva.sesiones.map((item) => ({ ...item }))
    : [newSession(initialDate >= today ? initialDate : today, initialPuesto)]);
  const originals = new Map((reserva?.sesiones ?? []).map((item) => [item.id, item]));
  const crossing = overlappingWithinReservation(sessions);

  useEffect(() => {
    const query = clienteNombre.trim();
    if (clienteId || query.length < 2) {
      return undefined;
    }
    let active = true;
    const timer = setTimeout(async () => {
      setSearchingClients(true);
      try {
        const rows = await authRequest(`/api/clientes?busqueda=${encodeURIComponent(query)}`);
        if (active) setClientMatches(rows);
      } catch {
        if (active) setClientMatches([]);
      } finally {
        if (active) setSearchingClients(false);
      }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [clienteNombre, clienteId]);

  function updateSession(index, patch) {
    setSessions((current) => current.map((item, position) => position === index ? { ...item, ...patch } : item));
    setError("");
  }

  function addSession() {
    const last = sessions.at(-1);
    setSessions((current) => [...current, newSession(last?.fecha >= today ? last.fecha : today, last?.puestoId ?? "")]);
    setError("");
  }

  function removeSession(index) {
    setSessions((current) => current.filter((_, position) => position !== index));
    setError("");
  }

  // Motivo por el que una sesión no se puede guardar, o "" si está bien.
  function sessionIssue(sesion, index) {
    if (!sesion.fecha || !sesion.horaInicio || !sesion.horaFin) return "";
    if (sesion.horaFin <= sesion.horaInicio) return "La hora de término debe ser posterior a la de inicio.";
    const original = originals.get(sesion.id);
    const scheduleChanged = !original || original.fecha !== sesion.fecha || original.horaInicio !== sesion.horaInicio || original.horaFin !== sesion.horaFin;
    if (scheduleChanged && !isFutureReservationStart(sesion.fecha, sesion.horaInicio)) return "Debe comenzar después de la fecha y hora actuales de Santiago.";
    const puesto = puestos.find((item) => item.id === sesion.puestoId);
    if (!puesto) return "Selecciona un puesto.";
    const puestoChanged = scheduleChanged || original.puestoId !== sesion.puestoId;
    if (!puesto.disponible && puestoChanged && sesion.estado !== "Cancelado") return `${puesto.nombre} está en ${puesto.estado.toLowerCase()}. Elige otro puesto.`;
    if (crossing.has(index)) return "Se cruza con otra sesión de esta reserva.";
    const [taken] = puestoConflicts(sesiones, sesion, reserva?.id);
    if (taken) return `${puesto.nombre} está ocupado de ${taken.horaInicio} a ${taken.horaFin} (${taken.tatuador}).`;
    const [busy] = artistConflicts(sesiones, sesion, tatuadorId, reserva?.id);
    if (busy) return `El tatuador ya tiene otra sesión de ${busy.horaInicio} a ${busy.horaFin} en ${busy.puesto}.`;
    return "";
  }

  const issues = sessions.map(sessionIssue);
  const firstIssue = issues.find(Boolean) ?? "";

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const price = Number(precio);
    if ((!clienteId && !clienteNombre.trim()) || !tatuadorId || precio === "" || !Number.isSafeInteger(price) || price < 0) {
      setError("Ingresa o selecciona un cliente, selecciona un tatuador e ingresa un precio entero igual o mayor a cero.");
      return;
    }
    const rutError = clienteId ? "" : rutValidationError(clienteRut);
    if (rutError) {
      setError(rutError);
      return;
    }
    if (sessions.length === 0) {
      setError("Agrega al menos una sesión.");
      return;
    }
    if (sessions.some((item) => !item.fecha || !item.horaInicio || !item.horaFin || !item.puestoId)) {
      setError("Completa la fecha, el horario y el puesto de cada sesión.");
      return;
    }
    if (firstIssue) {
      setError(firstIssue);
      return;
    }
    setSaving(true);
    try {
      await onSave({
        id: requestId,
        clienteId: clienteId || undefined,
        clienteNombre: clienteId ? undefined : clienteNombre.trim(),
        clienteRut: clienteId ? undefined : normalizeRut(clienteRut) || undefined,
        tatuadorId,
        precio: price,
        sesiones: sessions,
      });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar la reserva. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal" aria-labelledby="reservation-modal-title" onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }} aria-busy={saving}>
      <div className="reservation-modal-header">
        <h2 id="reservation-modal-title">{reserva ? "Editar reserva" : "Crear reserva"}</h2>
        <button type="button" className="reservation-modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar formulario">×</button>
      </div>
      <p className="reservation-modal-description">{reserva ? "Actualiza los datos del tatuaje y sus sesiones. La fecha de creación se conserva." : "Registra el tatuaje y agenda una o más sesiones. La fecha de creación se registra automáticamente."}</p>
      <form className="reservation-form" onSubmit={handleSubmit}>
        <fieldset disabled={saving} style={{ display: "contents" }}>
        <label>Cliente
          <input value={clienteNombre} onChange={(event) => { setClienteNombre(event.target.value); setClienteId(""); setClienteRut(""); setClientMatches([]); setError(""); }} placeholder="Buscar o registrar cliente" required autoFocus />
        </label>
        {searchingClients && <p className="reservation-occupancy" role="status">Buscando clientes…</p>}
        {clientMatches.length > 0 && <div className="reservation-client-matches" role="listbox" aria-label="Clientes encontrados">
          <p>Clientes encontrados</p>
          {clientMatches.map((item) => <button type="button" key={item.id} onClick={() => { setClienteId(item.id); setClienteNombre(item.nombre); setClienteRut(item.rut ?? ""); setClientMatches([]); }}>
            {item.nombre}{item.rut ? ` · ${formatRut(item.rut)}` : ""}
          </button>)}
        </div>}
        {!clienteId && clienteNombre.trim().length >= 2 && <label>RUT del cliente
          <input value={clienteRut} onChange={(event) => { setClienteRut(typedRut(event.target.value)); setError(""); }} onBlur={() => setClienteRut(formatRut(clienteRut))} maxLength={11} placeholder="Ej: 11222333-K" aria-describedby="rut-ayuda" autoComplete="off" required />
          <small id="rut-ayuda" className="reservation-occupancy">Sin puntos y con guion antes del dígito verificador.</small>
        </label>}
        {!clienteId && clienteNombre.trim().length >= 2 && <p className="reservation-occupancy">Si no seleccionas una coincidencia, se registrará un cliente nuevo con su RUT validado.</p>}
        {user.role === "tatuador" ? <label>Tatuador<input value={user.name} readOnly /></label> : (
          <label>Tatuador
            <select value={tatuadorId} onChange={(event) => { setTatuadorId(event.target.value); setError(""); }} required>
              <option value="" disabled>Selecciona un tatuador activo</option>
              {catalogos.tatuadores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
            </select>
          </label>
        )}
        <label>Precio total del tatuaje (CLP)<input value={precio} onChange={(event) => { setPrecio(event.target.value); setError(""); }} type="number" min="0" step="1" required /></label>

        <section className="reservation-sessions" aria-labelledby="reservation-sessions-title">
          <h3 id="reservation-sessions-title">Sesiones ({sessions.length})</h3>
          {sessions.map((sesion, index) => {
            const original = originals.get(sesion.id);
            const issue = issues[index];
            return (
              <fieldset className={`reservation-session${issue ? " reservation-session-error" : ""}`} key={sesion.id}>
                <legend>Sesión {index + 1}</legend>
                <div className="reservation-form-row">
                  <label>Fecha<input value={sesion.fecha} onChange={(event) => updateSession(index, { fecha: event.target.value })} type="date" min={original?.fecha && original.fecha < today ? undefined : today} required /></label>
                  <label>Estado
                    <select value={sesion.estado} onChange={(event) => updateSession(index, { estado: event.target.value })}>
                      {reservationStatuses.map(({ estado }) => <option key={estado}>{estado}</option>)}
                    </select>
                  </label>
                </div>
                <div className="reservation-form-row">
                  <label>Hora de inicio<input value={sesion.horaInicio} onChange={(event) => updateSession(index, { horaInicio: event.target.value })} type="time" required /></label>
                  <label>Hora de término<input value={sesion.horaFin} onChange={(event) => updateSession(index, { horaFin: event.target.value })} type="time" required /></label>
                </div>
                <label>Puesto
                  <select value={sesion.puestoId} onChange={(event) => updateSession(index, { puestoId: event.target.value })} required>
                    <option value="" disabled>Selecciona un puesto</option>
                    {puestos.map((puesto) => {
                      const taken = puestoConflicts(sesiones, { ...sesion, puestoId: puesto.id }, reserva?.id).length > 0;
                      return <option key={puesto.id} value={puesto.id} disabled={!puesto.disponible && puesto.id !== original?.puestoId}>
                        {puesto.nombre}{!puesto.disponible ? ` — ${puesto.estado}` : taken ? " — Ocupado en ese horario" : ""}
                      </option>;
                    })}
                  </select>
                </label>
                {issue && <p className="reservation-form-error" role="alert">{issue}</p>}
                {sessions.length > 1 && <button type="button" className="reservation-button reservation-button-secondary reservation-session-remove" onClick={() => removeSession(index)}>Quitar sesión {index + 1}</button>}
              </fieldset>
            );
          })}
          <button type="button" className="reservation-button reservation-button-secondary" onClick={addSession} disabled={sessions.length >= 30}>+ Agregar sesión</button>
        </section>

        {error && <p className="reservation-form-error" role="alert">{error}</p>}
        <div className="reservation-modal-actions">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="reservation-button" disabled={saving || Boolean(firstIssue)}>{saving ? "Guardando…" : reserva ? "Guardar cambios" : "Guardar reserva"}</button>
        </div>
        </fieldset>
      </form>
    </dialog>
  );
}
