import { useEffect, useRef, useState } from "react";
import { reservationStatuses } from "../data/reservationStatuses";
import { formatDate } from "../utils/format";
import { reservationStatus } from "../utils/sessions";
import "./StatusMenu.css";

const chronological = (a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio);

// Botón con el estado de la reserva. Al pulsarlo se abre una ventana pequeña debajo
// para cambiar el estado de cada sesión; el cambio se guarda al elegirlo.
// onChange(reserva, sesionId, estado) guarda; si falla, el error se muestra en la misma ventana.
export default function StatusMenu({ reserva, onChange }) {
  const [open, setOpen] = useState(false);
  // Opción que se está guardando: { id de la sesión, estado elegido } o null.
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState("");
  const rootRef = useRef(null);
  const estado = reservationStatus(reserva);
  const sesiones = [...(reserva.sesiones ?? [])].sort(chronological);
  const menuId = `estado-${reserva.id}`;

  // Se cierra al hacer clic fuera o con Escape (salvo mientras guarda).
  useEffect(() => {
    if (!open) return undefined;
    function onPointer(event) {
      if (!saving && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKey(event) {
      if (event.key === "Escape" && !saving) {
        setOpen(false);
        rootRef.current?.querySelector(".status-menu-trigger")?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, saving]);

  function toggle() {
    setError("");
    setOpen((value) => !value);
  }

  async function choose(sesion, nuevo) {
    if (saving || sesion.estado === nuevo) return;
    setSaving({ id: sesion.id, estado: nuevo });
    setError("");
    try {
      await onChange(reserva, sesion.id, nuevo);
      // Con una sola sesión ya no hay nada más que elegir: se cierra.
      if (sesiones.length === 1) setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado. Intenta nuevamente.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="status-menu" ref={rootRef}>
      <button type="button" className={`reservation-button reservation-status-button status-menu-trigger ${estado.toLowerCase()}`}
        onClick={toggle} aria-expanded={open} aria-controls={menuId} aria-haspopup="true"
        aria-label={`Estado ${estado}: cambiar el estado de la reserva de ${reserva.cliente}`}>
        {estado} <span className="status-menu-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="status-menu-panel" id={menuId} role="group" aria-label={`Estado de las sesiones de ${reserva.cliente}`}>
          {sesiones.map((sesion, index) => (
            <div className="status-menu-row" key={sesion.id}>
              {sesiones.length > 1 && (
                <p className="status-menu-session">
                  <strong>Sesión {index + 1}</strong> · {formatDate(sesion.fecha)} · {sesion.horaInicio}
                </p>
              )}
              <div className="status-menu-options">
                {reservationStatuses.map(({ estado: opcion }) => {
                  const active = sesion.estado === opcion;
                  return (
                    <button type="button" key={opcion} disabled={Boolean(saving)} aria-pressed={active}
                      className={`status-menu-option ${opcion.toLowerCase()}${active ? " status-menu-option-active" : ""}`}
                      onClick={() => choose(sesion, opcion)}>
                      {saving?.id === sesion.id && saving.estado === opcion ? "Guardando…" : opcion}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {error && <p className="status-menu-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
