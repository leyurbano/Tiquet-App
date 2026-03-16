import React, { useState, useEffect } from 'react'
import './SalesList.css'
import { formatCOP } from '../utils/currencyFormatter'

function SalesList({ sales, loading = false }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredSales, setFilteredSales] = useState(sales)

  useEffect(() => {
    const filtered = sales.filter(sale =>
      (sale.customer_name && sale.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (sale.customer_phone && sale.customer_phone.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    setFilteredSales(filtered)
  }, [searchTerm, sales])

  if (loading) {
    return <div className="loading-text">⏳ Cargando ventas...</div>
  }

  return (
    <div className="sales-list-container">
      <h2 className="sales-list-title">Historial de Ventas</h2>

      <input
        type="text"
        placeholder="Buscar por cliente o email..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />

      {filteredSales.length === 0 ? (
        <p className="empty-message">No hay ventas registradas</p>
      ) : (
        <div className="table-wrapper">
          <table className="sales-table">
            <thead>
              <tr className="table-header">
                <th>ID</th>
                <th>Cliente</th>
                <th>Teléfono</th>
                <th className="amount-cell">Monto</th>
                <th>Método</th>
                <th>Estado</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map(sale => (
                <tr key={sale.id} className="table-row">
                  <td>#{sale.id}</td>
                  <td>{sale.customer_name}</td>
                  <td>{sale.customer_phone}</td>
                  <td className="amount-cell">{formatCOP(sale.total_amount)}</td>
                  <td>{sale.payment_method}</td>
                  <td>
                    <span className={`status-badge status-${sale.status}`}>
                      {sale.status}
                    </span>
                  </td>
                  <td>{new Date(sale.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default SalesList
