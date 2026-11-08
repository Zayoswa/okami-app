import { useState } from "react";
import { reservationStatuses } from "../data/reservationStatuses";
import "./StatusMenu.css";

// Botones para cambiar el estado de UNA sesión, a la vista (sin abrir menú).
// Se usan en "Sesiones por cerrar" del Dashboard y en el detalle de una sesión del Calendario.
// onChange(estado) guarda; si falla, el error aparece debajo de los botones.
// options: estados que se ofrecen (por defecto los tres).
export default function SessionStatusButtons({ sesion, onChange, options = reservationStatuses.map(({ estado }) => estado), label }) {
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  async function choose(estado) {
    if (saving || sesion.estado === estado) return;
    setSaving(estado);
    setError("");
    try {
      await onChange(estado);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cambiar el estado. Intenta nuevamente.");
    } finally {
      setSaving("");
    }
  }

  return (
    <div className="session-status-buttons">
      <div className="status-menu-options" role="group" aria-label={label ?? "Cambiar estado de la sesión"}>
        {options.map((estado) => {
          const active = sesion.estado === estado;
          return (
            <button type="button" key={estado} disabled={Boolean(saving)} aria-pressed={active}
              className={`status-menu-option ${estado.toLowerCase()}${active ? " status-menu-option-active" : ""}`}
              onClick={() => choose(estado)}>
              {saving === estado ? "Guardando…" : estado}
            </button>
          );
        })}
      </div>
      {error && <p className="status-menu-error" role="alert">{error}</p>}
    </div>
  );
}
