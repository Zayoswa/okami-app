import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authRequest } from "../services/authService";
import LoadingScreen from "../components/LoadingScreen";
import Notice from "../components/Notice";
import RentKpis from "../components/RentKpis";
import useAutoRefresh from "../hooks/useAutoRefresh";
import useConfirm from "../hooks/useConfirm";
import useModalDialog from "../hooks/useModalDialog";
import { todayInSantiago } from "../utils/calendar";
import { formatDate, formatPrice } from "../utils/format";
import {
  RENT_SORTS, RENT_STATUS, RENT_STATUS_FILTERS, filterRentRows, formatMonth, monthOf, paginate, rentDetail, rentModalities, shiftMonth, tariffText,
} from "../utils/arriendos";
import "./Arriendos.css";

// Ventana para registrar un pago del mes. Propone el saldo pendiente y la fecha de hoy.
function PaymentModal({ fila, mes, onSave, onClose }) {
  const dialogRef = useModalDialog();
  const [monto, setMonto] = useState(fila.saldo > 0 ? String(fila.saldo) : "");
  const [fecha, setFecha] = useState(todayInSantiago());
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const amount = Number(monto);
  const valid = monto !== "" && Number.isSafeInteger(amount) && amount > 0;

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (!valid) { setError("Ingresa un monto entero mayor a cero."); return; }
    if (!fecha) { setError("Ingresa la fecha del pago."); return; }
    setSaving(true);
    setError("");
    try {
      await onSave({ tatuadorId: fila.tatuadorId, periodo: mes, monto: amount, pagadoEn: fecha, nota: nota.trim() || undefined });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo registrar el pago.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialogRef} className="reservation-modal arriendo-modal" aria-labelledby="pago-title" aria-busy={saving}
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
      <form onSubmit={submit}>
        <div className="reservation-modal-header">
          <h2 id="pago-title">Registrar pago</h2>
          <button type="button" className="reservation-modal-close" onClick={onClose} disabled={saving} aria-label="Cerrar">×</button>
        </div>
        <p className="reservation-modal-description">
          {fila.tatuador} · {fila.modalidad ?? "Sin modalidad"} · arriendo de {formatMonth(mes)}: <strong>{formatPrice(fila.cargo)}</strong>
          {fila.pagado > 0 && <> (ya pagó {formatPrice(fila.pagado)})</>}
        </p>
        {fila.minimo > 0 && fila.pagado < fila.minimo && (
          <Notice tone="warning" className="notice--compact">El mínimo de {formatPrice(fila.minimo)} se paga a principio de mes.</Notice>
        )}
        <fieldset className="arriendo-modal-fields" disabled={saving}>
          <label>Monto (CLP)
            <input type="number" min="1" step="1" inputMode="numeric" value={monto} onChange={(event) => { setMonto(event.target.value); setError(""); }} required autoFocus />
            <small className="editor-hint">{valid ? formatPrice(amount) : "Monto entero, sin puntos."}</small>
          </label>
          <label>Fecha del pago
            <input type="date" value={fecha} onChange={(event) => { setFecha(event.target.value); setError(""); }} required />
          </label>
          <label className="arriendo-modal-note">Nota (opcional)
            <input value={nota} onChange={(event) => setNota(event.target.value)} maxLength={200} placeholder="Transferencia, efectivo…" />
          </label>
        </fieldset>
        {error && <Notice tone="danger" className="notice--compact">{error}</Notice>}
        <div className="reservation-modal-actions">
          <button type="button" className="reservation-button reservation-button-secondary" onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="submit" className="reservation-button" disabled={saving}>{saving ? "Guardando…" : "Registrar pago"}</button>
        </div>
      </form>
    </dialog>
  );
}

const EMPTY_FILTERS = { q: "", estado: "", modalidad: "", orden: "saldo" };

// Solo admin: arriendo que cada tatuador debe pagar en el mes según su modalidad, lo pagado y el saldo.
export default function Arriendos() {
  // ?mes=YYYY-MM abre ese mes (lo usa el botón del Dashboard); si no viene, el mes actual.
  const [searchParams] = useSearchParams();
  const [mes, setMes] = useState(() => {
    const pedido = searchParams.get("mes") ?? "";
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : monthOf(todayInSantiago());
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [paying, setPaying] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [confirm, confirmModal] = useConfirm();
  const currentMonth = monthOf(todayInSantiago());

  async function load(month = mes) {
    const result = await authRequest(`/api/arriendos?mes=${encodeURIComponent(month)}`);
    setData(result);
    setError("");
  }

  useEffect(() => {
    let active = true;
    authRequest(`/api/arriendos?mes=${encodeURIComponent(mes)}`)
      .then((result) => { if (active) { setData(result); setError(""); } })
      .catch((cause) => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mes]);

  // También cambia con las sesiones que se agendan o cancelan (turnos y días), así que se recarga sola.
  useAutoRefresh(() => load(), { enabled: !loading && !paying });

  function changeMonth(next) {
    setLoading(true);
    setMessage("");
    setOpen(new Set());
    setPage(1);
    setMes(next);
  }

  // Cambiar un filtro vuelve a la primera página.
  function updateFilter(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function toggle(id) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function savePayment(pago) {
    await authRequest("/api/arriendos/pagos", { method: "POST", body: JSON.stringify(pago) });
    setMessage(`Pago de ${formatPrice(pago.monto)} registrado.`);
    try { await load(); } catch { setError("El pago se guardó, pero no se pudo actualizar la tabla. Recarga la página."); }
  }

  async function removePayment(fila, pago) {
    const ok = await confirm({
      title: "Borrar pago",
      message: `${fila.tatuador}: pago de ${formatPrice(pago.monto)} del ${formatDate(pago.pagadoEn)}${pago.nota ? ` (${pago.nota})` : ""}.`,
      question: "¿Borrar este pago? El saldo del mes vuelve a subir.",
      confirmLabel: "Borrar pago",
      tone: "danger",
    });
    if (!ok) return;
    setMessage("");
    try {
      await authRequest(`/api/arriendos/pagos/${encodeURIComponent(pago.id)}`, { method: "DELETE" });
      setMessage("Pago borrado.");
      await load();
    } catch (cause) {
      setError(cause.message);
    }
  }

  const filas = useMemo(() => data?.filas ?? [], [data]);
  const filtradas = useMemo(() => filterRentRows(filas, filters), [filas, filters]);
  const modalidades = useMemo(() => rentModalities(filas), [filas]);
  const pagina = paginate(filtradas, page);
  const hasFilters = Boolean(filters.q.trim() || filters.estado || filters.modalidad || filters.orden !== EMPTY_FILTERS.orden);
  const totales = data?.totales ?? { cargo: 0, pagado: 0, pendiente: 0 };
  const conSaldo = filas.filter((fila) => fila.saldo > 0).length;
  const sinModalidad = filas.filter((fila) => fila.estado === "sin_modalidad").length;

  return (
    <section className="arriendos-page">
      <p className="dashboard-label">ARRIENDOS</p>
      <h1>Arriendos</h1>
      <p className="dashboard-description">
        Lo que cada tatuador paga al estudio en el mes según su modalidad. Los turnos y días se cuentan con las sesiones no canceladas del mes.
      </p>

      <div className="arriendos-period" role="group" aria-label="Mes">
        <button type="button" className="reservation-button reservation-button-secondary" onClick={() => changeMonth(shiftMonth(mes, -1))} aria-label="Mes anterior">‹</button>
        <p className="arriendos-month" aria-live="polite">{formatMonth(mes)}</p>
        <button type="button" className="reservation-button reservation-button-secondary" onClick={() => changeMonth(shiftMonth(mes, 1))} aria-label="Mes siguiente">›</button>
        <button type="button" className="reservation-button reservation-button-secondary" onClick={() => changeMonth(currentMonth)} disabled={mes === currentMonth}>Este mes</button>
      </div>

      {error && <Notice tone="danger">{error}</Notice>}
      {message && <Notice tone="ok">{message}</Notice>}

      {loading ? <LoadingScreen message="Cargando arriendos…" /> : data && <>
        <RentKpis totales={totales} tatuadores={filas.length} conSaldo={conSaldo} />

        {sinModalidad > 0 && (
          <Notice tone="warning">
            {sinModalidad === 1 ? "1 tatuador no tiene" : `${sinModalidad} tatuadores no tienen`} modalidad: no se le calcula arriendo. Asígnala en Tatuadores.
          </Notice>
        )}

        <div className="arriendos-filters" role="search" aria-label="Filtrar tatuadores">
          <label className="arriendos-filter-search">Buscar
            <input type="search" value={filters.q} onChange={(event) => updateFilter("q", event.target.value)} placeholder="Nombre del tatuador" maxLength={80} />
          </label>
          <label>Estado
            <select value={filters.estado} onChange={(event) => updateFilter("estado", event.target.value)}>
              {RENT_STATUS_FILTERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label>Modalidad
            <select value={filters.modalidad} onChange={(event) => updateFilter("modalidad", event.target.value)}>
              <option value="">Todas</option>
              {modalidades.map((item) => <option key={item} value={item}>{item}</option>)}
              {sinModalidad > 0 && <option value="__none">Sin modalidad</option>}
            </select>
          </label>
          <label>Ordenar
            <select value={filters.orden} onChange={(event) => updateFilter("orden", event.target.value)}>
              {RENT_SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <button type="button" className="reservation-button reservation-button-secondary" onClick={clearFilters} disabled={!hasFilters}>Limpiar</button>
        </div>

        <div className="arriendos-scroll">
          <table className="arriendos-table">
            <caption className="visually-hidden">Arriendo de {formatMonth(mes)} por tatuador</caption>
            <thead>
              <tr>
                <th scope="col">Tatuador</th>
                <th scope="col">Cálculo</th>
                <th scope="col" className="num">Arriendo</th>
                <th scope="col" className="num">Pagado</th>
                <th scope="col" className="num">Saldo</th>
                <th scope="col">Estado</th>
                <th scope="col"><span className="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {pagina.items.map((fila) => {
                const status = RENT_STATUS[fila.estado] ?? RENT_STATUS.pendiente;
                const expanded = open.has(fila.tatuadorId);
                return (
                  <Fragment key={fila.tatuadorId}>
                    <tr>
                      <th scope="row">
                        <span className="arriendo-name">{fila.tatuador}</span>
                        <span className="arriendo-sub">{fila.modalidad ?? "Sin modalidad"}{fila.activo ? "" : " · desactivado"}</span>
                      </th>
                      <td className="arriendo-detail">{rentDetail(fila)}</td>
                      <td className="num arriendo-strong">{formatPrice(fila.cargo)}</td>
                      <td className="num">{formatPrice(fila.pagado)}</td>
                      <td className={`num${fila.saldo > 0 ? " arriendo-due" : ""}`}>
                        {fila.saldo < 0 ? `A favor ${formatPrice(-fila.saldo)}` : formatPrice(fila.saldo)}
                      </td>
                      <td><span className={`arriendo-status arriendo-status--${status.tone}`}>{status.label}</span></td>
                      <td className="arriendo-actions">
                        {fila.pagos.length > 0 && (
                          <button type="button" className="reservation-button reservation-button-secondary" onClick={() => toggle(fila.tatuadorId)}
                            aria-expanded={expanded} aria-controls={`pagos-${fila.tatuadorId}`}>
                            Pagos ({fila.pagos.length})
                          </button>
                        )}
                        <button type="button" className="reservation-button" onClick={() => { setMessage(""); setPaying(fila); }}
                          aria-label={`Registrar pago de ${fila.tatuador}`}>Registrar pago</button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="arriendo-payments-row" id={`pagos-${fila.tatuadorId}`}>
                        <td colSpan={7}>
                          <ul className="arriendo-payments">
                            {fila.pagos.map((pago) => (
                              <li key={pago.id}>
                                <span>{formatDate(pago.pagadoEn)}</span>
                                <strong>{formatPrice(pago.monto)}</strong>
                                <span className="arriendo-sub">{pago.nota}</span>
                                <button type="button" className="arriendo-payment-delete" onClick={() => removePayment(fila, pago)}
                                  aria-label={`Borrar el pago de ${formatPrice(pago.monto)} del ${formatDate(pago.pagadoEn)}`}>Borrar</button>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {pagina.total === 0 && (
                <tr><td colSpan={7} className="arriendo-empty">
                  {filas.length ? "Ningún tatuador coincide con los filtros." : `No hay tatuadores con arriendo en ${formatMonth(mes)}.`}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        {pagina.total > 0 && (
          <nav className="arriendos-pager" aria-label="Páginas de tatuadores">
            <p aria-live="polite">
              {pagina.from}–{pagina.to} de {pagina.total} {pagina.total === 1 ? "tatuador" : "tatuadores"}
              {filas.length !== pagina.total && ` (filtrados de ${filas.length})`}
            </p>
            {pagina.pages > 1 && (
              <div className="arriendos-pager-buttons">
                <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setPage(pagina.page - 1)} disabled={pagina.page === 1}>‹ Anterior</button>
                <span>Página {pagina.page} de {pagina.pages}</span>
                <button type="button" className="reservation-button reservation-button-secondary" onClick={() => setPage(pagina.page + 1)} disabled={pagina.page === pagina.pages}>Siguiente ›</button>
              </div>
            )}
          </nav>
        )}

        {data.tarifas?.length > 0 && (
          <section className="arriendos-tarifas" aria-labelledby="tarifas-title">
            <h2 id="tarifas-title">Tarifas de {formatMonth(mes)}</h2>
            <ul>
              {data.tarifas.map((tarifa) => (
                <li key={tarifa.modalidad}><strong>{tarifa.modalidad}</strong>: {tariffText(tarifa)}</li>
              ))}
            </ul>
            <p className="arriendo-sub">Un turno es una sesión no cancelada; un día, una fecha con al menos una sesión. El mínimo del Rotativo cubre sus primeros turnos.</p>
          </section>
        )}
      </>}

      {paying && <PaymentModal fila={paying} mes={mes} onSave={savePayment} onClose={() => setPaying(null)} />}
      {confirmModal}
    </section>
  );
}
