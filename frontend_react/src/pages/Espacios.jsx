import { useEffect, useMemo, useState } from "react";
import { authRequest } from "../services/authService";
import { reservationsRepository } from "../services/reservationsRepository";
import LoadingScreen from "../components/LoadingScreen";
import { flattenSessions, isArchived } from "../utils/sessions";
import { todayInSantiago, timeInSantiago } from "../utils/calendar";
import { PUESTO_TIPOS, maxTitulares, puestoNumber, puestoOccupancy, upcomingSessions } from "../utils/puestos";
import { formatShortWeekdayDate } from "../utils/format";
import PuestoTipoBadge from "../components/PuestoTipoBadge";
import useConfirm from "../hooks/useConfirm";
import useAutoRefresh from "../hooks/useAutoRefresh";
import "./Espacios.css";

import Notice from "../components/Notice";
const isHabilitado = (estado) => String(estado ?? "").trim().toLowerCase() === "habilitado";

// Lista de sesiones para los avisos: "mié 18-11 · 10:00–13:00 · Jaimito". Muestra hasta 5.
function sessionItems(sesiones, withArtist) {
  const items = sesiones.slice(0, 5).map((item) =>
    `${formatShortWeekdayDate(item.fecha)} · ${item.horaInicio}–${item.horaFin}${withArtist ? ` · ${item.tatuador}` : ""}`);
  if (sesiones.length > 5) items.push(`y ${sesiones.length - 5} más`);
  return items;
}

const sessionCount = (total) => `${total} ${total === 1 ? "sesión agendada" : "sesiones agendadas"}`;

// Solo admin: estado de cada espacio y quién lo está usando en este momento,
// para no pasar a Mantenimiento un espacio con una sesión en curso sin saberlo.
export default function Espacios({ user }) {
  const [puestos, setPuestos] = useState([]);
  const [estados, setEstados] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [tatuadores, setTatuadores] = useState([]);
  const [occupancyError, setOccupancyError] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [confirm, confirmModal] = useConfirm();

  async function load() {
    const [rows, states, catalogs] = await Promise.all([
      authRequest("/api/puestos"), authRequest("/api/puestos/estados"), reservationsRepository.catalogs(),
    ]);
    setPuestos(rows);
    setEstados(states);
    setTatuadores(catalogs.tatuadores ?? []);
    // Si fallan las reservas, los espacios se siguen mostrando; solo falta la ocupación.
    try {
      // Las reservas del historial (borradas) no ocupan puestos.
      setSesiones(flattenSessions((await reservationsRepository.list(user)).filter((reserva) => !isArchived(reserva))));
      setOccupancyError("");
    } catch {
      setOccupancyError("No se pudo cargar la ocupación actual de los espacios.");
    }
  }

  useEffect(() => {
    Promise.resolve().then(load).catch((cause) => setError(cause.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recarga en segundo plano cada minuto y al volver a la pestaña (pausada mientras se guarda un cambio).
  useAutoRefresh(load, { enabled: !loading && !savingId });

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

  // Tatuadores activos que todavía no son titulares de ningún puesto (cada uno tiene como máximo uno).
  const libres = useMemo(() => {
    const ocupados = new Set(puestos.flatMap((puesto) => (puesto.titulares ?? []).map((titular) => String(titular.id))));
    return tatuadores.filter((tatuador) => !ocupados.has(String(tatuador.id)));
  }, [puestos, tatuadores]);

  // Guarda un cambio y recarga el listado; el mensaje de error viene del servidor (cupo, titular repetido, etc.).
  // Devuelve true si el cambio se guardó.
  async function run(puestoId, request, success) {
    if (savingId) return false;
    setSavingId(puestoId); setError(""); setMessage("");
    try {
      await request();
      setMessage(success);
      try { await load(); } catch { setError("El cambio se guardó, pero no se pudo actualizar el listado. Recarga la página."); }
      return true;
    } catch (cause) {
      setError(cause.message);
      return false;
    } finally {
      setSavingId("");
    }
  }

  const puestoPath = (puesto) => `/api/puestos/${encodeURIComponent(puesto.id)}`;

  // Sesiones del puesto que aún no terminan, calculadas al momento de confirmar. null si no se cargaron las reservas.
  const pendingSessions = (puesto) => occupancyError
    ? null
    : upcomingSessions(sesiones, puesto.id, todayInSantiago(), timeInSantiago());

  async function changeType(puesto, tipo) {
    const titulares = puesto.titulares ?? [];
    if (titulares.length > maxTitulares(tipo)) {
      setMessage("");
      setError(`${puesto.nombre} tiene ${titulares.length} titular(es) y un puesto ${tipo} admite ${maxTitulares(tipo)}. Quita titulares antes de cambiar el tipo.`);
      return;
    }
    // Al pasar de un puesto abierto a Full/Compartido (solo titulares) o a Guest (solo tatuadores Guest),
    // avisa de las sesiones ya agendadas que no cumplirían la regla nueva.
    const restringe = (maxTitulares(puesto.tipo) === 0 && maxTitulares(tipo) > 0) || (tipo === "Guest" && puesto.tipo !== "Guest");
    if (restringe) {
      const ids = new Set(titulares.map((titular) => String(titular.id)));
      const modalidades = new Map(tatuadores.map((item) => [String(item.id), String(item.modalidad ?? "").toLowerCase()]));
      const cumple = (item) => tipo === "Guest" ? modalidades.get(String(item.tatuadorId)) === "guest" : ids.has(String(item.tatuadorId));
      const ajenas = pendingSessions(puesto)?.filter((item) => !cumple(item)) ?? null;
      if (ajenas === null || ajenas.length) {
        const ok = await confirm(ajenas === null ? {
          title: `Cambiar ${puesto.nombre} a ${tipo}`,
          message: `No se pudo comprobar si ${puesto.nombre} tiene sesiones agendadas.`,
          question: `¿Cambiarlo a ${tipo} de todos modos?`,
          confirmLabel: `Cambiar a ${tipo}`,
        } : {
          title: `Cambiar ${puesto.nombre} a ${tipo}`,
          message: `${puesto.nombre} tiene ${sessionCount(ajenas.length)} de tatuadores que no son ${tipo === "Guest" ? "Guest" : "sus titulares"}:`,
          items: sessionItems(ajenas, true),
          note: `Si lo cambias a ${tipo}, esas sesiones se mantienen en este puesto, pero no se podrán agendar sesiones nuevas de esos tatuadores. Puedes moverlas a otro puesto desde Reservas.`,
          question: "¿Cambiar el tipo de todos modos?",
          confirmLabel: `Cambiar a ${tipo}`,
        });
        if (!ok) return;
      }
    }
    run(puesto.id, () => authRequest(puestoPath(puesto), { method: "PATCH", body: JSON.stringify({ tipo }) }),
      `${puesto.nombre} ahora es ${tipo}.`);
  }

  function addTitular(puesto, tatuadorId) {
    if (!tatuadorId) return;
    const nombre = tatuadores.find((item) => String(item.id) === String(tatuadorId))?.nombre ?? "El tatuador";
    run(puesto.id, () => authRequest(`${puestoPath(puesto)}/titulares`, { method: "POST", body: JSON.stringify({ tatuadorId }) }),
      `${nombre} es titular de ${puesto.nombre}.`);
  }

  async function removeTitular(puesto, titular) {
    const propias = pendingSessions(puesto)?.filter((item) => String(item.tatuadorId) === String(titular.id)) ?? null;
    const base = {
      title: "Quitar titular",
      question: `¿Quitar a ${titular.nombre} como titular de ${puesto.nombre}?`,
      confirmLabel: "Quitar titular",
      tone: "danger",
    };
    const ok = await confirm(propias === null
      ? { ...base, message: `No se pudo comprobar si ${titular.nombre} tiene sesiones agendadas en ${puesto.nombre}.` }
      : propias.length
        ? {
          ...base,
          message: `${titular.nombre} tiene ${sessionCount(propias.length)} en ${puesto.nombre}:`,
          items: sessionItems(propias, false),
          note: "Si lo quitas como titular, esas sesiones se mantienen en este puesto. Puedes moverlas a otro puesto desde Reservas.",
        }
        : base);
    if (!ok) return;
    run(puesto.id, () => authRequest(`${puestoPath(puesto)}/titulares/${encodeURIComponent(titular.id)}`, { method: "DELETE" }),
      `${titular.nombre} ya no es titular de ${puesto.nombre}.`);
  }

  async function changeState({ puesto, actual }, estadoId) {
    if (savingId) return;
    const estado = estados.find((item) => String(item.id) === String(estadoId))?.estado ?? "";
    if (actual && !isHabilitado(estado)) {
      const ok = await confirm({
        title: `Cambiar ${puesto.nombre} a ${estado}`,
        message: `${puesto.nombre} está ocupado ahora por ${actual.tatuador} hasta las ${actual.horaFin}.`,
        note: "La sesión en curso se conserva, pero no se podrán agendar sesiones nuevas.",
        question: `¿Cambiar a ${estado} de todos modos?`,
        confirmLabel: `Cambiar a ${estado}`,
      });
      if (!ok) return;
    }
    await run(puesto.id, () => authRequest(puestoPath(puesto), { method: "PATCH", body: JSON.stringify({ estadoId: Number(estadoId) }) }),
      `${puesto.nombre} quedó en estado ${estado}.`);
  }

  return (
    <section className="espacios-page">
      <h1>Espacios</h1>
      <p className="dashboard-description">
        Cambia el estado de cada espacio. Uno que no está Habilitado no acepta sesiones nuevas; las sesiones ya agendadas se conservan y se pueden completar o cancelar.
      </p>
      <p className="espacios-tipos">
        {PUESTO_TIPOS.map((tipo) => <span key={tipo.id}><strong>{tipo.id}</strong>: {tipo.descripcion}</span>)}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="ok">{message}</Notice>}

      {loading ? <LoadingScreen message="Cargando espacios…" /> : <>
        <ul className="espacios-summary" aria-label="Resumen de espacios">
          <li>{items.length} espacios</li>
          <li className="espacios-summary-ok">{habilitados} habilitados</li>
          <li className="espacios-summary-off">{items.length - habilitados} no disponibles</li>
          <li className="espacios-summary-busy">{ocupados} ocupados ahora</li>
        </ul>
        {occupancyError && <Notice tone="warning">{occupancyError}</Notice>}

        <ul className="espacios-grid">
          {items.map((item) => {
            const { puesto, actual, proxima } = item;
            const titulares = puesto.titulares ?? [];
            const cupo = maxTitulares(puesto.tipo) - titulares.length;
            return (
              <li key={puesto.id} className={`espacio-card puesto-numero-fondo puesto-numero-fondo--arriba${puesto.disponible ? "" : " espacio-card-off"}`} data-numero={puestoNumber(puesto.nombre)}>
                <div className="espacio-card-header">
                  <h2>{puesto.nombre}</h2>
                  <PuestoTipoBadge tipo={puesto.tipo} />
                </div>
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

                <div className="espacio-titulares">
                  <p className="espacio-titulares-label">Titulares</p>
                  {maxTitulares(puesto.tipo) === 0 ? (
                    <p className="espacio-titulares-empty">
                      {puesto.tipo === "Guest" ? "Sin titulares: solo lo agendan tatuadores Guest." : "Sin titulares: lo usa quien lo agende."}
                    </p>
                  ) : (
                    <>
                      {titulares.length ? (
                        <ul className="espacio-chips">
                          {titulares.map((titular) => (
                            <li key={titular.id} className="espacio-chip">
                              {titular.nombre}
                              <button type="button" disabled={Boolean(savingId)} onClick={() => removeTitular(puesto, titular)}
                                aria-label={`Quitar a ${titular.nombre} de ${puesto.nombre}`}>×</button>
                            </li>
                          ))}
                        </ul>
                      ) : <p className="espacio-titulares-empty">Sin titular asignado.</p>}
                      {cupo > 0 && (() => {
                        // Solo tatuadores sin puesto cuya modalidad coincide con el tipo (Full o Compartido).
                        const candidatos = libres.filter((tatuador) => (tatuador.modalidad ?? "").toLowerCase() === puesto.tipo.toLowerCase());
                        return (
                          <select value="" disabled={Boolean(savingId) || !candidatos.length} onChange={(event) => addTitular(puesto, event.target.value)}
                            aria-label={`Agregar titular a ${puesto.nombre}`}>
                            <option value="">{candidatos.length ? "+ Agregar titular" : `No hay tatuadores ${puesto.tipo} sin puesto`}</option>
                            {candidatos.map((tatuador) => <option key={tatuador.id} value={tatuador.id}>{tatuador.nombre}</option>)}
                          </select>
                        );
                      })()}
                    </>
                  )}
                </div>

                <label className="espacio-card-state espacio-card-type">Tipo
                  <select value={puesto.tipo} disabled={Boolean(savingId)} onChange={(event) => changeType(puesto, event.target.value)} aria-label={`Tipo de ${puesto.nombre}`}>
                    {PUESTO_TIPOS.map((tipo) => <option key={tipo.id} value={tipo.id}>{tipo.id}</option>)}
                  </select>
                </label>

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
      {confirmModal}
    </section>
  );
}
