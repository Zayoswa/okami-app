import { useEffect, useState } from "react";
import useModalDialog from "../hooks/useModalDialog";
import { reservationStatuses } from "../data/reservationStatuses";
import { isFutureReservationStart, todayInSantiago } from "../utils/calendar";
import { artistConflicts, overlappingWithinReservation, puestoConflicts } from "../utils/sessions";
import { authRequest } from "../services/authService";
import { formatRut, normalizeRut, rutValidationError, typedRut } from "../utils/rut";
import { puestoBlockReason, titularPuesto } from "../utils/puestos";
import { formatPrice } from "../utils/format";
import "./ReservationModal.css";

// "11:00" y "13:30" → "2 h 30 min". Devuelve "" si el horario no es válido.
function durationLabel(inicio, fin) {
  if (!inicio || !fin || fin <= inicio) return "";
  const toMinutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const total = toMinutes(fin) - toMinutes(inicio);
  const horas = Math.floor(total / 60);
  const minutos = total % 60;
  return [horas && `${horas} h`, minutos && `${minutos} min`].filter(Boolean).join(" ");
}

// Iniciales para el avatar del cliente ("Camila Rojas" → "CR").
function initials(nombre) {
  return String(nombre ?? "").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function newSession(fecha, puestoId = "") {
  return { id: crypto.randomUUID(), fecha, horaInicio: "", horaFin: "", puestoId, estado: "Programada" };
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
  // Puesto del que el tatuador es titular: se propone por defecto en las sesiones nuevas.
  const homePuesto = titularPuesto(puestos, tatuadorId);
  const [sessions, setSessions] = useState(() => reserva?.sesiones?.length
    ? reserva.sesiones.map((item) => ({ ...item }))
    : [newSession(initialDate >= today ? initialDate : today, initialPuesto || (homePuesto?.disponible ? homePuesto.id : ""))]);
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

  // Al elegir otro tatuador en una reserva nueva, las sesiones sin puesto (o con el puesto
  // del tatuador anterior) pasan al puesto del nuevo tatuador, si es titular de uno habilitado.
  function changeArtist(nextId) {
    setTatuadorId(nextId);
    setError("");
    if (reserva) return;
    const previous = homePuesto?.id ?? "";
    const next = titularPuesto(puestos, nextId);
    if (!next?.disponible) return;
    const target = next.id;
    setSessions((current) => current.map((item) => (item.puestoId === "" || item.puestoId === previous) ? { ...item, puestoId: target } : item));
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
    // Igual que en el servidor: una sesión ya agendada que no cambia se puede completar o cancelar.
    const blocked = sesion.estado !== "Cancelada" ? puestoBlockReason(puesto, tatuadorId) : "";
    const artistChanged = Boolean(original) && reserva.tatuadorId !== tatuadorId;
    if (blocked === "Solo titulares" && (puestoChanged || artistChanged)) return `${puesto.nombre} es un puesto ${puesto.tipo} y solo lo usan sus titulares. Elige tu puesto o uno rotativo.`;
    if (blocked && blocked !== "Solo titulares" && puestoChanged) return `${puesto.nombre} está en ${puesto.estado.toLowerCase()}. Elige otro puesto.`;
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

  const isNewClient = !clienteId && clienteNombre.trim().length >= 2;
  const rutStatus = isNewClient && clienteRut.trim() ? rutValidationError(clienteRut) : null;
  const priceNumber = Number(precio);
  const hasPrice = precio !== "" && Number.isSafeInteger(priceNumber) && priceNumber >= 0;

  function selectClient(item) {
    setClienteId(item.id);
    setClienteNombre(item.nombre);
    setClienteRut(item.rut ?? "");
    setClientMatches([]);
    setError("");
  }

  function changeClient() {
    setClienteId("");
    setClienteNombre("");
    setClienteRut("");
    setClientMatches([]);
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal reservation-editor" aria-labelledby="reservation-modal-title" onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }} aria-busy={saving}>
      <form className="reservation-form" onSubmit={handleSubmit}>
        {/* Cabecera fija */}
        <div className="editor-header">
          <div>
            <h2 id="reservation-modal-title">{reserva ? "Editar reserva" : "Crear reserva"}</h2>
            <p className="reservation-modal-description">{reserva ? "Actualiza los datos del tatuaje y sus sesiones. La fecha de creación se conserva." : "Registra el tatuaje y agenda una o más sesiones."}</p>
          </div>
          <button type="button" className="reservation-modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar formulario">×</button>
        </div>

        <fieldset className="editor-body" disabled={saving}>
          {/* Paso 1: cliente */}
          <section className="editor-step" aria-labelledby="step-cliente">
            <h3 id="step-cliente" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">1</span>Cliente</h3>

            {clienteId ? (
              <div className="client-chip">
                <span className="client-avatar" aria-hidden="true">{initials(clienteNombre)}</span>
                <div>
                  <strong>{clienteNombre}</strong>
                  {clienteRut && <span>RUT {formatRut(clienteRut)}</span>}
                </div>
                <button type="button" className="reservation-button reservation-button-secondary" onClick={changeClient}>Cambiar</button>
              </div>
            ) : (
              <>
                <label>Buscar o registrar cliente
                  <input value={clienteNombre} onChange={(event) => { setClienteNombre(event.target.value); setClienteId(""); setClienteRut(""); setClientMatches([]); setError(""); }} placeholder="Escribe nombre o RUT" required autoFocus={!reserva} autoComplete="off" />
                </label>
                {searchingClients && <p className="editor-hint" role="status">Buscando clientes…</p>}
                {clientMatches.length > 0 && (
                  <div className="client-matches" role="listbox" aria-label="Clientes encontrados">
                    <p className="editor-hint">Clientes encontrados: selecciona uno para reutilizarlo</p>
                    {clientMatches.map((item) => (
                      <button type="button" role="option" aria-selected="false" key={item.id} onClick={() => selectClient(item)}>
                        <span className="client-avatar" aria-hidden="true">{initials(item.nombre)}</span>
                        <span className="client-match-name">{item.nombre}</span>
                        {item.rut && <span className="client-match-rut">{formatRut(item.rut)}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {isNewClient && (
                  <div className="new-client">
                    <p className="new-client-title">Cliente nuevo</p>
                    <p className="editor-hint">Si no eliges una coincidencia, se registrará a <strong>{clienteNombre.trim()}</strong> con este RUT.</p>
                    <label>RUT del cliente
                      <input value={clienteRut} onChange={(event) => { setClienteRut(typedRut(event.target.value)); setError(""); }} onBlur={() => setClienteRut(formatRut(clienteRut))} maxLength={11} placeholder="11222333-K" aria-describedby="rut-ayuda" aria-invalid={Boolean(rutStatus)} autoComplete="off" required className={rutStatus === "" ? "input-valid" : rutStatus ? "input-invalid" : ""} />
                      <small id="rut-ayuda" className={`editor-hint${rutStatus === "" ? " hint-ok" : rutStatus ? " hint-error" : ""}`}>
                        {rutStatus === "" ? "✓ RUT válido" : rutStatus || "Sin puntos y con guion antes del dígito verificador."}
                      </small>
                    </label>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Paso 2: datos del tatuaje */}
          <section className="editor-step" aria-labelledby="step-tatuaje">
            <h3 id="step-tatuaje" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">2</span>Tatuaje</h3>
            <div className="reservation-form-row">
              {user.role === "tatuador" ? <label>Tatuador<input value={user.name} readOnly /></label> : (
                <label>Tatuador
                  <select value={tatuadorId} onChange={(event) => changeArtist(event.target.value)} required>
                    <option value="" disabled>Selecciona un tatuador</option>
                    {catalogos.tatuadores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                  </select>
                </label>
              )}
              <label>Precio total (CLP)
                <span className="price-input">
                  <span aria-hidden="true">$</span>
                  <input value={precio} onChange={(event) => { setPrecio(event.target.value); setError(""); }} type="number" min="0" step="1" inputMode="numeric" placeholder="120000" required />
                </span>
                <small className="editor-hint">{hasPrice ? formatPrice(priceNumber) : "Monto entero, sin puntos."}</small>
              </label>
            </div>
          </section>

          {/* Paso 3: sesiones */}
          <section className="editor-step" aria-labelledby="step-sesiones">
            <h3 id="step-sesiones" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">3</span>Sesiones <span className="editor-step-count">{sessions.length}</span></h3>
            {sessions.map((sesion, index) => {
              const original = originals.get(sesion.id);
              const issue = issues[index];
              const complete = Boolean(sesion.fecha && sesion.horaInicio && sesion.horaFin && sesion.puestoId);
              const duration = durationLabel(sesion.horaInicio, sesion.horaFin);
              // Una sesión nueva siempre nace Programada; el estado solo se cambia al editar una ya guardada.
              const canChangeStatus = Boolean(original);
              return (
                <fieldset className={`session-card ${sesion.estado.toLowerCase()}${issue ? " session-card-error" : ""}`} key={sesion.id}>
                  <legend className="session-card-legend">Sesión {index + 1}</legend>
                  <div className="session-card-header">
                    <span className="session-card-name" aria-hidden="true">Sesión {index + 1}</span>
                    {duration && <span className="session-card-duration">{duration}</span>}
                    {!canChangeStatus && <span className={`reserva-estado ${sesion.estado.toLowerCase()}`}>{sesion.estado}</span>}
                    {sessions.length > 1 && <button type="button" className="session-card-remove" onClick={() => removeSession(index)} aria-label={`Quitar sesión ${index + 1}`}>×</button>}
                  </div>

                  <div className="session-card-grid">
                    <label>Fecha<input value={sesion.fecha} onChange={(event) => updateSession(index, { fecha: event.target.value })} type="date" min={original?.fecha && original.fecha < today ? undefined : today} required /></label>
                    <label>Inicio<input value={sesion.horaInicio} onChange={(event) => updateSession(index, { horaInicio: event.target.value })} type="time" required /></label>
                    <label>Término<input value={sesion.horaFin} onChange={(event) => updateSession(index, { horaFin: event.target.value })} type="time" required /></label>
                  </div>

                  <label>Puesto
                    <select value={sesion.puestoId} onChange={(event) => updateSession(index, { puestoId: event.target.value })} required>
                      <option value="" disabled>Selecciona un puesto</option>
                      {puestos.map((puesto) => {
                        const taken = puestoConflicts(sesiones, { ...sesion, puestoId: puesto.id }, reserva?.id).length > 0;
                        const blocked = puestoBlockReason(puesto, tatuadorId);
                        return <option key={puesto.id} value={puesto.id} disabled={Boolean(blocked) && puesto.id !== original?.puestoId}>
                          {puesto.nombre}{puesto.id === homePuesto?.id ? " · Titular" : ""}{blocked ? ` — ${blocked}` : taken ? " — Ocupado en ese horario" : ""}
                        </option>;
                      })}
                    </select>
                  </label>

                  {canChangeStatus && (
                    <div className="status-field">
                      <span className="status-field-label" id={`estado-label-${sesion.id}`}>Estado</span>
                      <div className="status-picker" role="radiogroup" aria-labelledby={`estado-label-${sesion.id}`}>
                        {reservationStatuses.map(({ estado }) => (
                          <label key={estado} className={`status-option ${estado.toLowerCase()}${sesion.estado === estado ? " status-option-active" : ""}`}>
                            <input type="radio" name={`estado-${sesion.id}`} value={estado} checked={sesion.estado === estado} onChange={() => updateSession(index, { estado })} />
                            {estado}
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {issue
                    ? <p className="session-feedback session-feedback-error" role="alert">{issue}</p>
                    : complete && <p className="session-feedback session-feedback-ok">✓ Horario y puesto disponibles</p>}
                </fieldset>
              );
            })}
            <button type="button" className="add-session" onClick={addSession} disabled={sessions.length >= 30}>+ Agregar otra sesión</button>
          </section>

          {error && <p className="reservation-form-error editor-error" role="alert">{error}</p>}
        </fieldset>

        {/* Pie fijo con resumen y acciones */}
        <div className="editor-footer">
          <p className="editor-summary">
            {sessions.length} {sessions.length === 1 ? "sesión" : "sesiones"}
            {hasPrice && <> · <strong>{formatPrice(priceNumber)}</strong></>}
          </p>
          <div className="reservation-modal-actions">
            <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="reservation-button" disabled={saving || Boolean(firstIssue)}>{saving ? "Guardando…" : reserva ? "Guardar cambios" : "Guardar reserva"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
