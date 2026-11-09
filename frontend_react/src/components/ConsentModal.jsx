import { useEffect, useState } from "react";
import useModalDialog from "../hooks/useModalDialog";
import Notice from "./Notice";
import { authRequest } from "../services/authService";
import { todayInSantiago } from "../utils/calendar";
import { formatDate } from "../utils/format";
import { formatRut, typedRut } from "../utils/rut";
import { CONSENT_LIMITS, TATTOO_TYPES, ageOn, consentError, consentPayload, emptyConsent, fromReservation, isMinor } from "../utils/consentimientos";
import "./ReservationModal.css";
import "./ConsentModal.css";

// Formulario del consentimiento informado. Se puede partir desde una reserva (copia cliente, tatuador, zona y diseño).
// - tatuadores: [{ id, nombre }] (admin y recepción eligen; el tatuador solo puede ser él mismo).
// - reservas: reservas visibles con cliente (las propias para un tatuador).
// onSaved(consentimiento) recibe lo que devuelve la API (con su folio) para abrir el PDF.
export default function ConsentModal({ user, tatuadores, reservas, initialReservaId = "", onSaved, onClose }) {
  const dialogRef = useModalDialog();
  const today = todayInSantiago();
  const isArtist = user.role === "tatuador";
  const [form, setForm] = useState(() => {
    const base = emptyConsent(today, isArtist ? String(user.id) : "");
    return fromReservation(base, reservas.find((item) => item.id === initialReservaId));
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const minor = isMinor(form);
  const age = ageOn(form.clienteNacimiento, form.fecha);

  // Datos del tatuador (RUT, nacimiento, teléfono) desde su último consentimiento, para no escribirlos cada vez.
  useEffect(() => {
    if (!form.tatuadorId) return undefined;
    let active = true;
    authRequest(`/api/consentimientos/tatuador/${encodeURIComponent(form.tatuadorId)}`)
      .then((data) => {
        if (!active) return;
        setForm((current) => current.tatuadorId !== form.tatuadorId ? current : {
          ...current,
          tatuadorRut: current.tatuadorRut || formatRut(data.rut ?? ""),
          tatuadorNacimiento: current.tatuadorNacimiento || (data.nacimiento ?? ""),
          tatuadorTelefono: current.tatuadorTelefono || (data.telefono ?? ""),
        });
      })
      .catch(() => { /* sin datos previos: se escriben a mano */ });
    return () => { active = false; };
  }, [form.tatuadorId]);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError("");
  }

  function chooseArtist(id) {
    setForm((current) => ({ ...current, tatuadorId: id, tatuadorRut: "", tatuadorNacimiento: "", tatuadorTelefono: "" }));
    setError("");
  }

  function chooseReservation(id) {
    setForm((current) => fromReservation(current, reservas.find((item) => item.id === id)));
    setError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    const problem = consentError(form, today);
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    try {
      const saved = await authRequest("/api/consentimientos", { method: "POST", body: JSON.stringify(consentPayload(form)) });
      onSaved(saved);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar el consentimiento.");
      setSaving(false);
    }
  }

  const field = (name) => ({ value: form[name], onChange: (event) => update(name, event.target.value) });
  const rutField = (name) => ({
    value: form[name], onChange: (event) => update(name, typedRut(event.target.value)),
    onBlur: () => update(name, formatRut(form[name])), maxLength: 11, placeholder: "11222333-K", autoComplete: "off",
  });

  return (
    <dialog ref={dialogRef} className="reservation-modal reservation-editor consent-modal" aria-labelledby="consent-title"
      onCancel={(event) => { if (saving) event.preventDefault(); else onClose(); }} aria-busy={saving}>
      <form className="reservation-form" onSubmit={handleSubmit} noValidate>
        <div className="editor-header">
          <div>
            <h2 id="consent-title">Nuevo consentimiento informado</h2>
            <p className="reservation-modal-description">Al guardar se asigna un folio y se abre el PDF listo para imprimir y firmar.</p>
          </div>
          <button type="button" className="reservation-modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar formulario">×</button>
        </div>

        <fieldset className="editor-body" disabled={saving}>
          {/* 1. Reserva y fecha */}
          <section className="editor-step" aria-labelledby="consent-step-1">
            <h3 id="consent-step-1" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">1</span>Reserva y fecha</h3>
            <div className="reservation-form-row">
              <label>Reserva (opcional)
                <select value={form.reservaId} onChange={(event) => chooseReservation(event.target.value)}>
                  <option value="">Sin reserva</option>
                  {reservas.map((item) => (
                    <option key={item.id} value={item.id}>{item.cliente} · {item.tatuador}{item.proxima ? ` · ${formatDate(item.proxima)}` : ""}</option>
                  ))}
                </select>
                <small className="editor-hint">Copia el cliente, el tatuador, la zona y el diseño.</small>
              </label>
              <label>Fecha
                <input type="date" max={today} required {...field("fecha")} />
              </label>
            </div>
          </section>

          {/* 2. Tatuador */}
          <section className="editor-step" aria-labelledby="consent-step-2">
            <h3 id="consent-step-2" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">2</span>Tatuador</h3>
            <div className="reservation-form-row">
              {isArtist ? <label>Tatuador<input value={user.name} readOnly /></label> : (
                <label>Tatuador
                  <select value={form.tatuadorId} onChange={(event) => chooseArtist(event.target.value)} required>
                    <option value="" disabled>Selecciona un tatuador</option>
                    {tatuadores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
                  </select>
                </label>
              )}
              <label>RUT del tatuador<input required {...rutField("tatuadorRut")} /></label>
            </div>
            <div className="reservation-form-row">
              <label>Fecha de nacimiento (opcional)<input type="date" max={today} {...field("tatuadorNacimiento")} /></label>
              <label>Teléfono (opcional)<input type="tel" maxLength={CONSENT_LIMITS.telefono} placeholder="+56 9 1234 5678" {...field("tatuadorTelefono")} /></label>
            </div>
          </section>

          {/* 3. Cliente */}
          <section className="editor-step" aria-labelledby="consent-step-3">
            <h3 id="consent-step-3" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">3</span>Cliente</h3>
            <div className="reservation-form-row">
              <label>Nombre<input maxLength={CONSENT_LIMITS.nombre} placeholder="Camila Rojas" autoComplete="off" required {...field("clienteNombre")} /></label>
              <label>RUT<input required {...rutField("clienteRut")} /></label>
            </div>
            <div className="reservation-form-row">
              <label>Fecha de nacimiento
                <input type="date" max={today} required {...field("clienteNacimiento")} />
                <small className={`editor-hint${minor ? " hint-error" : ""}`}>
                  {age === null ? "Con ella se calcula la edad." : minor ? `${age} años: menor de edad, necesita representante.` : `${age} años.`}
                </small>
              </label>
              <label>Teléfono (opcional)<input type="tel" maxLength={CONSENT_LIMITS.telefono} placeholder="+56 9 1234 5678" {...field("clienteTelefono")} /></label>
            </div>
            <label>Dirección (opcional)<input maxLength={CONSENT_LIMITS.direccion} placeholder="Calle 123, comuna" {...field("clienteDireccion")} /></label>
          </section>

          {/* 4. Representante: solo si el cliente es menor de edad */}
          {minor && (
            <section className="editor-step consent-guardian" aria-labelledby="consent-step-4">
              <h3 id="consent-step-4" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">4</span>Representante legal</h3>
              <p className="editor-hint">El cliente tiene {age} años: el representante debe estar presente y firmar.</p>
              <div className="reservation-form-row">
                <label>Nombre<input maxLength={CONSENT_LIMITS.nombre} autoComplete="off" required {...field("representanteNombre")} /></label>
                <label>RUT<input required {...rutField("representanteRut")} /></label>
              </div>
              <div className="reservation-form-row">
                <label>Fecha de nacimiento (opcional)<input type="date" max={today} {...field("representanteNacimiento")} /></label>
                <label>Teléfono (opcional)<input type="tel" maxLength={CONSENT_LIMITS.telefono} {...field("representanteTelefono")} /></label>
              </div>
            </section>
          )}

          {/* 5. Trabajo a realizar */}
          <section className="editor-step" aria-labelledby="consent-step-5">
            <h3 id="consent-step-5" className="editor-step-title"><span className="editor-step-number" aria-hidden="true">{minor ? 5 : 4}</span>Trabajo a realizar</h3>
            <label>Descripción
              <textarea rows={2} maxLength={CONSENT_LIMITS.descripcion} placeholder="Rosa en línea fina con sombreado suave" required {...field("descripcion")} />
              <small className="editor-hint">{form.descripcion.length} / {CONSENT_LIMITS.descripcion} caracteres (lo que cabe en el PDF).</small>
            </label>
            <div className="reservation-form-row">
              <label>Zona del cuerpo<input maxLength={CONSENT_LIMITS.zonaCuerpo} placeholder="Antebrazo derecho" required {...field("zonaCuerpo")} /></label>
              <label>Tipo de tatuaje
                <select {...field("tipoTatuaje")}>
                  {TATTOO_TYPES.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                </select>
              </label>
            </div>
            <label>Condiciones médicas y otros comentarios (opcional)
              <textarea rows={2} maxLength={CONSENT_LIMITS.condiciones} placeholder="Alergias, medicamentos, enfermedades de la piel…" {...field("condiciones")} />
              <small className="editor-hint">{form.condiciones.length} / {CONSENT_LIMITS.condiciones} caracteres. Si queda vacío, el PDF dice «Sin condiciones informadas».</small>
            </label>
          </section>
        </fieldset>

        <div className="editor-footer consent-footer">
          {error && <Notice tone="danger" className="notice--compact">{error}</Notice>}
          <div className="reservation-modal-actions">
            <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="reservation-button" disabled={saving}>{saving ? "Guardando…" : "Guardar y ver PDF"}</button>
          </div>
        </div>
      </form>
    </dialog>
  );
}
