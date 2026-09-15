import React, { useState, useRef } from 'react'
import './SalesList.css'
import { formatCOP } from '../utils/currencyFormatter'
import { getTodayColombia } from '../utils/dateFormatter'
import AnularVentaModal from './AnularVentaModal'
import DevolucionModal from './DevolucionModal'

function SalesList({
  sales, clients = [], loading = false, onViewInvoice, onDelete, selectedDate, onDateChange,
  // Devoluciones: puedeDevolver lo decide SalesPage según el rol y el negocio
  puedeDevolver = false, mediosPago = [], esAdministrador = false, negocio = null, onDevuelta
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [anulando, setAnulando] = useState(null) // 🆕 venta pendiente de anular
  const [devolviendo, setDevolviendo] = useState(null) // venta de la que se devuelven productos
  const dateInputRef = useRef(null)

  const getClientName = (clienteId) => {
    if (!clienteId) return 'Sin cliente'
    const client = clients.find(c => c.id === clienteId)
    return client ? client.nombre : `Cliente #${clienteId}`
  }

  // Filtro derivado: se calcula en cada render en vez de copiarse a un estado
  // con useEffect, que agregaba un render de retraso
  const termino = searchTerm.toLowerCase()
  const filteredSales = sales.filter(sale =>
    getClientName(sale.cliente_id).toLowerCase().includes(termino) ||
    // Una venta sin cliente tiene cliente_id null: null.toString() rompía la lista
    String(sale.cliente_id ?? '').includes(searchTerm)
  )

  const totalDia = filteredSales.reduce((sum, sale) => sum + (sale.total || 0), 0)

  
  

const resumenPorMedio = filteredSales.reduce((acc, sale) => {
  const pagos = sale.pagos_venta || []
  if (pagos.length === 0) return acc // venta sin pagos registrados (no debería pasar, pero por seguridad)

  pagos.forEach(pago => {
    const nombre = pago.medios_pago?.pago || 'Sin definir'
    if (!acc[nombre]) acc[nombre] = { count: 0, total: 0 }
    acc[nombre].total += pago.monto || 0
  })

  // cuenta la venta 1 vez por cada medio distinto que use (para mixtos cuenta en ambos)
  const mediosUnicos = new Set(pagos.map(p => p.medios_pago?.pago || 'Sin definir'))
  mediosUnicos.forEach(nombre => acc[nombre].count += 1)

  return acc
}, {})
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

  // 🔧 CAMBIO: antes era un window.confirm. Ahora se pide el motivo, porque
  // anular ya no borra la venta sino que la deja registrada para auditoría.
  const handleDelete = (sale) => setAnulando(sale)

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
                        {puedeDevolver && (
                          <button
                            onClick={() => setDevolviendo(sale)}
                            className="btn-devolver-sale"
                            title="Registrar devolución de productos"
                          >
                            ↩️
                          </button>
                        )}
                        {onDelete && (
                          <button
                            onClick={() => handleDelete(sale)}
                            className="btn-delete-sale"
                            title="Anular venta y restaurar stock"
                          >
                            🗑️
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sales-cash-transfer-bar">
  {Object.entries(resumenPorMedio).map(([nombre, data]) => (
    <div key={nombre} className="sales-efectivo-bar">
      <span className="sales-efectivo-label">
        {nombre}: ({data.count} {data.count === 1 ? 'venta' : 'ventas'})
      </span>
      <span className="sales-total-tra">{formatCOP(data.total)}</span>
    </div>
  ))}
</div>

          <div className="sales-total-bar">
            <span className="sales-total-label">
              Total ({filteredSales.length} {filteredSales.length === 1 ? 'venta' : 'ventas'})
            </span>
            <span className="sales-total-amount">{formatCOP(totalDia)}</span>
          </div>
        </>
      )}

      {devolviendo && (
        <DevolucionModal
          sale={devolviendo}
          clientName={getClientName(devolviendo.cliente_id)}
          mediosPago={mediosPago}
          esAdministrador={esAdministrador}
          negocio={negocio}
          onCancel={() => setDevolviendo(null)}
          onDone={async (devolucion) => {
            setDevolviendo(null)
            if (onDevuelta) await onDevuelta(devolucion)
          }}
        />
      )}

      {anulando && (
        <AnularVentaModal
          sale={anulando}
          clientName={getClientName(anulando.cliente_id)}
          onCancel={() => setAnulando(null)}
          onConfirm={async (motivo) => {
            if (onDelete) await onDelete(anulando.id, motivo)
            setAnulando(null)
          }}
        />
      )}
    </div>
  )
}

export default SalesList