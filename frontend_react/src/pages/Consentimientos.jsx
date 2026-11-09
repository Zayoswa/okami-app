import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import ConsentModal from "../components/ConsentModal";
import LoadingScreen from "../components/LoadingScreen";
import Notice from "../components/Notice";
import { authBlob, authRequest } from "../services/authService";
import { reservationsRepository } from "../services/reservationsRepository";
import { todayInSantiago } from "../utils/calendar";
import { folioLabel } from "../utils/consentimientos";
import { formatDate } from "../utils/format";
import { formatRut, normalizeRut } from "../utils/rut";
import { isArchived } from "../utils/sessions";
import "./Consentimientos.css";

// Consentimiento informado: admin, recepción y tatuador (este último solo ve y crea los de sus clientes).
// ?reserva=<id> abre el formulario con los datos de esa reserva (botón "Consentimiento" del detalle de una reserva).
export default function Consentimientos({ user }) {
  const [params, setParams] = useSearchParams();
  const [consentimientos, setConsentimientos] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [tatuadores, setTatuadores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(() => params.has("reserva"));
  const [opening, setOpening] = useState("");
  const initialReservaId = params.get("reserva") ?? "";

  useEffect(() => {
    let active = true;
    Promise.all([authRequest("/api/consentimientos"), reservationsRepository.list(), reservationsRepository.catalogs()])
      .then(([lista, todas, catalogos]) => {
        if (!active) return;
        const today = todayInSantiago();
        setConsentimientos(lista);
        // Solo reservas con datos del cliente (las propias para un tatuador) y no borradas; las próximas primero.
        setReservas(todas.filter((item) => item.cliente && !isArchived(item)).map((item) => {
          const fechas = (item.sesiones ?? []).map((sesion) => sesion.fecha).sort();
          return { ...item, proxima: fechas.find((fecha) => fecha >= today) ?? fechas.at(-1) ?? "" };
        }).sort((a, b) => (a.proxima < today) - (b.proxima < today) || a.proxima.localeCompare(b.proxima)));
        setTatuadores(catalogos.tatuadores ?? []);
      })
      .catch((loadError) => { if (active) setError(loadError instanceof Error ? loadError.message : "No se pudieron cargar los consentimientos."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const visibles = useMemo(() => {
    const text = search.trim().toLowerCase();
    if (!text) return consentimientos;
    const rut = normalizeRut(text);
    return consentimientos.filter((item) => item.cliente.toLowerCase().includes(text)
      || item.tatuador.toLowerCase().includes(text)
      || (rut.length >= 3 && item.clienteRut.includes(rut))
      || folioLabel(item.folio).includes(text));
  }, [consentimientos, search]);

  // Abre el PDF en una pestaña nueva (desde ahí se imprime o se descarga). La pestaña se abre antes de la
  // descarga para que el navegador no la bloquee; si igual se bloquea, se descarga el archivo.
  async function openPdf(consentimiento) {
    setOpening(consentimiento.id);
    setError("");
    const tab = window.open("", "_blank");
    try {
      const blob = await authBlob(`/api/consentimientos/${encodeURIComponent(consentimiento.id)}/pdf`);
      const url = URL.createObjectURL(blob);
      if (tab) {
        tab.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `consentimiento-${folioLabel(consentimiento.folio)}.pdf`;
        link.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (pdfError) {
      tab?.close();
      setError(pdfError instanceof Error ? pdfError.message : "No se pudo abrir el PDF.");
    } finally {
      setOpening("");
    }
  }

  function closeForm() {
    setCreating(false);
    if (params.has("reserva")) setParams({}, { replace: true });
  }

  function saved(consentimiento) {
    closeForm();
    setConsentimientos((current) => [consentimiento, ...current]);
    setMessage(consentimiento);
  }

  if (loading) return <LoadingScreen message="Cargando consentimientos…" />;

  return (
    <section className="consent-page">
      <div className="consent-header">
        <div>
          <h1>Consentimientos</h1>
          <p className="dashboard-description">
            Consentimiento informado del cliente (DS 304/2002). Se guarda con un folio y se imprime listo para firmar.
          </p>
        </div>
        <button type="button" className="reservation-button" onClick={() => { setMessage(null); setCreating(true); }}>Nuevo consentimiento</button>
      </div>

      {message && (
        <Notice tone="ok" action={(
          <button type="button" className="reservation-button" onClick={() => openPdf(message)} disabled={opening === message.id}>
            {opening === message.id ? "Abriendo…" : "Abrir PDF"}
          </button>
        )}>
          Consentimiento folio {folioLabel(message.folio)} de {message.cliente} guardado. Ábrelo para imprimirlo o enviarlo.
        </Notice>
      )}
      {error && <Notice tone="danger">{error}</Notice>}

      <div className="consent-filters" role="search">
        <label>Buscar
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cliente, RUT, tatuador o folio" maxLength={60} />
        </label>
      </div>

      {visibles.length === 0 ? (
        <p className="empty-state">{search ? "No hay consentimientos que coincidan con la búsqueda." : "Todavía no hay consentimientos. Crea el primero con «Nuevo consentimiento»."}</p>
      ) : (
        <div className="consent-table-wrap">
          <table className="consent-table">
            <thead>
              <tr>
                <th scope="col">Folio</th>
                <th scope="col">Fecha</th>
                <th scope="col">Cliente</th>
                {user.role !== "tatuador" && <th scope="col">Tatuador</th>}
                <th scope="col">Trabajo</th>
                <th scope="col"><span className="consent-sr-only">PDF</span></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((item) => (
                <tr key={item.id}>
                  <td className="consent-folio">{folioLabel(item.folio)}</td>
                  <td><time dateTime={item.fecha}>{formatDate(item.fecha)}</time></td>
                  <td>
                    <span className="consent-client">{item.cliente}</span>
                    <span className="consent-sub">{formatRut(item.clienteRut)}{item.menorDeEdad && <span className="consent-minor">Menor de edad</span>}</span>
                  </td>
                  {user.role !== "tatuador" && <td>{item.tatuador}</td>}
                  <td>
                    <span>{item.zonaCuerpo}</span>
                    <span className="consent-sub">{item.tipoTatuaje}</span>
                  </td>
                  <td className="consent-actions">
                    <button type="button" className="reservation-button reservation-button-secondary" onClick={() => openPdf(item)} disabled={opening === item.id}
                      aria-label={`Abrir el PDF del consentimiento folio ${folioLabel(item.folio)} de ${item.cliente}`}>
                      {opening === item.id ? "Abriendo…" : "PDF"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creating && (
        <ConsentModal user={user} tatuadores={tatuadores} reservas={reservas} initialReservaId={initialReservaId}
          onSaved={saved} onClose={closeForm} />
      )}
    </section>
  );
}
