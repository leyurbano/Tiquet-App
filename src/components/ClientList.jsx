import React, { useState } from 'react'
import './ClientList.css'
import { esConsumidorFinal } from '../utils/clientes'
import { formatCOP } from '../utils/currencyFormatter'
import MenuAcciones from './MenuAcciones'
import { Pencil, Banknote, Receipt, Wallet, Trash2, AlertTriangle } from 'lucide-react'

/**
 * saldos: { [cliente_id]: { saldo } } con el fiado de cada cliente, o null
 * si el fiado no está instalado (migración 26 sin correr): en ese caso no
 * se muestran la columna de saldo ni las opciones de fiado.
 *
 * 🔧 Antes cada fila podía terminar con cinco botones de colores distintos,
 * que se apilaban en varias líneas (y en celular quedaban en columna). Ahora
 * quedan visibles las dos acciones del día a día —Editar y Abonar— y el
 * resto vive en el menú "⋯", con Eliminar de último.
 */
function ClientList({ clients, onEdit, onDelete, loading = false, saldos = null, onAbono, onHistorial, onCompras }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [soloDeuda, setSoloDeuda] = useState(false)

  const conFiado = saldos !== null
  const saldoDe = (client) => Number(saldos?.[client.id]?.saldo) || 0

  const deudores = conFiado ? Object.values(saldos).filter((s) => Number(s.saldo) > 0) : []
  const totalDeuda = deudores.reduce((s, x) => s + Number(x.saldo), 0)
  // Si pagaron todo mientras el filtro estaba puesto, la lista no puede
  // quedar vacía y sin forma de volver
  const filtrarDeuda = soloDeuda && deudores.length > 0

  // Filtro derivado en cada render: no hace falta copiarlo a un estado
  const termino = searchTerm.toLowerCase()
  const filteredClients = clients.filter(client =>
    (client.nombre.toLowerCase().includes(termino) ||
      (client.documento && client.documento.includes(searchTerm)) ||
      (client.telefono && client.telefono.includes(searchTerm))) &&
    (!filtrarDeuda || saldoDe(client) > 0)
  )

  // Acciones que no son del día a día: van en el menú "⋯"
  const accionesDe = (client) => {
    const acciones = []
    if (onCompras && !esConsumidorFinal(client)) {
      acciones.push({
        clave: 'compras', etiqueta: 'Ver compras', icono: Receipt,
        onClick: () => onCompras(client)
      })
    }
    if (conFiado && saldos[client.id] && onHistorial) {
      acciones.push({
        clave: 'fiado', etiqueta: 'Ver fiado', icono: Wallet,
        onClick: () => onHistorial(client)
      })
    }
    // onDelete llega null si el usuario no es administrador
    if (onDelete && !esConsumidorFinal(client)) {
      acciones.push({
        clave: 'eliminar', etiqueta: 'Eliminar', icono: Trash2,
        onClick: () => onDelete(client), peligro: true
      })
    }
    return acciones
  }

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

      {/* 🔧 Antes era un check suelto entre el buscador y la tabla, que salía
          aunque nadie debiera. Ahora es una barra como la de stock bajo en
          Productos, y solo aparece cuando hay algo que cobrar */}
      {deudores.length > 0 && (
        <button
          type="button"
          className={`deuda-bar ${soloDeuda ? 'deuda-bar-activa' : ''}`}
          onClick={() => setSoloDeuda((v) => !v)}
          aria-pressed={soloDeuda}
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            <strong>{deudores.length}</strong>{' '}
            {deudores.length === 1 ? 'cliente te debe' : 'clientes te deben'}{' '}
            <strong>{formatCOP(totalDeuda)}</strong>
          </span>
          <span className="deuda-bar-accion">{soloDeuda ? 'Ver todos' : 'Ver solo estos'}</span>
        </button>
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
                const acciones = accionesDe(client)
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
                        className="btn-cliente btn-cliente-editar"
                        title="Editar cliente"
                      >
                        <Pencil size={14} aria-hidden="true" /> <span>Editar</span>
                      </button>

                      {conFiado && saldo > 0 && onAbono && (
                        <button
                          onClick={() => onAbono(client, saldo)}
                          className="btn-cliente btn-cliente-abonar"
                          title="Registrar un abono a la deuda"
                        >
                          <Banknote size={14} aria-hidden="true" /> <span>Abonar</span>
                        </button>
                      )}

                      {acciones.length > 0 && (
                        <MenuAcciones items={acciones} etiqueta={`Más acciones de ${client.nombre}`} />
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
