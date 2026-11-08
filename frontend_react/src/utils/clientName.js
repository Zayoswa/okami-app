// Nombre del cliente: solo texto. Letras (con tildes y ñ), espacios, guiones, apóstrofos o puntos.
// La misma regla la aplica el servidor (main.py: client_name_error).

// Espacios normalizados: "  ana   pérez " → "ana pérez".
export function cleanClientName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

// Mensaje de error, o "" si el nombre es válido.
export function clientNameError(value) {
  const name = cleanClientName(value);
  if (!name) return "Ingresa el nombre del cliente.";
  if (/\d/.test(name)) return "El nombre del cliente solo puede tener letras. Si escribiste el RUT, ingrésalo en el campo RUT.";
  if (!/^\p{L}+(?:[ '’.-]+\p{L}+)*\.?$/u.test(name)) return "El nombre del cliente solo puede tener letras, espacios, guiones o apóstrofos.";
  if ((name.match(/\p{L}/gu) ?? []).length < 2) return "Ingresa el nombre completo del cliente.";
  return "";
}
