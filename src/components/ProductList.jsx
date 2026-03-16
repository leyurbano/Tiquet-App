import React, { useState } from 'react'
import './ProductList.css'
import { formatCOP } from '../utils/currencyFormatter'

function ProductList({ products, onEdit, onDelete, loading = false }) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredProducts = (products || []).filter(product => {
    if (!searchTerm.trim()) return true
    return (product.descripcion || '').toLowerCase().includes(searchTerm.toLowerCase())
  })
  console.log('RENDER products:', products?.length, 'filtered:', filteredProducts?.length, 'loading:', loading)

  return (
    <div className="product-list-container">
      <h2 className="product-list-title">📋 Lista de Productos ({filteredProducts.length})</h2>

      <input
        type="text"
        placeholder="Buscar por descripción..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />

      {loading ? (
        <div className="loading-text">⏳ Cargando productos...</div>
      ) : filteredProducts.length === 0 ? (
        <p className="empty-message">No hay productos disponibles</p>
      ) : (
        <div className="table-wrapper">
          <table className="products-table">
            <thead>
              <tr className="table-header">
                <th className="header-numeric">#</th>
                <th className="header-description">Descripción</th>
                <th className="header-numeric">Stock</th>
                <th className="header-numeric">Costo Unit.</th>
                <th className="header-numeric">Costo Total</th>
                <th className="header-numeric">Precio Venta</th>
                <th className="header-actions">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product, index) => (
                <tr key={product.id} className="table-row">
                  <td className="cell-numeric">{index + 1}</td>
                  <td className="cell-description">
                    {(product.descripcion || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </td>
                  <td className="cell-numeric">{product.cantidad || 0}</td>
                  <td className="cell-numeric">{formatCOP(product.costo || 0)}</td>
                  <td className="cell-numeric">{formatCOP(product.costo_total || 0)}</td>
                  <td className="cell-numeric cell-price">
                    {product.precio_venta
                      ? formatCOP(product.precio_venta)
                      : <span style={{ color: '#9ca3af', fontSize: '12px' }}>Sin precio</span>
                    }
                  </td>
                  
                  <td className="cell-actions">
                    <button onClick={() => onEdit(product)} className="btn-edit">✏️ Editar</button>
                    <button onClick={() => onDelete(product.id)} className="btn-delete">🗑️ Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
            
          </table>
        </div>
      )}
    </div>
  )
}

export default ProductList