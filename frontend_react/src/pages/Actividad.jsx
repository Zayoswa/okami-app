import { useCallback, useEffect, useMemo, useState } from "react";
import { authRequest } from "../services/authService";
import LoadingScreen from "../components/LoadingScreen";
import useAutoRefresh from "../hooks/useAutoRefresh";
import { shiftDate, todayInSantiago } from "../utils/calendar";
import { formatFullDate } from "../utils/format";
import { actionTone, highlightParts } from "../utils/activityText";
import "./Actividad.css";

import Notice from "../components/Notice";
const CATEGORIAS = [
  { id: "reserva", label: "Reservas" },
  { id: "sesion", label: "Sesiones" },
  { id: "puesto", label: "Espacios" },
  { id: "tatuador", label: "Tatuadores" },
  { id: "arriendo", label: "Arriendos" },
];
const CATEGORY_LABEL = { reserva: "Reserva", sesion: "Sesión", puesto: "Espacio", tatuador: "Tatuador", arriendo: "Arriendo" };
// Texto con las palabras clave pintadas (acciones, estados, montos y la flecha de los cambios).
function Highlighted({ text }) {
  return highlightParts(text).map((part, index) => part.tone
    ? <span key={index} className={`kw kw--${part.tone}`}>{part.text}</span>
    : <span key={index}>{part.text}</span>);
}

const EMPTY_FILTERS = { categoria: "", actor: "", desde: "", hasta: "", q: "" };
const PAGE = 50;

const timeFormat = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// "Hoy", "Ayer" o "martes, 3 de noviembre de 2026".
function dayLabel(fecha, today) {
  if (fecha === today) return "Hoy";
  if (fecha === shiftDate(today, -1)) return "Ayer";
  const text = formatFullDate(fecha);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Detalle de un registro: la lista de cambios, las sesiones, o el antes y después.
function detailLines(detalle = {}) {
  if (Array.isArray(detalle.cambios) && detalle.cambios.length) return detalle.cambios;
  if (Array.isArray(detalle.sesiones) && detalle.sesiones.length) return detalle.sesiones.map((item) => `Sesión: ${item}`);
  const lines = [];
  if (detalle.antes !== undefined || detalle.despues !== undefined) lines.push(`Antes: ${detalle.antes ?? "—"} · Después: ${detalle.despues ?? "—"}`);
  if (detalle.nota) lines.push(`Nota: ${detalle.nota}`);
  return lines;
}

function buildQuery(filters, antes) {
  const params = new URLSearchParams({ limite: String(PAGE) });
  for (const [key, value] of Object.entries(filters)) if (String(value).trim()) params.set(key, String(value).trim());
  if (antes) params.set("antes", String(antes));
  return `/api/actividad?${params}`;
}

// Solo admin: lo que se hizo en el estudio (quién, qué y cuándo). El registro no se puede editar ni borrar.
export default function Actividad() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [search, setSearch] = useState("");
  const [registros, setRegistros] = useState([]);
  const [hayMas, setHayMas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [open, setOpen] = useState(() => new Set());
  const today = todayInSantiago();
  const hasFilters = Object.values(filters).some((value) => String(value).trim());

  // El texto se aplica al dejar de escribir (no en cada tecla).
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search })), 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    authRequest("/api/usuarios/").then(setUsuarios).catch(() => setUsuarios([]));
  }, []);

  const loadFirst = useCallback(async () => {
    const data = await authRequest(buildQuery(filters));
    setRegistros(data.registros);
    setHayMas(data.hayMas);
    setError("");
  }, [filters]);

  useEffect(() => {
    let active = true;
    authRequest(buildQuery(filters))
      .then((data) => { if (active) { setRegistros(data.registros); setHayMas(data.hayMas); setError(""); } })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filters]);

  // Las acciones nuevas aparecen solas (cada minuto y al volver a la pestaña), si no se pidieron más páginas.
  useAutoRefresh(loadFirst, { enabled: !loading && !loadingMore && registros.length <= PAGE });

  async function loadMore() {
    if (loadingMore || !registros.length) return;
    setLoadingMore(true);
    try {
      const data = await authRequest(buildQuery(filters, registros.at(-1).id));
      setRegistros((current) => [...current, ...data.registros]);
      setHayMas(data.hayMas);
    } catch (cause) {
      setError(cause.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function updateFilter(field, value) {
    setLoading(true);
    setOpen(new Set());
    setFilters((current) => ({ ...current, [field]: value }));
  }

  function clearFilters() {
    setLoading(true);
    setSearch("");
    setOpen(new Set());
    setFilters(EMPTY_FILTERS);
  }

  function toggle(id) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const grupos = useMemo(() => {
    const result = [];
    for (const registro of registros) {
      const last = result.at(-1);
      if (last?.fecha === registro.fecha_local) last.items.push(registro);
      else result.push({ fecha: registro.fecha_local, items: [registro] });
    }
    return result;
  }, [registros]);

  return (
    <section className="actividad-page">
      <p className="dashboard-label">ACTIVIDAD</p>
      <h1>Actividad del estudio</h1>
      <p className="dashboard-description">
        Todo lo que se hace en la app: quién lo hizo, qué cambió y cuándo. El registro no se puede editar ni borrar.
      </p>

      <div className="actividad-filters" role="search" aria-label="Filtros de actividad">
        <label className="actividad-filter-search">Buscar
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, tatuador, puesto…" maxLength={80} />
        </label>
        <label>Tipo
          <select value={filters.categoria} onChange={(event) => updateFilter("categoria", event.target.value)}>
            <option value="">Todo</option>
            {CATEGORIAS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <label>Persona
          <select value={filters.actor} onChange={(event) => updateFilter("actor", event.target.value)}>
            <option value="">Todas</option>
            {usuarios.map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.role === "admin" ? " (admin)" : ""}</option>)}
          </select>
        </label>
        <label>Desde
          <input type="date" value={filters.desde} max={filters.hasta || today} onChange={(event) => updateFilter("desde", event.target.value)} />
        </label>
        <label>Hasta
          <input type="date" value={filters.hasta} min={filters.desde || undefined} max={today} onChange={(event) => updateFilter("hasta", event.target.value)} />
        </label>
        <button type="button" className="reservation-button reservation-button-secondary" onClick={clearFilters} disabled={!hasFilters && !search}>Limpiar filtros</button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}

      {loading ? <LoadingScreen message="Cargando actividad…" /> : <>
        {grupos.length === 0 && !error && (
          <p className="empty-state">{hasFilters ? "No hay actividad que coincida con los filtros." : "Todavía no hay actividad registrada."}</p>
        )}
        {grupos.map((grupo) => (
          <section key={grupo.fecha} className="actividad-day" aria-label={dayLabel(grupo.fecha, today)}>
            <h2 className="actividad-day-title">{dayLabel(grupo.fecha, today)}</h2>
            <ol className="actividad-list">
              {grupo.items.map((registro) => {
                const lines = detailLines(registro.detalle);
                const expanded = open.has(registro.id);
                return (
                  <li key={registro.id} className={`actividad-item actividad-item--${registro.categoria} actividad-item--${actionTone(registro)}`}>
                    <time className="actividad-time" dateTime={registro.creado_en}>{timeFormat.format(new Date(registro.creado_en))}</time>
                    <div className="actividad-body">
                      <p className="actividad-meta">
                        <span className="actividad-category">{CATEGORY_LABEL[registro.categoria] ?? registro.categoria}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="actividad-actor">{registro.actor_nombre}</span>
                        {registro.actor_rol === "admin" && <span className="actividad-role"> · admin</span>}
                      </p>
                      <p className="actividad-text"><Highlighted text={registro.resumen} /></p>
                      {lines.length > 0 && (
                        <>
                          <button type="button" className="actividad-toggle" aria-expanded={expanded} aria-controls={`detalle-${registro.id}`} onClick={() => toggle(registro.id)}>
                            {expanded ? "Ocultar detalle" : `Ver detalle (${lines.length})`}
                          </button>
                          {expanded && (
                            <ul className="actividad-detail" id={`detalle-${registro.id}`}>
                              {lines.map((line, index) => <li key={index}><Highlighted text={line} /></li>)}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        {hayMas && (
          <div className="actividad-more">
            <button type="button" className="reservation-button reservation-button-secondary" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? "Cargando…" : "Cargar más"}
            </button>
          </div>
        )}
      </>}
    </section>
  );
}
