import React, { useState, useEffect, useRef } from 'react'
import './SalesList.css'
import { formatCOP } from '../utils/currencyFormatter'

function SalesList({ sales, clients = [], loading = false, onViewInvoice, selectedDate, onDateChange }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredSales, setFilteredSales] = useState(sales)
  const dateInputRef = useRef(null)

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

  const totalDia = filteredSales.reduce((sum, sale) => sum + (sale.total || 0), 0)

  // Muestra "Hoy" si es hoy, si no "DD/MM/YYYY"
  const formatDateLabel = (dateStr) => {
    const today = new Date()
    const yyyy = today.getFullYear()
    const mm = String(today.getMonth() + 1).padStart(2, '0')
    const dd = String(today.getDate()).padStart(2, '0')
    const todayStr = `${yyyy}-${mm}-${dd}`
    if (dateStr === todayStr) return 'Hoy'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  const handleDateButtonClick = () => {
    dateInputRef.current?.showPicker()
  }

  if (loading) {
    return <div className="loading-text">⏳ Cargando ventas...</div>
  }

  return (
    <div className="sales-list-container">
      <h2 className="sales-list-title">Historial de Ventas</h2>

      {/* Barra de búsqueda + botón fecha */}
      <div className="sales-search-bar">
        <input
          type="text"
          placeholder="Buscar cliente..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <div className="date-picker-wrapper">
          <button
            className="btn-date"
            onClick={handleDateButtonClick}
            title="Seleccionar fecha"
          >
            📅 {formatDateLabel(selectedDate)}
          </button>
          <input
            ref={dateInputRef}
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="date-input-hidden"
          />
        </div>
      </div>

      {filteredSales.length === 0 ? (
        <p className="empty-message">
          📭 No hay ventas para el {formatDateLabel(selectedDate) === 'Hoy' ? 'día de hoy' : formatDateLabel(selectedDate)}
        </p>
      ) : (
        <>
          <div className="table-wrapper">
            <table className="sales-table">
              <thead>
                <tr className="table-header">
                  <th>ID</th>
                  <th>Cliente</th>
                  <th className="amount-cell">Monto</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map(sale => (
                  <tr key={sale.id} className="table-row">
                    <td>#{sale.id}</td>
                    <td>{getClientName(sale.cliente_id)}</td>
                    <td className="amount-cell">{formatCOP(sale.total || 0)}</td>
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

          <div className="sales-total-bar">
            <span className="sales-total-label">
              Total ({filteredSales.length} {filteredSales.length === 1 ? 'venta' : 'ventas'})
            </span>
            <span className="sales-total-amount">{formatCOP(totalDia)}</span>
          </div>
        </>
      )}
    </div>
  )
}

export default SalesList