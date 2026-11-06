// Etiqueta con el tipo de puesto y su símbolo:
//   Full       -> una persona (1 titular fijo)
//   Compartido -> dos personas (2 titulares fijos)
//   Rotativo   -> flechas en círculo (lo usa quien lo agende)
// Los íconos son SVG propios en línea: no requieren instalar ninguna librería.

const ICONS = {
  Full: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </>
  ),
  Compartido: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2 21v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" />
      <path d="M19 15.2a5 5 0 0 1 3 4.8v1" />
    </>
  ),
  Rotativo: (
    <>
      <path d="M20 12a8 8 0 0 1-14.3 4.9" />
      <path d="M4 12a8 8 0 0 1 14.3-4.9" />
      <path d="M18.5 3v4.5H14" />
      <path d="M5.5 21v-4.5H10" />
    </>
  ),
};

export default function PuestoTipoBadge({ tipo }) {
  const name = ICONS[tipo] ? tipo : "Rotativo";
  return (
    <span className={`puesto-tipo-badge puesto-tipo-badge--${name.toLowerCase()}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {ICONS[name]}
      </svg>
      {name}
    </span>
  );
}
