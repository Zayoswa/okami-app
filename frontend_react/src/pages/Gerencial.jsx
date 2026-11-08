import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useReservations from "../hooks/useReservations";
import { authRequest } from "../services/authService";
import { RENT_STATUS, formatMonth, formatMonthShort, monthOf, rentDetail, shiftMonth } from "../utils/arriendos";
import RentKpis from "../components/RentKpis";
import LoadingScreen from "../components/LoadingScreen";
import BarList from "../components/charts/BarList";
import ColumnChart from "../components/charts/ColumnChart";
import { DataTable, SessionList, SimpleLegend } from "../components/DashboardParts";
import { hoursLabel } from "../utils/chartLabels";
import { timeInSantiago, todayInSantiago } from "../utils/calendar";
import {
  artistRanking, averageTicket, hoursByPuesto, monthRange, monthSummary, rentByModality, sessionsToClose, upcomingSessions,
} from "../utils/dashboard";
import { formatPrice, formatPriceCompact } from "../utils/format";
import "./Gerencial.css";

import Notice from "../components/Notice";
const HISTORY_MONTHS = 6;

// Arriendo del mes y de los meses anteriores. Se vuelve a pedir al cambiar de mes o cuando cambian las
// sesiones (refreshKey), porque los turnos y días del Rotativo y Guest dependen de ellas.
function useRent(mes, refreshKey) {
  const [state, setState] = useState({ mes: null, data: null, history: null, error: "" });
  useEffect(() => {
    let active = true;
    Promise.all([
      authRequest(`/api/arriendos?mes=${encodeURIComponent(mes)}`),
      authRequest(`/api/arriendos/historial?hasta=${encodeURIComponent(mes)}&meses=${HISTORY_MONTHS}`),
    ])
      .then(([data, history]) => { if (active) setState({ mes, data, history, error: "" }); })
      .catch((cause) => { if (active) setState((current) => ({ ...current, error: cause.message })); });
    return () => { active = false; };
  }, [mes, refreshKey]);
  return state.mes === mes ? state : { ...state, data: null, history: null };
}

// Cobro de cada tatuador en el mes: barra de lo pagado frente a lo que debe, de mayor a menor saldo.
function RentByArtist({ filas }) {
  const ordered = [...filas].sort((a, b) => b.saldo - a.saldo || a.tatuador.localeCompare(b.tatuador, "es"));
  if (!ordered.length) return <p className="gerencial-empty">No hay tatuadores con arriendo este mes.</p>;
  return (
    <ul className="rent-artists">
      {ordered.map((fila) => {
        const status = RENT_STATUS[fila.estado] ?? RENT_STATUS.pendiente;
        const share = fila.cargo > 0 ? Math.min(100, (fila.pagado / fila.cargo) * 100) : 0;
        return (
          <li key={fila.tatuadorId}>
            <div className="rent-artists-head">
              <span className="rent-artists-name">{fila.tatuador}<small>{fila.modalidad ?? "Sin modalidad"} · {rentDetail(fila)}</small></span>
              <span className={`rent-status rent-status--${status.tone}`}>{status.label}</span>
            </div>
            <div className="rent-artists-bar" role="img" aria-label={`${fila.tatuador}: pagó ${formatPrice(fila.pagado)} de ${formatPrice(fila.cargo)}`}>
              <span style={{ width: `${share}%` }} />
            </div>
            <p className="rent-artists-amount">
              <strong>{formatPrice(fila.pagado)}</strong> / {formatPrice(fila.cargo)}
              {fila.saldo > 0 && <span className="rent-artists-due"> · debe {formatPrice(fila.saldo)}</span>}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

// Dashboard gerencial (solo admin). Lo principal es el arriendo que pagan los tatuadores, el ingreso del
// estudio; después la operación (sesiones por cerrar, próximas, uso de los puestos) y, al final, las ventas.
export default function Gerencial({ user }) {
  const { reservas, archivadas, sesiones, puestos, loading, error, reload, changeSessionStatus } = useReservations(user);
  // Para las ventas también cuentan las sesiones completadas de reservas borradas (historial).
  const conHistorial = useMemo(() => [...reservas, ...archivadas], [reservas, archivadas]);
  const today = todayInSantiago();
  const currentMonth = monthOf(today);
  const [mes, setMes] = useState(currentMonth);
  const { desde, hasta } = monthRange(mes);
  const rent = useRent(mes, reservas);

  const filas = useMemo(() => rent.data?.filas ?? [], [rent.data]);
  const conSaldo = filas.filter((fila) => fila.saldo > 0).length;
  const porModalidad = useMemo(() => rentByModality(filas), [filas]);
  const horas = useMemo(() => hoursByPuesto(sesiones, puestos, desde, hasta), [sesiones, puestos, desde, hasta]);
  const usados = horas.filter((item) => item.horas > 0);
  const sinUso = horas.filter((item) => item.horas === 0);
  const totalHoras = horas.reduce((sum, item) => sum + item.horas, 0);
  const hora = timeInSantiago();
  const porCerrar = useMemo(() => sessionsToClose(sesiones, today, hora), [sesiones, today, hora]);
  const proximas = useMemo(() => upcomingSessions(sesiones, today, hora, 7), [sesiones, today, hora]);
  const ventas = useMemo(() => monthSummary(conHistorial, mes), [conHistorial, mes]);
  const ticket = useMemo(() => averageTicket(reservas), [reservas]);
  const ranking = useMemo(() => artistRanking(conHistorial, desde, hasta, { desde, hasta }), [conHistorial, desde, hasta]);

  return (
    <section className="gerencial-page">
      <p className="dashboard-label">DASHBOARD</p>
      <h1>Dashboard gerencial</h1>
      <p className="dashboard-description">
        El arriendo que pagan los tatuadores según su modalidad es el ingreso principal del estudio.
      </p>

      {loading && <LoadingScreen message="Cargando métricas…" />}
      {error && <Notice tone="danger" action={<button type="button" className="reservation-button reservation-button-secondary" onClick={reload}>Reintentar</button>}>{error}</Notice>}

      {!loading && !error && <>
        {/* Filtro de período: una sola fila, arriba de todo lo que afecta */}
        <div className="gerencial-period" role="group" aria-label="Mes del dashboard">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setMes(shiftMonth(mes, -1))} aria-label="Mes anterior">‹</button>
          <p className="gerencial-period-label gerencial-period-label--month" aria-live="polite">{formatMonth(mes)}</p>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setMes(shiftMonth(mes, 1))} aria-label="Mes siguiente">›</button>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setMes(currentMonth)} disabled={mes === currentMonth}>Este mes</button>
        </div>

        <section className="gerencial-rent" aria-labelledby="gerencial-rent-title">
          <header className="gerencial-rent-header">
            <h2 id="gerencial-rent-title">Arriendo de {formatMonth(mes)}</h2>
          </header>
          {rent.error
            ? <p className="gerencial-empty">{rent.error}</p>
            : <RentKpis totales={rent.data?.totales ?? null} tatuadores={filas.length} conSaldo={conSaldo} pendingLink={`/arriendos?mes=${mes}`} />}
        </section>

        <div className="gerencial-grid">
          <article className="chart-card chart-card--wide">
            <header>
              <h2>Arriendo por mes</h2>
              <p>Últimos {HISTORY_MONTHS} meses hasta {formatMonth(mes)} · cobrado frente a lo estimado</p>
            </header>
            {rent.history ? <>
              <SimpleLegend items={[{ label: "Cobrado", className: "simple-legend-swatch--bar" }, { label: "Estimado", className: "simple-legend-swatch--target" }]} />
              <ColumnChart
                ariaLabel={`Arriendo cobrado y estimado de los últimos ${HISTORY_MONTHS} meses`}
                seriesLabel="Cobrado"
                targetLabel="estimado"
                format={formatPrice}
                formatAxis={formatPriceCompact}
                data={rent.history.map((item) => ({
                  key: item.periodo,
                  label: formatMonthShort(item.periodo),
                  tooltipLabel: formatMonth(item.periodo),
                  value: item.pagado,
                  target: item.cargo,
                  highlight: item.periodo === mes,
                }))}
              />
              <DataTable caption="Arriendo por mes" columns={["Mes", "Estimado", "Cobrado", "Pendiente"]}
                rows={rent.history.map((item) => [formatMonth(item.periodo), formatPrice(item.cargo), formatPrice(item.pagado), formatPrice(item.pendiente)])} />
            </> : !rent.error && <p className="gerencial-empty">Cargando…</p>}
          </article>

          <article className="chart-card">
            <header className="chart-card-header--link">
              <div>
                <h2>Cobro por tatuador</h2>
                <p>Lo pagado frente a lo que debe en el mes</p>
              </div>
              <Link to={`/arriendos?mes=${mes}`} className="gerencial-rent-link">Ver arriendos</Link>
            </header>
            {rent.data ? <RentByArtist filas={filas} /> : !rent.error && <p className="gerencial-empty">Cargando…</p>}
          </article>

          <article className="chart-card">
            <header>
              <h2>Arriendo por modalidad</h2>
              <p>Estimado del mes según la modalidad de cada tatuador</p>
            </header>
            {porModalidad.some((item) => item.cargo > 0) ? <>
              <BarList ariaLabel="Arriendo estimado por modalidad" format={formatPrice}
                data={porModalidad.filter((item) => item.cargo > 0).map((item) => ({
                  key: item.modalidad, label: `${item.modalidad} (${item.tatuadores})`, value: item.cargo,
                }))} />
              <DataTable caption="Arriendo por modalidad" columns={["Modalidad", "Tatuadores", "Estimado", "Cobrado"]}
                rows={porModalidad.map((item) => [item.modalidad, item.tatuadores, formatPrice(item.cargo), formatPrice(item.pagado)])} />
            </> : <p className="gerencial-empty">{rent.data ? "No hay arriendo estimado este mes." : "Cargando…"}</p>}
          </article>

          <article className="chart-card">
            <header>
              <h2>Uso de los puestos</h2>
              <p>Horas agendadas en {formatMonth(mes)} · {hoursLabel(totalHoras)} en total</p>
            </header>
            {usados.length
              ? <BarList ariaLabel="Horas agendadas por puesto en el mes" format={hoursLabel}
                data={usados.map((item) => ({ key: item.id, label: item.nombre, value: item.horas }))} />
              : <p className="gerencial-empty">No hay sesiones agendadas en este mes.</p>}
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
            <SessionList items={porCerrar} empty="Todas las sesiones pasadas están cerradas."
              onClose={(item, estado) => changeSessionStatus(item.reservaId, item.id, estado)} />
          </article>

          <article className="chart-card">
            <header>
              <h2>Próximas sesiones</h2>
              <p>Programadas para los próximos 7 días</p>
            </header>
            <SessionList items={proximas} empty="No hay sesiones programadas en los próximos 7 días." />
          </article>
        </div>

        {/* Ventas: referencia, al final y compacto. Cada tatuador ve las suyas en detalle en "Mi panel". */}
        <section className="gerencial-sales" aria-labelledby="gerencial-sales-title">
          <h2 id="gerencial-sales-title" className="gerencial-section-title">Ventas de los tatuadores <span>(referencia)</span></h2>
          <div className="gerencial-sales-grid">
            <div className="gerencial-sales-kpis">
              <article className="kpi kpi--compact">
                <p className="kpi-label">Vendido en {formatMonth(mes)}</p>
                <p className="kpi-value">{formatPrice(ventas.ganancias)}</p>
                <p className="kpi-delta">{ventas.completadas} sesiones completadas</p>
              </article>
              <article className="kpi kpi--compact">
                <p className="kpi-label">Por realizar en el mes</p>
                <p className="kpi-value">{formatPrice(ventas.porCobrar)}</p>
                <p className="kpi-delta">{ventas.programadas} sesiones programadas</p>
              </article>
              <article className="kpi kpi--compact">
                <p className="kpi-label">Ticket promedio</p>
                <p className="kpi-value">{formatPrice(ticket)}</p>
                <p className="kpi-delta">Precio medio por reserva</p>
              </article>
            </div>
            <article className="chart-card">
              <header>
                <h2>Ventas por tatuador</h2>
                <p>Sesiones completadas en {formatMonth(mes)}</p>
              </header>
              {ranking.some((item) => item.ganancias > 0) ? (
                <div className="ranking-scroll">
                  <table className="ranking-table ranking-table--compact">
                    <thead>
                      <tr>
                        <th scope="col">Tatuador</th>
                        <th scope="col" className="ranking-num">Vendido</th>
                        <th scope="col" className="ranking-num">Sesiones</th>
                        <th scope="col" className="ranking-num">Promedio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.filter((item) => item.ganancias > 0).map((item) => (
                        <tr key={item.id}>
                          <td><span className="ranking-name">{item.nombre}</span></td>
                          <td className="ranking-num ranking-strong">{formatPrice(item.ganancias)}</td>
                          <td className="ranking-num">{item.sesiones}</td>
                          <td className="ranking-num">{formatPrice(item.promedioSesion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="gerencial-empty">No hay sesiones completadas en este mes.</p>}
            </article>
          </div>
        </section>
      </>}
    </section>
  );
}
