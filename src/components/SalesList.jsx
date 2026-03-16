import React, { useState, useEffect } from 'react'
import './SalesList.css'
import { formatCOP } from '../utils/currencyFormatter'

function SalesList({ sales, clients = [], loading = false, onViewInvoice }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredSales, setFilteredSales] = useState(sales)

  // Función para obtener el nombre del cliente
  const getClientName = (clienteId) => {
    if (!clienteId) return 'Sin cliente'
    const client = clients.find(c => c.id === clienteId)
    return client ? client.nombre : `Cliente #${clienteId}`
  }

  useEffect(() => {
    const filtered = sales.filter(sale => {
      const clientName = getClientName(sale.cliente_id).toLowerCase()
      return clientName.includes(searchTerm.toLowerCase()) || 
             sale.cliente_id.toString().includes(searchTerm)
    })
    setFilteredSales(filtered)
  }, [searchTerm, sales, clients])

  if (loading) {
    return <div className="loading-text">⏳ Cargando ventas del día...</div>
  }

  return (
    <div className="sales-list-container">
      <h2 className="sales-list-title">Historial de Ventas del Día</h2>

      <input
        type="text"
        placeholder="Buscar por nombre de cliente..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />

      {filteredSales.length === 0 ? (
        <p className="empty-message">No hay ventas registradas hoy</p>
      ) : (
        <div className="table-wrapper">
          <table className="sales-table">
            <thead>
              <tr className="table-header">
                <th>ID</th>
                <th>Cliente</th>
                <th className="amount-cell">Monto</th>
                <th>Fecha</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredSales.map(sale => (
                <tr key={sale.id} className="table-row">
                  <td>#{sale.id}</td>
                  <td>{getClientName(sale.cliente_id)}</td>
                  <td className="amount-cell">{formatCOP(sale.total || 0)}</td>
                  <td>{new Date(sale.fecha).toLocaleString()}</td>
                  <td>
                    <button 
                      onClick={() => onViewInvoice && onViewInvoice(sale)}
                      className="btn-invoice"
                      title="Ver factura"
                    >
                      📄 Factura
                    </button>
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

export default SalesList
