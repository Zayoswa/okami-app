import { useEffect, useState } from "react";
import ChartTooltip from "./ChartTooltip";
import useChartTooltip from "./useChartTooltip";

const HEIGHT = 230;
const LEFT = 60;
const RIGHT = 8;
const TOP = 22;
const BOTTOM = 28;
const RADIUS = 4;

// Escala "limpia" para el eje Y: 1, 2, 2,5 o 5 por potencia de 10.
function niceStep(max, ticks = 3) {
  const raw = max / ticks;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const step = [1, 2, 2.5, 5, 10].map((n) => n * power).find((n) => n >= raw) ?? power * 10;
  return step;
}

// Columna con las esquinas superiores redondeadas y la base recta sobre el eje.
function columnPath(x, y, width, height) {
  if (height <= 0) return "";
  const r = Math.min(RADIUS, height, width / 2);
  return `M${x} ${y + height} V${y + r} Q${x} ${y} ${x + r} ${y} H${x + width - r} Q${x + width} ${y} ${x + width} ${y + r} V${y + height} Z`;
}

// Gráfico de columnas de una sola serie, con tooltip por columna.
// data: [{ key, label, value, target?, highlight, tooltipLabel }]; format: número → texto; formatAxis: idem, corto.
// target (opcional): la meta de cada columna (por ejemplo, el arriendo estimado del mes). Se dibuja detrás,
// en un tono claro, y la columna sólida (value, lo cobrado) va encima; targetLabel la nombra en el tooltip.
// Se etiqueta solo la columna destacada y la más alta, para no llenar el gráfico de números.
export default function ColumnChart({ data, format, formatAxis = format, ariaLabel, seriesLabel, targetLabel = "meta" }) {
  const { containerRef, tip, show, hide } = useChartTooltip();
  // El SVG se dibuja al ancho real del contenedor: así textos y barras mantienen su tamaño en px.
  const [WIDTH, setWidth] = useState(640);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(node);
    return () => observer.disconnect();
  }, [containerRef]);
  const max = Math.max(0, ...data.map((item) => Math.max(item.value, item.target ?? 0)));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step);
  const plotWidth = WIDTH - LEFT - RIGHT;
  const plotHeight = HEIGHT - TOP - BOTTOM;
  const slot = plotWidth / data.length;
  const barWidth = Math.min(24, slot * 0.6);
  const y = (value) => TOP + plotHeight - (value / top) * plotHeight;
  // Si las fechas no caben todas (celular), se muestra una de cada N; la destacada siempre.
  const labelEvery = Math.max(1, Math.ceil(48 / slot));
  const maxKey = data.reduce((best, item) => (item.value > (best?.value ?? -1) ? item : best), null)?.key;

  return (
    <div className="column-chart" ref={containerRef}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} className="column-chart-svg" role="img" aria-label={ariaLabel}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} className={tick === 0 ? "chart-baseline" : "chart-grid"} />
            <text x={LEFT - 8} y={y(tick) + 4} textAnchor="end" className="chart-axis-label">{formatAxis(tick)}</text>
          </g>
        ))}
        {data.map((item, index) => {
          const x = LEFT + slot * index + (slot - barWidth) / 2;
          const height = (item.value / top) * plotHeight;
          const hasTarget = item.target !== undefined && item.target !== null;
          const targetHeight = hasTarget ? (item.target / top) * plotHeight : 0;
          const labelled = item.value > 0 && (item.highlight || item.key === maxKey);
          const content = {
            value: hasTarget ? `${format(item.value)} de ${format(item.target)}` : format(item.value),
            label: item.tooltipLabel ?? item.label,
            detail: hasTarget ? `${seriesLabel} / ${targetLabel}` : seriesLabel,
          };
          return (
            <g key={item.key} className={`column${item.highlight ? " column--highlight" : ""}`}>
              {hasTarget && <path d={columnPath(x, y(item.target), barWidth, targetHeight)} className="column-target" />}
              <path d={columnPath(x, y(item.value), barWidth, height)} className="column-mark" />
              {labelled && <text x={x + barWidth / 2} y={y(item.value) - 6} textAnchor="middle" className="chart-value-label">{formatAxis(item.value)}</text>}
              {(item.highlight || (data.length - 1 - index) % labelEvery === 0) && <text x={LEFT + slot * index + slot / 2} y={HEIGHT - 8} textAnchor="middle" className={`chart-axis-label${item.highlight ? " chart-axis-label--strong" : ""}`}>{item.label}</text>}
              {/* Zona de interacción: toda la franja de la columna, más grande que la barra */}
              <rect x={LEFT + slot * index} y={TOP} width={slot} height={plotHeight} className="chart-hit" tabIndex={0}
                aria-label={`${content.label}: ${content.value}`}
                onPointerMove={(event) => show(event, content)} onPointerLeave={hide}
                onFocus={(event) => show(event, content)} onBlur={hide} />
            </g>
          );
        })}
      </svg>
      <ChartTooltip tip={tip} />
    </div>
  );
}
