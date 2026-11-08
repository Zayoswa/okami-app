import ChartTooltip from "./ChartTooltip";
import useChartTooltip from "./useChartTooltip";

const SIZE = 180;
const OUTER = 86;
const INNER = 58;

function point(radius, angle) {
  return [SIZE / 2 + radius * Math.sin(angle), SIZE / 2 - radius * Math.cos(angle)];
}

// Sector del anillo entre dos ángulos (en radianes, 0 = arriba, sentido horario).
function arc(start, end) {
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = point(OUTER, start);
  const [x2, y2] = point(OUTER, end);
  const [x3, y3] = point(INNER, end);
  const [x4, y4] = point(INNER, start);
  return `M${x1} ${y1} A${OUTER} ${OUTER} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${INNER} ${INNER} 0 ${large} 0 ${x4} ${y4} Z`;
}

// Gráfico de anillo con leyenda (nombre, cantidad y porcentaje) y tooltip por sector.
// data: [{ label, value, color }]; centerLabel: texto bajo el total.
export default function DonutChart({ data, centerLabel, ariaLabel }) {
  const { containerRef, tip, show, hide } = useChartTooltip();
  const total = data.reduce((sum, item) => sum + item.value, 0);
  const share = (value) => (total ? Math.round((value / total) * 100) : 0);
  // Ángulo de inicio de cada sector = suma de los sectores anteriores.
  const visibles = data.filter((item) => item.value > 0);
  const slices = visibles.map((item, index) => {
    const before = visibles.slice(0, index).reduce((sum, prev) => sum + prev.value, 0);
    const start = (before / total) * Math.PI * 2;
    return { ...item, start, end: start + (item.value / total) * Math.PI * 2 };
  });

  return (
    <div className="donut" ref={containerRef}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut-svg" role="img" aria-label={ariaLabel}>
        {total === 0 && <circle cx={SIZE / 2} cy={SIZE / 2} r={(OUTER + INNER) / 2} fill="none" stroke="var(--color-border-soft)" strokeWidth={OUTER - INNER} />}
        {slices.map((item) => {
          const content = { value: `${item.value} (${share(item.value)}%)`, label: item.label, color: item.color };
          const events = {
            tabIndex: 0,
            onPointerMove: (event) => show(event, content),
            onPointerLeave: hide,
            onFocus: (event) => show(event, content),
            onBlur: hide,
            "aria-label": `${item.label}: ${item.value} (${share(item.value)}%)`,
          };
          // Un solo sector ocupa todo el anillo: se dibuja como círculo (un arco de 360° no se puede trazar).
          return slices.length === 1
            ? <circle key={item.label} className="donut-slice" cx={SIZE / 2} cy={SIZE / 2} r={(OUTER + INNER) / 2} fill="none" stroke={item.color} strokeWidth={OUTER - INNER} {...events} />
            : <path key={item.label} className="donut-slice" d={arc(item.start, item.end)} fill={item.color} stroke="var(--color-surface)" strokeWidth="2" {...events} />;
        })}
        <text x={SIZE / 2} y={SIZE / 2 - 2} textAnchor="middle" className="donut-total">{total}</text>
        <text x={SIZE / 2} y={SIZE / 2 + 18} textAnchor="middle" className="donut-caption">{centerLabel}</text>
      </svg>

      <ul className="chart-legend chart-legend--stacked">
        {data.map((item) => (
          <li key={item.label}>
            <i className="chart-legend-swatch" style={{ background: item.color }} aria-hidden="true" />
            <span className="chart-legend-name">{item.label}</span>
            <strong>{item.value}</strong>
            <span className="chart-legend-share">{share(item.value)}%</span>
          </li>
        ))}
      </ul>
      <ChartTooltip tip={tip} />
    </div>
  );
}
