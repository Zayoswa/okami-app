import "./Notice.css";

// Aviso con fondo, borde y símbolo, para que no pase desapercibido.
// tone: "danger" (crítico: algo falló), "warning" (atención: falta algo), "ok" (se hizo).
const TONES = {
  danger: { prefix: "Error:", role: "alert" },
  warning: { prefix: "Atención:", role: "status" },
  ok: { prefix: "Listo:", role: "status" },
};

function Icon({ tone }) {
  if (tone === "danger") {
    // Círculo con signo de exclamación
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <circle cx="10" cy="10" r="8.25" fill="currentColor" />
        <rect x="9" y="5" width="2" height="6.5" rx="1" fill="var(--notice-bg)" />
        <circle cx="10" cy="14.3" r="1.2" fill="var(--notice-bg)" />
      </svg>
    );
  }
  if (tone === "warning") {
    // Triángulo de advertencia
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M10 1.8 19 17.6H1z" fill="currentColor" strokeLinejoin="round" stroke="currentColor" strokeWidth="1.2" />
        <rect x="9.05" y="7" width="1.9" height="5.6" rx="0.95" fill="var(--notice-bg)" />
        <circle cx="10" cy="14.9" r="1.1" fill="var(--notice-bg)" />
      </svg>
    );
  }
  // Círculo con visto
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="8.25" fill="currentColor" />
      <path d="m6.2 10.2 2.6 2.6 5-5.2" fill="none" stroke="var(--notice-bg)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// action: un botón opcional a la derecha (por ejemplo, "Reintentar").
export default function Notice({ tone = "warning", children, action, className = "" }) {
  const config = TONES[tone] ?? TONES.warning;
  return (
    <div className={`notice notice--${tone} ${className}`.trim()} role={config.role}>
      <Icon tone={tone} />
      <p className="notice-text"><span className="notice-sr">{config.prefix} </span>{children}</p>
      {action && <div className="notice-action">{action}</div>}
    </div>
  );
}
