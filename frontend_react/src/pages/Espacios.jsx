import { useEffect, useMemo, useState } from "react";
import { authRequest } from "../services/authService";
import { reservationsRepository } from "../services/reservationsRepository";
import LoadingScreen from "../components/LoadingScreen";
import { flattenSessions } from "../utils/sessions";
import { todayInSantiago, timeInSantiago } from "../utils/calendar";
import { puestoNumber, puestoOccupancy } from "../utils/puestos";
import "./Espacios.css";

const isHabilitado = (estado) => String(estado ?? "").trim().toLowerCase() === "habilitado";

// Solo admin: estado de cada espacio y quién lo está usando en este momento,
// para no pasar a Mantenimiento un espacio con una sesión en curso sin saberlo.
export default function Espacios({ user }) {
  const [puestos, setPuestos] = useState([]);
  const [estados, setEstados] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [occupancyError, setOccupancyError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => new Date());

  async function load() {
    const [rows, states] = await Promise.all([authRequest("/api/puestos"), authRequest("/api/puestos/estados")]);
    setPuestos(rows);
    setEstados(states);
    // Si fallan las reservas, los espacios se siguen mostrando; solo falta la ocupación.
    try {
      setSesiones(flattenSessions(await reservationsRepository.list(user)));
      setOccupancyError("");
    } catch {
      setOccupancyError("No se pudo cargar la ocupación actual de los espacios.");
    }
  }

  useEffect(() => {
    Promise.resolve().then(load).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Actualiza "ahora" cada minuto para que la ocupación no quede desfasada.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const fecha = todayInSantiago(now);
  const hora = timeInSantiago(now);
  const items = useMemo(
    () => puestos.map((puesto) => ({ puesto, ...puestoOccupancy(sesiones, puesto.id, fecha, hora) })),
    [puestos, sesiones, fecha, hora],
  );
  const habilitados = items.filter(({ puesto }) => puesto.disponible).length;
  const ocupados = items.filter(({ actual }) => actual).length;

  async function changeState({ puesto, actual }, estadoId) {
    if (savingId) return;
    const estado = estados.find((item) => String(item.id) === String(estadoId))?.estado ?? "";
    if (actual && !isHabilitado(estado)) {
      const ok = window.confirm(
        `${puesto.nombre} está ocupado ahora por ${actual.tatuador} hasta las ${actual.horaFin}.\n` +
        `La sesión en curso se conserva, pero no se podrán agendar sesiones nuevas.\n\n¿Cambiar a ${estado} de todos modos?`,
      );
      if (!ok) return;
    }
    setSavingId(puesto.id); setError(""); setMessage("");
    try {
      await authRequest(`/api/puestos/${encodeURIComponent(puesto.id)}`, { method: "PATCH", body: JSON.stringify({ estadoId: Number(estadoId) }) });
      setMessage(`${puesto.nombre} quedó en estado ${estado}.`);
      try { await load(); } catch { setError("El estado cambió, pero no se pudo actualizar el listado. Recarga la página."); }
    } catch (cause) {
      setError(cause.message);
    } finally {
      setSavingId("");
    }
  }

  return (
    <section className="espacios-page">
      <p className="dashboard-label">ESPACIOS</p>
      <h1>Espacios</h1>
      <p className="dashboard-description">
        Cambia el estado de cada espacio. Uno que no está Habilitado no acepta sesiones nuevas; las sesiones ya agendadas se conservan y se pueden completar o cancelar.
      </p>
      {error && <p className="espacios-alert" role="alert">{error}</p>}
      {message && <p className="reservation-success" role="status">{message}</p>}

      {loading ? <LoadingScreen message="Cargando espacios…" /> : <>
        <ul className="espacios-summary" aria-label="Resumen de espacios">
          <li>{items.length} espacios</li>
          <li className="espacios-summary-ok">{habilitados} habilitados</li>
          <li className="espacios-summary-off">{items.length - habilitados} no disponibles</li>
          <li className="espacios-summary-busy">{ocupados} ocupados ahora</li>
        </ul>
        {occupancyError && <p className="espacios-alert" role="alert">{occupancyError}</p>}

        <ul className="espacios-grid">
          {items.map((item) => {
            const { puesto, actual, proxima } = item;
            return (
              <li key={puesto.id} className={`espacio-card puesto-numero-fondo puesto-numero-fondo--arriba${puesto.disponible ? "" : " espacio-card-off"}`} data-numero={puestoNumber(puesto.nombre)}>
                <h2>{puesto.nombre}</h2>
                <p className="espacio-card-availability">{puesto.disponible ? "Disponible para agendar" : "No acepta sesiones nuevas"}</p>

                {actual ? (
                  <p className="espacio-occupancy espacio-occupancy-busy">
                    <strong>Ocupado ahora</strong>
                    <span>{actual.tatuador} · hasta las {actual.horaFin}</span>
                  </p>
                ) : (
                  <p className="espacio-occupancy">
                    <strong>Libre ahora</strong>
                    <span>{proxima ? `Próxima: ${proxima.horaInicio} · ${proxima.tatuador}` : "Sin más sesiones hoy"}</span>
                  </p>
                )}

                <label className="espacio-card-state">Estado
                  <select value={puesto.estadoId ?? ""} disabled={Boolean(savingId)} onChange={(event) => changeState(item, event.target.value)} aria-label={`Estado de ${puesto.nombre}`}>
                    {estados.map((estado) => <option key={estado.id} value={estado.id}>{estado.estado}</option>)}
                  </select>
                </label>
              </li>
            );
          })}
        </ul>
      </>}
    </section>
  );
}
