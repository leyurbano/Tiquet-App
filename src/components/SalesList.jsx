import React, { useState, useEffect, useRef } from 'react'
import './SalesList.css'
import { formatCOP } from '../utils/currencyFormatter'
import { getTodayColombia } from '../utils/dateFormatter'

function SalesList({ sales, clients = [], loading = false, onViewInvoice, onDelete, selectedDate, onDateChange }) {
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

  const formatDateLabel = (dateStr) => {
    // ✅ CORRECCIÓN: getTodayColombia() en vez de new Date()
    // new Date() usa UTC — a las 7 PM Colombia ya compara con el día siguiente
    const todayStr = getTodayColombia()
    if (dateStr === todayStr) return 'Hoy'
    const [y, m, d] = dateStr.split('-')
    return `${d}/${m}/${y}`
  }

  const handleDateButtonClick = () => {
    dateInputRef.current?.showPicker()
  }

  const handleDelete = (sale) => {
    const clientName = getClientName(sale.cliente_id)
    const confirmMsg = `¿Eliminar la venta #${sale.id} de ${clientName} por ${formatCOP(sale.total)}?\n\nEsto restaurará el stock de los productos.`
    if (window.confirm(confirmMsg)) {
      onDelete && onDelete(sale.id)
    }
  }

  if (loading) {
    return <div className="loading-text">⏳ Cargando ventas...</div>
  }

  return (
    <div className="sales-list-container">
      <h2 className="sales-list-title">Historial de Ventas</h2>

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
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map(sale => (
                  <tr key={sale.id} className="table-row">
                    <td>#{sale.id}</td>
                    <td>{getClientName(sale.cliente_id)}</td>
                    <td className="amount-cell">{formatCOP(sale.total || 0)}</td>
                    <td className="actions-cell">
                      <div className="actions-buttons">
                        <button
                          onClick={() => onViewInvoice && onViewInvoice(sale)}
                          className="btn-invoice"
                          title="Ver factura"
                        >
                          📄
                        </button>
                        <button
                          onClick={() => handleDelete(sale)}
                          className="btn-delete-sale"
                          title="Eliminar venta y restaurar stock"
                        >
                          🗑️
                        </button>
                      </div>
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