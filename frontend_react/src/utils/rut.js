// El RUT se guarda en forma canónica: solo dígitos y K mayúscula (ej. 12345678K).
// Se muestra y se escribe sin puntos, solo con guion antes del dígito verificador (ej. 11222333-K).
export function normalizeRut(value) {
  return String(value ?? "").toUpperCase().replace(/[^0-9K]/g, "");
}

export function rutVerifier(body) {
  const digits = String(body ?? "");
  if (!/^\d{1,9}$/.test(digits) || /^0+$/.test(digits)) return "";
  let factor = 2;
  let sum = 0;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += Number(digits[index]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const result = 11 - (sum % 11);
  return result === 11 ? "0" : result === 10 ? "K" : String(result);
}

export function rutValidationError(value) {
  const rut = normalizeRut(value);
  if (!rut) return "Ingresa el RUT del cliente con su dígito verificador.";
  if (!/^\d{1,9}[0-9K]$/.test(rut) || /^0+$/.test(rut.slice(0, -1))) return "Ingresa un RUT válido, sin puntos y con guion. Ej: 12345678-5.";
  if (rutVerifier(rut.slice(0, -1)) !== rut.slice(-1)) return "El dígito verificador no corresponde al RUT ingresado.";
  return "";
}

export function formatRut(value) {
  const rut = normalizeRut(value);
  if (rut.length < 2) return rut;
  return `${rut.slice(0, -1)}-${rut.slice(-1)}`;
}

// Mientras se escribe: solo dígitos, K y un guion; sin puntos ni espacios.
export function typedRut(value) {
  const clean = String(value ?? "").toUpperCase().replace(/[^0-9K-]/g, "");
  const [body, ...rest] = clean.split("-");
  const verifier = rest.join("").slice(0, 1);
  return (clean.includes("-") ? `${body}-${verifier}` : body).slice(0, 11);
}
