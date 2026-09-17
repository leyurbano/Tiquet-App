import React, { useState, useRef } from "react";
import "./ProductList.css";
import { formatCOP } from "../utils/currencyFormatter";
import ProductHistoryModal from "./ProductHistoryModal";
import Paginacion from "./Paginacion";
import { Pencil, History, Package, AlertTriangle } from "lucide-react";
import { estadoStock, contarBajos, umbralDe } from "../utils/stock";
import { numeroProducto, coincideNumero } from "../utils/producto";

// 25 y no 50: sin scroll interno, 50 filas son casi tres pantallas y la
// paginación queda al fondo. Para buscar algo puntual está el buscador
const POR_PAGINA = 25;

// El orden lo elige el usuario. Por defecto, por número: es la costumbre de
// quien ya se sabe el catálogo. "Más recientes" evita que un producto recién
// creado quede escondido en la última página.
const ORDENES = {
  numero: {
    etiqueta: "Número (1, 2, 3…)",
    comparar: (a, b) => numeroProducto(a) - numeroProducto(b),
  },
  recientes: {
    etiqueta: "Más recientes",
    comparar: (a, b) => numeroProducto(b) - numeroProducto(a),
  },
  nombre: {
    etiqueta: "Nombre (A → Z)",
    comparar: (a, b) =>
      (a.descripcion || "").localeCompare(b.descripcion || "", "es"),
  },
  stock: {
    etiqueta: "Menos stock primero",
    comparar: (a, b) => (a.cantidad || 0) - (b.cantidad || 0),
  },
};

/**
 * Lista del catálogo. Recibe TODOS los productos (los totales y las alertas
 * de stock se calculan sobre el catálogo completo) y pinta 50 por página:
 * pintar miles de filas a la vez es lo que volvía lenta la pantalla.
 */
function ProductList({ products, onEdit, loading = false, minimoNegocio = 0, mostrarCostos = false }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [orden, setOrden] = useState("numero");
  const [historyProduct, setHistoryProduct] = useState(null);
  const [soloBajos, setSoloBajos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const inicioLista = useRef(null);

  const alertas = contarBajos(products || [], minimoNegocio);
  const totalAlertas = alertas.agotados + alertas.bajos;

  const termino = searchTerm.trim().toLowerCase();
  const filteredProducts = (products || []).filter((product) => {
    if (soloBajos && estadoStock(product, minimoNegocio) === "ok") return false;
    if (!termino) return true;
    return (
      (product.descripcion || "").toLowerCase().includes(termino) ||
      coincideNumero(product, termino)
    );
  });

  // Copia antes de ordenar: sort modifica el arreglo original
  const ordenados = [...filteredProducts].sort(ORDENES[orden].comparar);

  // Si la lista se achica (búsqueda, filtro, recarga), la página se ajusta sola
  const totalPaginas = Math.max(Math.ceil(ordenados.length / POR_PAGINA), 1);
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = ordenados.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  );

  const cambiarPagina = (nueva) => {
    setPagina(nueva);
    inicioLista.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const totalProducts = (products || []).reduce(
    (sum, product) => sum + (product.cantidad || 0),
    0,
  );
  // Solo los administradores reciben los costos desde la base de datos
  const totalInventoryValue = (products || []).reduce(
    (sum, product) => sum + (Number(product.costo_total) || 0),
    0,
  );

  return (
    <div className="product-list-container" ref={inicioLista}>
      <h2 className="product-list-title">
        <Package size={22} /> Lista de Productos ({filteredProducts.length})
      </h2>

      <div className="search-and-stats-wrapper">
        <input
          type="text"
          placeholder="Buscar por descripción o número..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPagina(1);
          }}
          className="search-input"
        />
        <label className="orden-campo">
          <span className="orden-etiqueta">Ordenar por</span>
          <select
            value={orden}
            onChange={(e) => {
              setOrden(e.target.value);
              setPagina(1);
            }}
            className="orden-select"
          >
            {Object.entries(ORDENES).map(([clave, o]) => (
              <option key={clave} value={clave}>{o.etiqueta}</option>
            ))}
          </select>
        </label>
        <div className="stats-container">
          <div className="stat-label">
            <span className="stat-label-text">Unidades en stock:</span>
            <span className="stat-value">{totalProducts}</span>
          </div>
          {mostrarCostos && (
            <div className="stat-label">
              <span className="stat-label-text">Valor Inventario:</span>
              <span className="stat-value">{formatCOP(totalInventoryValue)}</span>
            </div>
          )}
        </div>
      </div>

      {totalAlertas > 0 && (
        <button
          className={`stock-alert-bar ${soloBajos ? "stock-alert-activa" : ""}`}
          onClick={() => {
            setSoloBajos((v) => !v);
            setPagina(1);
          }}
        >
          <AlertTriangle size={16} />
          <span>
            {alertas.agotados > 0 && (
              <strong>{alertas.agotados} agotado{alertas.agotados !== 1 ? "s" : ""}</strong>
            )}
            {alertas.agotados > 0 && alertas.bajos > 0 && " · "}
            {alertas.bajos > 0 && (
              <span>{alertas.bajos} por agotarse</span>
            )}
          </span>
          <span className="stock-alert-accion">
            {soloBajos ? "Ver todos" : "Ver solo estos"}
          </span>
        </button>
      )}

      {loading ? (
        <div className="loading-text">⏳ Cargando productos...</div>
      ) : filteredProducts.length === 0 ? (
        <p className="empty-message">
          {soloBajos
            ? "No hay productos por agotarse"
            : "No hay productos disponibles"}
        </p>
      ) : (
        <>
          <div className="pl-tabla-wrap">
            <table className="products-table">
              <thead>
                <tr className="table-header">
                  <th style={{ textAlign: 'right' }}>#</th>
                  <th style={{ textAlign: 'left' }}>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  {mostrarCostos && (
                    <>
                      <th style={{ textAlign: 'right' }} className="hide-mobile">Costo Unit.</th>
                      <th style={{ textAlign: 'right' }} className="hide-mobile">Costo Total</th>
                    </>
                  )}
                  <th style={{ textAlign: 'right' }}>Precio Venta</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((product) => {
                  const estado = estadoStock(product, minimoNegocio);
                  return (
                  <tr key={product.id} className={`table-row fila-${estado}`}>
                    <td className="cell-numeric">{numeroProducto(product)}</td>
                    <td className="cell-description">
                      {(product.descripcion || "")
                        .toLowerCase()
                        .replace(/\b\w/g, (c) => c.toUpperCase())}
                    </td>
                    <td className="cell-numeric">
                      <span className={`stock-valor stock-${estado}`}>
                        {product.cantidad || 0}
                      </span>
                      {estado !== "ok" && (
                        <div className="stock-minimo">
                          mín. {umbralDe(product, minimoNegocio)}
                        </div>
                      )}
                    </td>
                    {mostrarCostos && (
                      <>
                        <td className="cell-numeric hide-mobile">
                          {formatCOP(product.costo || 0)}
                        </td>
                        <td className="cell-numeric hide-mobile">
                          {formatCOP(product.costo_total || 0)}
                        </td>
                      </>
                    )}
                    <td className="cell-numeric cell-price">
                      {product.precio_venta ? (
                        formatCOP(product.precio_venta)
                      ) : (
                        <span style={{ color: "#9ca3af", fontSize: "12px" }}>
                          Sin precio
                        </span>
                      )}
                    </td>
                    <td className="cell-actions">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(product)}
                          className="btn-edit"
                          title="Editar producto"
                          aria-label={`Editar ${product.descripcion}`}
                        >
                          {/* El texto va en <span>: en celular se oculta y
                              queda solo el ícono */}
                          <Pencil size={14} aria-hidden="true" /> <span>Editar</span>
                        </button>
                      )}
                      {/* Botón eliminar deshabilitado: evita romper el historial de productos con ventas asociadas */}
                      <button
                        onClick={() => setHistoryProduct(product)}
                        className="btn-history"
                        title="Ver historial de movimientos"
                        aria-label={`Historial de ${product.descripcion}`}
                      >
                        <History size={14} aria-hidden="true" /> <span>Historial</span>
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Paginacion
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            total={filteredProducts.length}
            porPagina={POR_PAGINA}
            onCambiar={cambiarPagina}
          />
        </>
      )}

      {historyProduct && (
        <ProductHistoryModal
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </div>
  );
}

export default ProductList;
