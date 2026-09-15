import React, { useState } from 'react'
import './ClientList.css'
import { esConsumidorFinal } from '../utils/clientes'
import { formatCOP } from '../utils/currencyFormatter'

/**
 * saldos: { [cliente_id]: { saldo } } con el fiado de cada cliente, o null
 * si el fiado no está instalado (migración 26 sin correr): en ese caso no
 * se muestran la columna de saldo ni los botones de fiado.
 */
function ClientList({ clients, onEdit, onDelete, loading = false, saldos = null, onAbono, onHistorial }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [soloDeuda, setSoloDeuda] = useState(false)

  const conFiado = saldos !== null
  const saldoDe = (client) => Number(saldos?.[client.id]?.saldo) || 0

  // Filtro derivado en cada render: no hace falta copiarlo a un estado
  const termino = searchTerm.toLowerCase()
  const filteredClients = clients.filter(client =>
    (client.nombre.toLowerCase().includes(termino) ||
      (client.documento && client.documento.includes(searchTerm)) ||
      (client.telefono && client.telefono.includes(searchTerm))) &&
    (!soloDeuda || saldoDe(client) > 0)
  )

  const totalDeuda = conFiado
    ? Object.values(saldos).reduce((s, x) => s + Math.max(Number(x.saldo) || 0, 0), 0)
    : 0

  if (loading) {
    return <div className="loading-text">⏳ Cargando clientes...</div>
  }

  return (
    <div className="client-list-container">
      <h2 className="client-list-title">Lista de Clientes</h2>

      <input
        type="text"
        placeholder="Buscar por nombre, documento o teléfono..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="search-input"
      />

      {conFiado && (
        <label className="clients-filtro-deuda">
          <input
            type="checkbox"
            checked={soloDeuda}
            onChange={(e) => setSoloDeuda(e.target.checked)}
          />
          Solo clientes con deuda de fiado
          {totalDeuda > 0 && <span className="clients-total-deuda">· te deben {formatCOP(totalDeuda)}</span>}
        </label>
      )}

      {filteredClients.length === 0 ? (
        <p className="empty-message">No hay clientes disponibles</p>
      ) : (
        <div className="table-wrapper">
          <table className="clients-table">
            <thead>
              <tr className="table-header">
                <th>Documento</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                {conFiado && <th>Fiado</th>}
                <th className="actions-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => {
                const saldo = saldoDe(client)
                const cupo = Number(client.cupo_fiado) || 0
                return (
                  <tr key={client.id} className="table-row">
                    <td className="document-cell">{client.documento}</td>
                    <td className="name-cell">{client.nombre}</td>
                    <td className="phone-cell">{client.telefono || '-'}</td>
                    {conFiado && (
                      <td className="saldo-cell">
                        {saldo > 0 ? (
                          <span className="saldo-deuda">debe {formatCOP(saldo)}</span>
                        ) : saldo < 0 ? (
                          <span className="saldo-favor">{formatCOP(-saldo)} a favor</span>
                        ) : (
                          <span className="saldo-cero">—</span>
                        )}
                        {cupo > 0 && <span className="saldo-cupo">cupo {formatCOP(cupo)}</span>}
                      </td>
                    )}
                    <td className="actions-cell">
                      <button
                        onClick={() => onEdit(client)}
                        className="btn-edit"
                      >
                        ✏️ Editar
                      </button>
                      {conFiado && saldo > 0 && onAbono && (
                        <button onClick={() => onAbono(client, saldo)} className="btn-abono">
                          💵 Abonar
                        </button>
                      )}
                      {conFiado && saldos[client.id] && onHistorial && (
                        <button onClick={() => onHistorial(client)} className="btn-historial">
                          📋 Fiado
                        </button>
                      )}
                      {/* onDelete llega null si el usuario no es administrador */}
                      {onDelete && !esConsumidorFinal(client) && (
                        <button
                          onClick={() => onDelete(client)}
                          className="btn-delete"
                        >
                          🗑️ Eliminar
                        </button>
                      )}
                      {esConsumidorFinal(client) && (
                        <span className="cliente-fijo" title="Lo usa la venta rápida: no se puede eliminar">
                          Venta rápida
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default ClientList
