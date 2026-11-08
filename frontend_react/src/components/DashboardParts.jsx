import SessionStatusButtons from "./SessionStatusButtons";
import { percentChange } from "../utils/dashboard";
import { formatShortWeekdayDate } from "../utils/format";

// Piezas compartidas por el Dashboard del admin y el panel del tatuador (estilos en pages/Gerencial.css).

// Variación frente al período anterior: "▲ +12% vs. mes anterior".
export function Delta({ actual, anterior, periodo = "mes anterior", empty = "Sin datos el mes anterior" }) {
  const change = percentChange(actual, anterior);
  if (change === null) return <p className="kpi-delta">{empty}</p>;
  const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
  const arrow = change > 0 ? "▲" : change < 0 ? "▼" : "●";
  return <p className={`kpi-delta kpi-delta--${tone}`}><span aria-hidden="true">{arrow}</span> {change > 0 ? "+" : ""}{change}% vs. {periodo}</p>;
}

// Tabla con los mismos datos del gráfico: los valores nunca dependen solo del color o del tooltip.
export function DataTable({ caption, columns, rows }) {
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

// Leyenda simple de un gráfico: [{ label, className }] (el color sale de la clase del swatch).
export function SimpleLegend({ items }) {
  return (
    <ul className="simple-legend">
      {items.map((item) => <li key={item.label}><i className={`simple-legend-swatch ${item.className}`} aria-hidden="true" />{item.label}</li>)}
    </ul>
  );
}

// Lista de sesiones. Con onClose(sesion, estado), cada una tiene botones para marcarla Completada o Cancelada;
// al guardarse sale de la lista (deja de estar "por cerrar"). withArtist: muestra el tatuador (vista del admin).
export function SessionList({ items, empty, onClose, withArtist = true }) {
  if (!items.length) return <p className="gerencial-empty">{empty}</p>;
  return (
    <ul className="gerencial-sessions">
      {items.slice(0, 6).map((item) => (
        <li key={item.id} className={onClose ? "gerencial-sessions-closable" : ""}>
          <span className="gerencial-sessions-when">{formatShortWeekdayDate(item.fecha)} · {item.horaInicio}</span>
          <span className="gerencial-sessions-who">{item.cliente ?? "Cliente"}{withArtist ? ` · ${item.tatuador}` : ""}</span>
          <span className="gerencial-sessions-where">{item.puesto}</span>
          {onClose && (
            <SessionStatusButtons sesion={item} options={["Completada", "Cancelada"]}
              label={`Cerrar la sesión de ${item.cliente ?? "este cliente"} del ${formatShortWeekdayDate(item.fecha)}`}
              onChange={(estado) => onClose(item, estado)} />
          )}
        </li>
      ))}
      {items.length > 6 && <li className="gerencial-sessions-more">y {items.length - 6} más</li>}
    </ul>
  );
}
