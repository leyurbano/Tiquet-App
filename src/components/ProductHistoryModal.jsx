import React, { useState, useEffect } from "react";
import { productService } from "../services/productService";
import {
  ShoppingCart,
  Pencil,
  Undo2,
  MapPin,
  X,
  ArrowRight,
} from "lucide-react";
import "./ProductHistoryModal.css";

const TIPO_CONFIG = {
  venta: { icon: ShoppingCart, label: "Venta", color: "#dc2626" },
  actualizacion: { icon: Pencil, label: "Actualización", color: "#2563eb" },
  reversion: { icon: Undo2, label: "Reversión", color: "#16a34a" },
};

function ProductHistoryModal({ product, onClose }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const data = await productService.getProductHistory(product.id);
      setHistory(data);
      setLoading(false);
    };
    load();
  }, [product.id]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const formatFecha = (iso) => {
    return new Date(iso).toLocaleString("es-CO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="phm-overlay" onClick={onClose}>
      <div className="phm-box" onClick={(e) => e.stopPropagation()}>
        <div className="phm-header">
          <div>
            <p className="phm-eyebrow">Historial de movimientos</p>
            <h2 className="phm-title">
              {(product.descripcion || "")
                .toLowerCase()
                .replace(/\b\w/g, (c) => c.toUpperCase())}
            </h2>
            <p className="phm-subtitle">
              Stock actual: <strong>{product.cantidad}</strong> unidades
            </p>
          </div>
          <button className="phm-close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="phm-body">
          {loading ? (
            <p className="phm-empty">⏳ Cargando historial...</p>
          ) : history.length === 0 ? (
            <p className="phm-empty">Sin movimientos registrados aún.</p>
          ) : (
            <div className="phm-timeline">
              {history.map((event, i) => {
                const cfg = TIPO_CONFIG[event.tipo_evento] || {
                  icon: MapPin,
                  label: event.tipo_evento,
                  color: "#6b7280",
                };
                const Icon = cfg.icon;
                const diff = event.diferencia;
                const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
                const diffColor = diff > 0 ? "#16a34a" : "#dc2626";

                return (
                  <div key={event.id} className="phm-item">
                    <div className="phm-dot" style={{ background: cfg.color }}>
                      <Icon size={16} color="white" />
                    </div>
                    {i < history.length - 1 && <div className="phm-line" />}

                    <div className="phm-card">
                      <div className="phm-card-top">
                        <span
                          className="phm-badge"
                          style={{
                            background: cfg.color + "18",
                            color: cfg.color,
                          }}
                        >
                          {cfg.label}
                        </span>
                        <span className="phm-date">
                          {formatFecha(event.created_at)}
                        </span>
                      </div>
                      <p className="phm-desc">{event.descripcion || "—"}</p>
                      <div className="phm-numbers">
                        <span className="phm-num">
                          <span className="phm-num-label">Antes</span>
                          <span className="phm-num-value">
                            {event.cantidad_anterior ?? "—"}
                          </span>
                        </span>
                        <ArrowRight size={16} color="#d1d5db" />
                        <span className="phm-num">
                          <span className="phm-num-label">Después</span>
                          <span className="phm-num-value">
                            {event.cantidad_nueva ?? "—"}
                          </span>
                        </span>
                        <span className="phm-num">
                          <span className="phm-num-label">Cambio</span>
                          <span
                            className="phm-num-value"
                            style={{ color: diffColor, fontWeight: 700 }}
                          >
                            {diff != null ? diffLabel : "—"}
                          </span>
                        </span>
                      </div>
                      {event.venta_id && (
                        <p className="phm-venta-ref">Venta #{event.venta_id}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductHistoryModal;
