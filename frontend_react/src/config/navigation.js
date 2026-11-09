// Módulos de la app. label: texto del menú lateral; name y description: botón de la página Inicio.
// Roles: admin (todo), recepcion (gestiona el estudio, sin Dashboard gerencial, Arriendos ni Reservas)
// y tatuador (su panel, sus reservas y el calendario).
export const navigation = [
  { id: "inicio", path: "/inicio", label: "Inicio", name: "Inicio", roles: ["admin", "recepcion", "tatuador"] },
  { id: "dashboard", path: "/dashboard", label: "Dashboard", name: "Dashboard", description: "Arriendo del mes, ventas y sesiones por cerrar", roles: ["admin"] },
  { id: "arriendos", path: "/arriendos", label: "Arriendos", name: "Arriendos", description: "Lo que paga cada tatuador y sus pagos", roles: ["admin"] },
  { id: "reservas", path: "/reservas", label: "Reservas", name: "Reservas", description: "Crear, buscar y cerrar reservas", roles: ["admin"] },
  { id: "mi-panel", path: "/mi-panel", label: "Mi panel", name: "Mi panel", description: "Tus ganancias, sesiones y arriendo del mes", roles: ["tatuador"] },
  { id: "mis-reservas", path: "/mis-reservas", label: "Mis reservas", name: "Mis reservas", description: "Tus reservas y sus sesiones", roles: ["tatuador"] },
  { id: "calendario", path: "/calendario", label: "Calendario", name: "Calendario", description: "Sesiones de la semana por puesto", roles: ["admin", "recepcion", "tatuador"] },
  { id: "tatuadores", path: "/tatuadores", label: "Tatuadores", name: "Tatuadores", description: "Registro, acceso y modalidad", roles: ["admin", "recepcion"] },
  { id: "actividad", path: "/actividad", label: "Actividad", name: "Actividad", description: "Quién hizo qué y cuándo en el estudio", roles: ["admin", "recepcion"] },
  { id: "puestos", path: "/espacios", label: "Espacios", name: "Espacios", description: "Estado, tipo y titulares de los puestos", roles: ["admin", "recepcion"] },
  // Módulos planificados (sin página todavía). No están en ORDER, así que no aparecen en el menú ni en Inicio;
  // para mostrarlos como "Próximamente", agregar su id en ORDER.
  { id: "alertas", label: "Alertas (Próximamente)", name: "Alertas", comingSoon: true, roles: ["admin", "recepcion"] },
  { id: "documentacion", label: "Documentación (Próximamente)", name: "Documentación", comingSoon: true, roles: ["admin", "recepcion"] },
];

const ORDER = {
  admin: ["inicio", "dashboard", "arriendos", "calendario", "reservas", "tatuadores", "puestos", "actividad"],
  recepcion: ["inicio", "calendario", "tatuadores", "puestos", "actividad"],
  tatuador: ["inicio", "mi-panel", "mis-reservas", "calendario"],
};

export function modulesForUser(user) {
  const order = ORDER[user?.role] ?? [];
  return order
    .map((id) => navigation.find((module) => module.id === id))
    .filter((module) => module?.roles.includes(user?.role))
    .sort((a, b) => Number(Boolean(a.comingSoon)) - Number(Boolean(b.comingSoon)));
}

export function canAccessModule(user, moduleId) {
  return navigation.some((module) => module.id === moduleId && module.roles.includes(user?.role));
}
