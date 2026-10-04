const configuredUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (!configuredUrl) {
  throw new Error("Configura VITE_API_BASE_URL y reinicia Vite para conectar con el backend.");
}

export const API_BASE_URL = configuredUrl.replace(/\/+$/, "");
