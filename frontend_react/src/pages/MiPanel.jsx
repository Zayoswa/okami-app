import { useEffect, useMemo, useState } from "react";
import useReservations from "../hooks/useReservations";
import { authRequest } from "../services/authService";
import LoadingScreen from "../components/LoadingScreen";
import ColumnChart from "../components/charts/ColumnChart";
import DonutChart from "../components/charts/DonutChart";
import { DataTable, Delta, SessionList } from "../components/DashboardParts";
import { RENT_STATUS, formatMonth, formatMonthShort, monthOf, rentDetail, shiftMonth } from "../utils/arriendos";
import { STATUS_COLORS, STATUS_LABELS } from "../utils/chartLabels";
import { timeInSantiago, todayInSantiago } from "../utils/calendar";
import { monthSummary, revenueByMonth, sessionsToClose, statusCounts, upcomingSessions } from "../utils/dashboard";
import { formatPrice, formatPriceCompact } from "../utils/format";
import "./Gerencial.css";

const HISTORY_MONTHS = 6;

// Arriendo del propio tatuador en el mes (solo lectura). null mientras carga.
function useMyRent(mes, refreshKey) {
  const [state, setState] = useState({ mes: null, arriendo: null, error: "" });
  useEffect(() => {
    let active = true;
    authRequest(`/api/arriendos/mio?mes=${encodeURIComponent(mes)}`)
      .then((data) => { if (active) setState({ mes, arriendo: data.arriendo, error: "" }); })
      .catch((cause) => { if (active) setState({ mes, arriendo: null, error: cause.message }); });
    return () => { active = false; };
  }, [mes, refreshKey]);
  return state.mes === mes ? state : { mes, arriendo: undefined, error: "" };
}

// "Mi panel" (solo tatuador): sus ganancias, sesiones, reservas y su arriendo del mes.
export default function MiPanel({ user }) {
  const { reservas, archivadas, sesiones, loading, error, reload, changeSessionStatus } = useReservations(user);
  const propias = useMemo(() => reservas.filter((reserva) => reserva.tatuadorId === user.id), [reservas, user.id]);
  // Las sesiones completadas de reservas borradas también son ganancias suyas.
  const conHistorial = useMemo(() => [...propias, ...archivadas.filter((reserva) => reserva.tatuadorId === user.id)], [propias, archivadas, user.id]);
  const misSesiones = useMemo(() => sesiones.filter((sesion) => sesion.tatuadorId === user.id), [sesiones, user.id]);
  const today = todayInSantiago();
  const currentMonth = monthOf(today);
  const [mes, setMes] = useState(currentMonth);
  const { arriendo, error: rentError } = useMyRent(mes, reservas);

  const resumen = useMemo(() => monthSummary(conHistorial, mes), [conHistorial, mes]);
  const anterior = useMemo(() => monthSummary(conHistorial, shiftMonth(mes, -1)), [conHistorial, mes]);
  const meses = useMemo(() => revenueByMonth(conHistorial, mes, HISTORY_MONTHS), [conHistorial, mes]);
  const estados = useMemo(() => statusCounts(propias), [propias]);
  const hora = timeInSantiago();
  const porCerrar = useMemo(() => sessionsToClose(misSesiones, today, hora), [misSesiones, today, hora]);
  const proximas = useMemo(() => upcomingSessions(misSesiones, today, hora, 7), [misSesiones, today, hora]);
  const rentStatus = arriendo ? RENT_STATUS[arriendo.estado] ?? RENT_STATUS.pendiente : null;
  const nombre = (user?.name ?? "").trim().split(/\s+/)[0];

  return (
    <section className="gerencial-page">
      <p className="dashboard-label">MI PANEL</p>
      <h1>{nombre ? `Panel de ${nombre}` : "Mi panel"}</h1>
      <p className="dashboard-description">
        Tus ganancias cuentan las sesiones <strong>completadas</strong>: el precio de cada reserva se reparte entre sus sesiones no canceladas.
      </p>

      {loading && <LoadingScreen message="Cargando tu panel…" />}
      {error && <div role="alert"><p>{error}</p><button type="button" className="reservation-button" onClick={reload}>Reintentar</button></div>}

      {!loading && !error && <>
        <div className="gerencial-period" role="group" aria-label="Mes del panel">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setMes(shiftMonth(mes, -1))} aria-label="Mes anterior">‹</button>
          <p className="gerencial-period-label gerencial-period-label--month" aria-live="polite">{formatMonth(mes)}</p>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setMes(shiftMonth(mes, 1))} aria-label="Mes siguiente">›</button>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setMes(currentMonth)} disabled={mes === currentMonth}>Este mes</button>
        </div>

        <section className="gerencial-kpis" aria-label="Tus indicadores del mes">
          <article className="kpi kpi--hero">
            <p className="kpi-label">Mis ganancias del mes</p>
            <p className="kpi-value">{formatPrice(resumen.ganancias)}</p>
            <Delta actual={resumen.ganancias} anterior={anterior.ganancias} empty="Sin ganancias el mes anterior" />
          </article>
          <article className="kpi">
            <p className="kpi-label">Por realizar en el mes</p>
            <p className="kpi-value">{formatPrice(resumen.porCobrar)}</p>
            <p className="kpi-delta">{resumen.programadas} {resumen.programadas === 1 ? "sesión programada" : "sesiones programadas"}</p>
          </article>
          <article className="kpi">
            <p className="kpi-label">Sesiones del mes</p>
            <p className="kpi-value">{resumen.completadas + resumen.programadas}</p>
            <p className="kpi-delta">{resumen.completadas} completadas · {resumen.canceladas} canceladas</p>
          </article>
          <article className="kpi kpi--rent">
            <p className="kpi-label">Mi arriendo del mes</p>
            {arriendo === undefined ? <p className="kpi-value">…</p>
              : rentError ? <p className="kpi-delta">{rentError}</p>
              : !arriendo ? <p className="kpi-delta">Sin arriendo este mes.</p>
              : <>
                <p className="kpi-value">{formatPrice(arriendo.cargo)}</p>
                <p className="kpi-delta">{arriendo.modalidad ?? "Sin modalidad"} · {rentDetail(arriendo)}</p>
                <p className="kpi-delta">
                  <span className={`rent-status rent-status--${rentStatus.tone}`}>{rentStatus.label}</span>
                  {" "}Pagado {formatPrice(arriendo.pagado)}{arriendo.saldo > 0 ? ` · saldo ${formatPrice(arriendo.saldo)}` : ""}
                </p>
              </>}
          </article>
        </section>

        <div className="gerencial-grid">
          <article className="chart-card chart-card--wide">
            <header>
              <h2>Mis ganancias por mes</h2>
              <p>Últimos {HISTORY_MONTHS} meses hasta {formatMonth(mes)} · sesiones completadas</p>
            </header>
            <ColumnChart
              ariaLabel={`Tus ganancias de los últimos ${HISTORY_MONTHS} meses`}
              seriesLabel="Ganancias (sesiones completadas)"
              format={formatPrice}
              formatAxis={formatPriceCompact}
              data={meses.map((item) => ({
                key: item.periodo,
                label: formatMonthShort(item.periodo),
                tooltipLabel: formatMonth(item.periodo),
                value: item.ganancias,
                highlight: item.periodo === mes,
              }))}
            />
            <DataTable caption="Tus ganancias por mes" columns={["Mes", "Ganancias", "Por realizar"]}
              rows={meses.map((item) => [formatMonth(item.periodo), formatPrice(item.ganancias), formatPrice(item.porCobrar)])} />
          </article>

          <article className="chart-card">
            <header>
              <h2>Mis reservas por estado</h2>
              <p>Tus reservas en la agenda</p>
            </header>
            {propias.length ? <>
              <DonutChart ariaLabel="Tus reservas por estado" centerLabel="reservas"
                data={estados.map(({ estado, total }) => ({ label: STATUS_LABELS[estado], value: total, color: STATUS_COLORS[estado] }))} />
              <DataTable caption="Tus reservas por estado" columns={["Estado", "Reservas"]}
                rows={estados.map(({ estado, total }) => [STATUS_LABELS[estado], total])} />
            </> : <p className="gerencial-empty">Todavía no tienes reservas.</p>}
          </article>

          <article className="chart-card">
            <header>
              <h2>Mis sesiones por cerrar</h2>
              <p>Ya terminaron y siguen como Programadas</p>
            </header>
            <p className={`gerencial-count${porCerrar.length ? " gerencial-count--alert" : ""}`}>{porCerrar.length}</p>
            <SessionList items={porCerrar} withArtist={false} empty="Todas tus sesiones pasadas están cerradas."
              onClose={(item, estado) => changeSessionStatus(item.reservaId, item.id, estado)} />
          </article>

          <article className="chart-card chart-card--wide">
            <header>
              <h2>Mis próximas sesiones</h2>
              <p>Programadas para los próximos 7 días</p>
            </header>
            <SessionList items={proximas} withArtist={false} empty="No tienes sesiones programadas en los próximos 7 días." />
          </article>
        </div>
      </>}
    </section>
  );
}
