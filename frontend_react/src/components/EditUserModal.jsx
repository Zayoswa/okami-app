import { useState } from "react";
import { authRequest } from "../services/authService";
import useModalDialog from "../hooks/useModalDialog";
import Notice from "./Notice";

// Ventana para editar el rol (tatuador / recepción, solo admin) y la modalidad de un tatuador.
//   person             usuario de la tarjeta: { id, nombre, role, modalidad }
//   roles              roles que se pueden elegir (vacío: el rol no se edita, por ejemplo para recepción)
//   modalities         catálogo de modalidades
//   onSaved(message)   se guardó: el padre recarga el listado y cierra la ventana
//   onClose()          cancelar (también con Escape o la ×)
// Los errores del servidor (titular de un puesto, sesiones programadas, etc.) se muestran aquí sin cerrar.
export default function EditUserModal({ person, roles, modalities, onSaved, onClose }) {
  const dialogRef = useModalDialog();
  const rolActual = roles.find(r => r.nombre.trim().toLowerCase() === person.role);
  const [rol, setRol] = useState(rolActual ? String(rolActual.id) : "");
  const [modalidad, setModalidad] = useState(person.modalidad ? String(person.modalidad) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canEditRole = roles.length > 0;
  const rolElegido = roles.find(r => String(r.id) === rol);
  const nuevoRol = rolElegido ? rolElegido.nombre.trim().toLowerCase() : person.role;
  const cambiaRol = nuevoRol !== person.role;
  const cambiaModalidad = nuevoRol === "tatuador" && modalidad !== String(person.modalidad ?? "");
  const sinCambios = !cambiaRol && !cambiaModalidad;

  function close() {
    if (!busy) onClose();
  }

  async function submit(event) {
    event.preventDefault();
    if (busy || sinCambios) return;
    setBusy(true); setError("");
    try {
      if (cambiaRol) {
        await authRequest(`/api/usuarios/${person.id}/rol`, {
          method: "PATCH",
          body: JSON.stringify({ rol: Number(rol), modalidad: nuevoRol === "tatuador" && modalidad ? Number(modalidad) : null }),
        });
        onSaved(`${person.nombre} ahora es ${nuevoRol === "tatuador" ? "tatuador" : "recepción"}.`);
      } else {
        await authRequest(`/api/usuarios/${person.id}/modalidad`, {
          method: "PATCH",
          body: JSON.stringify({ modalidad: Number(modalidad) }),
        });
        const nombre = modalities.find(m => String(m.id) === modalidad)?.nombre ?? "la nueva modalidad";
        onSaved(`${person.nombre} ahora tiene modalidad ${nombre}.`);
      }
    } catch (cause) {
      setError(cause.message);
      setBusy(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal artists-modal" aria-labelledby="edit-user-title"
      onCancel={(event) => { event.preventDefault(); close(); }}>
      <div className="reservation-modal-header">
        <h2 id="edit-user-title">Editar a {person.nombre}</h2>
        <button type="button" className="reservation-modal-close" onClick={close} aria-label="Cerrar">×</button>
      </div>
      <p className="reservation-modal-description">
        {canEditRole ? "Cambia su rol en el estudio o, si es tatuador, su modalidad de arriendo." : "Cambia su modalidad de arriendo."}
      </p>

      <form className="artists-form" onSubmit={submit}>
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="artists-form-row">
          {canEditRole && (
            <label>Rol
              <select required value={rol} onChange={e => { setRol(e.target.value); setError(""); }}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
              </select>
            </label>
          )}
          {nuevoRol === "tatuador" && (
            <label>Modalidad
              <select required value={modalidad} onChange={e => { setModalidad(e.target.value); setError(""); }}>
                <option value="">Seleccionar</option>
                {modalities.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
          )}
        </div>
        {cambiaRol && person.role === "tatuador" && (
          <small>Al pasar a recepción deja de tener modalidad y arriendo. Si es titular de un puesto o tiene sesiones programadas, primero hay que resolverlas.</small>
        )}
        {cambiaModalidad && !cambiaRol && <small>El arriendo se calcula con la nueva modalidad desde este mes.</small>}
        <div className="reservation-modal-actions">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={close} disabled={busy}>Cancelar</button>
          <button type="submit" className="reservation-button" disabled={busy || sinCambios}>{busy ? "Guardando…" : "Guardar cambios"}</button>
        </div>
      </form>
    </dialog>
  );
}
