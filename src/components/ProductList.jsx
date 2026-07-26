import React, { useState, useEffect } from "react";
import "./ProductList.css";
import { formatCOP } from "../utils/currencyFormatter";
import ProductHistoryModal from "./ProductHistoryModal";
import { Pencil, Trash2, History, Package } from "lucide-react";

function ProductList({ products, onEdit, onDelete, loading = false }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [historyProduct, setHistoryProduct] = useState(null);

  const filteredProducts = (products || []).filter((product) => {
    if (!searchTerm.trim()) return true;
    return (product.descripcion || "")
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
  });

  const totalProducts = products.reduce(
    (sum, product) => sum + (product.cantidad || 0),
    0,
  );
  const totalInventoryValue = products.reduce(
    (sum, product) => sum + (product.costo_total || 0),
    0,
  );

  return (
    <div className="product-list-container">
      <h2 className="product-list-title">
        <Package size={22} /> Lista de Productos ({filteredProducts.length})
      </h2>

      <div className="search-and-stats-wrapper">
        <input
          type="text"
          placeholder="Buscar por descripción..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <div className="stats-container">
          <div className="stat-label">
            <span className="stat-label-text">Total Productos:</span>
            <span className="stat-value">{totalProducts}</span>
          </div>
          <div className="stat-label">
            <span className="stat-label-text">Valor Inventario:</span>
            <span className="stat-value">{formatCOP(totalInventoryValue)}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-text">⏳ Cargando productos...</div>
      ) : filteredProducts.length === 0 ? (
        <p className="empty-message">No hay productos disponibles</p>
      ) : (
        <div className="table-wrapper">
          <table className="products-table">
            <thead>
  <tr className="table-header">
    <th style={{ textAlign: 'right' }}>#</th>
    <th style={{ textAlign: 'left' }}>Descripción</th>
    <th style={{ textAlign: 'right' }}>Stock</th>
    <th style={{ textAlign: 'right' }} className="hide-mobile">Costo Unit.</th>
    <th style={{ textAlign: 'right' }} className="hide-mobile">Costo Total</th>
    <th style={{ textAlign: 'right' }}>Precio Venta</th>
    <th style={{ textAlign: 'center' }}>Acciones</th>
  </tr>
</thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id} className="table-row">
                  <td className="cell-numeric">{product.id}</td>
                  <td className="cell-description">
                    {(product.descripcion || "")
                      .toLowerCase()
                      .replace(/\b\w/g, (c) => c.toUpperCase())}
                  </td>
                  <td className="cell-numeric">{product.cantidad || 0}</td>
                  <td className="cell-numeric hide-mobile">
                    {formatCOP(product.costo || 0)}
                  </td>
                  <td className="cell-numeric hide-mobile">
                    {formatCOP(product.costo_total || 0)}
                  </td>
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
                    <button
                      onClick={() => onEdit(product)}
                      className="btn-edit"
                    >
                      <Pencil size={14} /> Editar
                    </button>
                    <button
                      onClick={() => onDelete(product.id)}
                      className="btn-delete"
                    >
                      <Trash2 size={14} /> Eliminar
                    </button>
                    <button
                      onClick={() => setHistoryProduct(product)}
                      className="btn-history"
                    >
                      <History size={14} /> Historial
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
