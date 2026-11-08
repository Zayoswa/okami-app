import { useMemo, useState } from "react";
import useReservations from "../hooks/useReservations";
import LoadingScreen from "../components/LoadingScreen";
import BarList from "../components/charts/BarList";
import ColumnChart from "../components/charts/ColumnChart";
import DonutChart from "../components/charts/DonutChart";
import { shiftDate, timeInSantiago, todayInSantiago, weekDays, weekLabel } from "../utils/calendar";
import {
  averageTicket, hoursByPuesto, percentChange, revenueByWeek, sessionsToClose, statusCounts,
  upcomingSessions, weekStart, weekSummary,
} from "../utils/dashboard";
import { formatDayMonth, formatPrice, formatPriceCompact, formatShortWeekdayDate } from "../utils/format";
import "./Gerencial.css";

// Colores de los estados en los gráficos (validados para daltonismo; ver index.css).
const STATUS_COLORS = {
  Completada: "var(--chart-completada)",
  Programada: "var(--chart-programada)",
  Cancelada: "var(--chart-cancelada)",
};
const STATUS_LABELS = { Completada: "Completadas", Programada: "Programadas", Cancelada: "Canceladas" };

const hoursLabel = (value) => `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")} h`;

function Delta({ actual, anterior }) {
  const change = percentChange(actual, anterior);
  if (change === null) return <p className="kpi-delta">Sin ganancias la semana anterior</p>;
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "●";
  return <p className={`kpi-delta kpi-delta--${tone}`}><span aria-hidden="true">{arrow}</span> {change > 0 ? "+" : ""}{change}% vs. semana anterior</p>;
}

// Tabla con los mismos datos del gráfico: los valores nunca dependen solo del color o del tooltip.
function DataTable({ caption, columns, rows }) {
  return (
    <details className="chart-table">
      <summary>Ver datos</summary>
      <table>
        <caption className="visually-hidden">{caption}</caption>
        <thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead>
        <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </details>
  );
}

function SessionList({ items, empty }) {
  if (!items.length) return <p className="gerencial-empty">{empty}</p>;
  return (
    <ul className="gerencial-sessions">
      {items.slice(0, 6).map((item) => (
        <li key={item.id}>
          <span className="gerencial-sessions-when">{formatShortWeekdayDate(item.fecha)} · {item.horaInicio}</span>
          <span className="gerencial-sessions-who">{item.cliente ?? "Cliente"} · {item.tatuador}</span>
          <span className="gerencial-sessions-where">{item.puesto}</span>
        </li>
      ))}
      {items.length > 6 && <li className="gerencial-sessions-more">y {items.length - 6} más</li>}
    </ul>
  );
}

// Dashboard gerencial (solo admin): ganancias, estado de las reservas y uso de los puestos.
export default function Gerencial({ user }) {
  const { reservas, sesiones, puestos, loading, error, reload } = useReservations(user);
  const today = todayInSantiago();
  const [lunes, setLunes] = useState(() => weekStart(today));
  const domingo = shiftDate(lunes, 6);
  const isCurrentWeek = lunes === weekStart(today);

  const semana = useMemo(() => weekSummary(reservas, lunes), [reservas, lunes]);
  const anterior = useMemo(() => weekSummary(reservas, shiftDate(lunes, -7)), [reservas, lunes]);
  const semanas = useMemo(() => revenueByWeek(reservas, lunes, 12), [reservas, lunes]);
  const estados = useMemo(() => statusCounts(reservas), [reservas]);
  const horas = useMemo(() => hoursByPuesto(sesiones, puestos, lunes, domingo), [sesiones, puestos, lunes, domingo]);
  const ticket = useMemo(() => averageTicket(reservas), [reservas]);
  const hora = timeInSantiago();
  const porCerrar = useMemo(() => sessionsToClose(sesiones, today, hora), [sesiones, today, hora]);
  const proximas = useMemo(() => upcomingSessions(sesiones, today, hora, 7), [sesiones, today, hora]);
  const totalHoras = horas.reduce((sum, item) => sum + item.horas, 0);
  const usados = horas.filter((item) => item.horas > 0);
  const sinUso = horas.filter((item) => item.horas === 0);

  return (
    <section className="gerencial-page">
      <p className="dashboard-label">DASHBOARD</p>
      <h1>Dashboard gerencial</h1>
      <p className="dashboard-description">
        Las ganancias cuentan las sesiones <strong>completadas</strong>: el precio de cada reserva se reparte en partes iguales entre sus sesiones no canceladas.
      </p>

      {loading && <LoadingScreen message="Cargando métricas…" />}
      {error && <div role="alert"><p>{error}</p><button type="button" className="reservation-button" onClick={reload}>Reintentar</button></div>}

      {!loading && !error && <>
        {/* Filtro de período: una sola fila, arriba de todo lo que afecta */}
        <div className="gerencial-period" role="group" aria-label="Semana del dashboard">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setLunes(shiftDate(lunes, -7))} aria-label="Semana anterior">‹</button>
          <p className="gerencial-period-label" aria-live="polite">Semana del {weekLabel(weekDays(lunes))}</p>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setLunes(shiftDate(lunes, 7))} aria-label="Semana siguiente">›</button>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setLunes(weekStart(today))} disabled={isCurrentWeek}>Esta semana</button>
        </div>

        <section className="gerencial-kpis" aria-label="Indicadores de la semana">
          <article className="kpi kpi--hero">
            <p className="kpi-label">Ganancias de la semana</p>
            <p className="kpi-value">{formatPrice(semana.ganancias)}</p>
            <Delta actual={semana.ganancias} anterior={anterior.ganancias} />
          </article>
          <article className="kpi">
            <p className="kpi-label">Por cobrar esta semana</p>
            <p className="kpi-value">{formatPrice(semana.porCobrar)}</p>
            <p className="kpi-delta">{semana.programadas} {semana.programadas === 1 ? "sesión programada" : "sesiones programadas"}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Sesiones de la semana</p>
            <p className="kpi-value">{semana.completadas + semana.programadas}</p>
            <p className="kpi-delta">{semana.completadas} completadas · {semana.canceladas} canceladas</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Ticket promedio</p>
            <p className="kpi-value">{formatPrice(ticket)}</p>
            <p className="kpi-delta">Precio medio por reserva</p>
          </article>
        </section>

        <div className="gerencial-grid">
          <article className="chart-card chart-card--wide">
            <header>
              <h2>Ganancias por semana</h2>
              <p>Últimas 12 semanas hasta la seleccionada · sesiones completadas</p>
            </header>
            <ColumnChart
              ariaLabel="Ganancias por semana de las últimas 12 semanas"
              seriesLabel="Ganancias (sesiones completadas)"
              format={formatPrice}
              formatAxis={formatPriceCompact}
              data={semanas.map((item) => ({
                key: item.inicio,
                label: formatDayMonth(item.inicio),
                tooltipLabel: `Semana del ${formatDayMonth(item.inicio)}`,
                value: item.ganancias,
                highlight: item.inicio === lunes,
              }))}
            />
            <DataTable caption="Ganancias por semana" columns={["Semana", "Ganancias", "Por cobrar"]}
              rows={semanas.map((item) => [`Desde ${formatDayMonth(item.inicio)}`, formatPrice(item.ganancias), formatPrice(item.porCobrar)])} />
          </article>

          <article className="chart-card">
            <header>
              <h2>Reservas por estado</h2>
              <p>Todas las reservas registradas</p>
            </header>
            <DonutChart
              ariaLabel="Reservas por estado"
              centerLabel="reservas"
              data={estados.map(({ estado, total }) => ({ label: STATUS_LABELS[estado], value: total, color: STATUS_COLORS[estado] }))}
            />
            <DataTable caption="Reservas por estado" columns={["Estado", "Reservas"]}
              rows={estados.map(({ estado, total }) => [STATUS_LABELS[estado], total])} />
          </article>

          <article className="chart-card">
            <header>
              <h2>Horas agendadas por puesto</h2>
              <p>Semana seleccionada · {hoursLabel(totalHoras)} en total</p>
            </header>
            {usados.length
              ? <BarList ariaLabel="Horas agendadas por puesto en la semana" format={hoursLabel}
                data={usados.map((item) => ({ key: item.id, label: item.nombre, value: item.horas }))} />
              : <p className="gerencial-empty">No hay sesiones agendadas en esta semana.</p>}
            {sinUso.length > 0 && (
              <p className="gerencial-note">
                Sin sesiones: {sinUso.map((item) => item.nombre.replace("Puesto ", "")).join(", ")} ({sinUso.length} {sinUso.length === 1 ? "puesto" : "puestos"})
              </p>
            )}
          </article>

          <article className="chart-card">
            <header>
              <h2>Sesiones por cerrar</h2>
              <p>Ya terminaron y siguen como Programadas</p>
            </header>
            <p className={`gerencial-count${porCerrar.length ? " gerencial-count--alert" : ""}`}>{porCerrar.length}</p>
            <SessionList items={porCerrar} empty="Todas las sesiones pasadas están cerradas." />
          </article>

          <article className="chart-card">
            <header>
              <h2>Próximas sesiones</h2>
              <p>Programadas para los próximos 7 días</p>
            </header>
            <SessionList items={proximas} empty="No hay sesiones programadas en los próximos 7 días." />
          </article>
        </div>
      </>}
    </section>
  );
}
