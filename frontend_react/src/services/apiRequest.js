// El límite incluye recibir el cuerpo: una respuesta incompleta tampoco bloquea la UI.
export async function apiRequest(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new Error("El servidor devolvió una respuesta inválida. Comprueba que FastAPI esté funcionando.", { cause: error });
    }
    if (!response.ok) {
      const error = new Error(typeof data.detail === "string" ? data.detail : "No se pudo completar la operación.");
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("El servidor tardó demasiado en responder. Comprueba que FastAPI esté iniciado y vuelve a intentarlo.", { cause: error });
    }
    if (error instanceof TypeError) throw new Error("No se pudo conectar con el servidor. Comprueba que FastAPI esté iniciado.", { cause: error });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
