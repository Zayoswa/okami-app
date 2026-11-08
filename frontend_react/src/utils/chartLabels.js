// Textos y colores de los gráficos del Dashboard y de "Mi panel".

// Colores de los estados en los gráficos (validados para daltonismo; ver index.css).
export const STATUS_COLORS = {
  Completada: "var(--chart-completada)",
  Programada: "var(--chart-programada)",
  Cancelada: "var(--chart-cancelada)",
};
export const STATUS_LABELS = { Completada: "Completadas", Programada: "Programadas", Cancelada: "Canceladas" };

export const hoursLabel = (value) => `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")} h`;
