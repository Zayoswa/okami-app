// Barras horizontales ordenadas de mayor a menor, una sola serie, con el valor al final de cada barra.
// data: [{ key, label, value }]; format: número → texto.
export default function BarList({ data, format, ariaLabel }) {
  const max = Math.max(0, ...data.map((item) => item.value));
  return (
    <ol className="bar-list" aria-label={ariaLabel}>
      {data.map((item) => (
        <li key={item.key} className="bar-list-row">
          <span className="bar-list-label">{item.label}</span>
          <span className="bar-list-track">
            {/* El ancho deja espacio para el valor al final, así nunca queda cortado */}
            {item.value > 0 && <span className="bar-list-bar" style={{ width: `calc(${item.value / max} * (100% - 64px))` }} />}
            <span className="bar-list-value">{format(item.value)}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
