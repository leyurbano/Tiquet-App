import React, { useState, useEffect } from "react";
import "./MixedPaymentModal.css";
import { formatCOP } from "../utils/currencyFormatter";

/**
 * Modal para registrar un pago mixto (ej. parte en efectivo, parte en transferencia).
 *
 * Props:
 * - total: número, total de la venta (solo lectura)
 * - mediosPago: array de { id, nombre } traídos de la tabla medios_pago
 *   (excluye "Sin definir" desde donde se llame este componente)
 * - onConfirm: (pagos: [{ medio_pago_id, monto }]) => void
 * - onClose: () => void
 */
function MixedPaymentModal({ total, mediosPago, onConfirm, onClose }) {
  const [montos, setMontos] = useState(() =>
    Object.fromEntries(mediosPago.map((m) => [m.id, ""])),
  );

  const sumaActual = Object.values(montos).reduce(
    (sum, val) => sum + (parseFloat(val) || 0),
    0,
  );

  const diferencia = total - sumaActual;
  const cuadra = Math.abs(diferencia) < 0.01 && sumaActual > 0;

  const handleMontoChange = (medioId, value) => {
    // Solo números y punto decimal
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) return;
    setMontos((prev) => ({ ...prev, [medioId]: value }));
  };

  const handleConfirm = () => {
    if (!cuadra) return;

    const pagos = mediosPago
      .filter((m) => parseFloat(montos[m.id]) > 0)
      .map((m) => ({
        medio_pago_id: m.id,
        monto: parseFloat(montos[m.id]),
      }));

    onConfirm(pagos);
  };

  // Cerrar con Escape
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  return (
    <div className="mpm-overlay" onClick={onClose}>
      <div className="mpm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mpm-header">
          <h3 className="mpm-title">💳 Pago Mixto</h3>
          <button
            type="button"
            className="mpm-close"
            onClick={onClose}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="mpm-total-row">
          <span>Total a pagar</span>
          <span className="mpm-total-amount">{formatCOP(total)}</span>
        </div>

        <div className="mpm-inputs">
          {mediosPago.map((medio) => (
            <div className="mpm-input-group" key={medio.id}>
              <label className="mpm-label">{medio.pago}</label>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={montos[medio.id]}
                onChange={(e) => handleMontoChange(medio.id, e.target.value)}
                className="mpm-input"
              />
            </div>
          ))}
        </div>

        <div
          className={`mpm-balance ${cuadra ? "mpm-balance-ok" : "mpm-balance-pending"}`}
        >
          {cuadra ? (
            <span>✅ Cuadra con el total</span>
          ) : sumaActual === 0 ? (
            <span>Ingresa los montos por cada medio de pago</span>
          ) : diferencia > 0 ? (
            <span>Faltan {formatCOP(diferencia)}</span>
          ) : (
            <span>Sobran {formatCOP(Math.abs(diferencia))}</span>
          )}
        </div>

        <div className="mpm-buttons">
          <button
            type="button"
            className="mpm-btn-confirm"
            disabled={!cuadra}
            onClick={handleConfirm}
          >
            Confirmar Pago
          </button>
          <button type="button" className="mpm-btn-cancel" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default MixedPaymentModal;