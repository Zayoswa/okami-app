import { Link } from "react-router-dom";
import { formatPrice } from "../utils/format";
import "./RentKpis.css";

// Indicadores del arriendo del mes (Arriendos y Dashboard):
//   - principal: lo cobrado frente a lo que se espera cobrar ("$230.000 / $460.000"), con barra de avance;
//   - más chicos: el total estimado del mes y lo pendiente.
// totales: { cargo, pagado, pendiente } o null mientras carga.
// pendingLink: ruta opcional; agrega al KPI Pendiente un botón para ir a cobrar (en el Dashboard, a Arriendos).
export default function RentKpis({ totales, tatuadores = 0, conSaldo = 0, pendingLink }) {
  const loading = !totales;
  const cargo = totales?.cargo ?? 0;
  const pagado = totales?.pagado ?? 0;
  const avance = cargo > 0 ? Math.round((pagado / cargo) * 100) : 0;
  const barra = Math.min(100, avance);

  return (
    <div className="rent-kpis" aria-busy={loading}>
      <article className="rent-kpi rent-kpi--hero">
        <p className="rent-kpi-label">Arriendo cobrado</p>
        <p className="rent-kpi-value">
          {loading ? "…" : <>{formatPrice(pagado)} <span className="rent-kpi-of">/ {formatPrice(cargo)}</span></>}
        </p>
        {!loading && (cargo > 0 ? (
          <>
            <div className="rent-progress" role="progressbar" aria-label="Avance del cobro del mes"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={barra} aria-valuetext={`${avance}% cobrado`}>
              <span style={{ width: `${barra}%` }} />
            </div>
            <p className="rent-kpi-note">{avance}% de lo estimado para el mes{avance > 100 ? " (hay pagos de más)" : ""}</p>
          </>
        ) : <p className="rent-kpi-note">No hay arriendos por cobrar este mes</p>)}
      </article>

      <article className="rent-kpi">
        <p className="rent-kpi-label">Total estimado del mes</p>
        <p className="rent-kpi-value">{loading ? "…" : formatPrice(cargo)}</p>
        <p className="rent-kpi-note">{loading ? "" : `${tatuadores} ${tatuadores === 1 ? "tatuador" : "tatuadores"}, según su modalidad`}</p>
      </article>

      <article className="rent-kpi">
        <p className="rent-kpi-label">Pendiente</p>
        <p className={`rent-kpi-value${totales?.pendiente ? " rent-kpi-value--due" : ""}`}>{loading ? "…" : formatPrice(totales.pendiente)}</p>
        <p className={`rent-kpi-note${conSaldo ? " rent-kpi-note--due" : ""}`}>
          {loading ? "" : conSaldo ? `${conSaldo} ${conSaldo === 1 ? "tatuador" : "tatuadores"} con saldo por pagar` : "Todo al día"}
        </p>
        {pendingLink && (
          <Link to={pendingLink} className="reservation-button rent-kpi-link">
            {conSaldo ? "Registrar pagos" : "Ver arriendos"} <span aria-hidden="true">›</span>
          </Link>
        )}
      </article>
    </div>
  );
}
