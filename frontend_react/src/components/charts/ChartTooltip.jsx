// Tooltip de los gráficos: el valor va primero y destacado; la etiqueta, debajo y más suave.
export default function ChartTooltip({ tip }) {
  if (!tip) return null;
  const { value, label, detail, color } = tip.content;
  return (
    <div className={`chart-tooltip${tip.flip ? " chart-tooltip--left" : ""}`} style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{value}</strong>
      <span>
        {color && <i className="chart-tooltip-key" style={{ background: color }} aria-hidden="true" />}
        {label}
      </span>
      {detail && <small>{detail}</small>}
    </div>
  );
}
