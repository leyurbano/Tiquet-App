import React, { useState, useRef } from 'react'
import './ClientList.css'
import { esConsumidorFinal } from '../utils/clientes'
import { formatCOP } from '../utils/currencyFormatter'
import MenuAcciones from './MenuAcciones'
import Paginacion from './Paginacion'
import { useEsCelular } from '../hooks/useEsCelular'
import { Pencil, Banknote, Receipt, Wallet, Trash2, AlertTriangle, Users, Loader2 } from 'lucide-react'

// Igual que en Productos: sin paginar, cientos de filas se pintaban de una
// vez y la lista se volvía lenta y larguísima en el celular
const POR_PAGINA = 25

/**
 * saldos: { [cliente_id]: { saldo } } con el fiado de cada cliente, o null
 * si el fiado no está instalado (migración 26 sin correr): en ese caso no
 * se muestran la columna de saldo ni las opciones de fiado.
 *
 * 🔧 Antes cada fila podía terminar con cinco botones de colores distintos,
 * que se apilaban en varias líneas (y en celular quedaban en columna). Ahora
 * quedan visibles las acciones del día a día, con los mismos colores y el
 * mismo orden que en Productos (Editar amarillo, Abonar verde como Stock,
 * Compras azul como Historial), y el resto vive en el menú "⋯": Ver fiado
 * y, solo para administradores, Eliminar de último.
 */
function ClientList({ clients, onEdit, onDelete, loading = false, errorCarga = false, saldos = null, onAbono, onHistorial, onCompras }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [soloDeuda, setSoloDeuda] = useState(false)
  const [pagina, setPagina] = useState(1)
  const inicioLista = useRef(null)
  const esCelular = useEsCelular()

  const conFiado = saldos !== null
  const saldoDe = (client) => Number(saldos?.[client.id]?.saldo) || 0

  const deudores = conFiado ? Object.values(saldos).filter((s) => Number(s.saldo) > 0) : []
  const totalDeuda = deudores.reduce((s, x) => s + Number(x.saldo), 0)
  // Si pagaron todo mientras el filtro estaba puesto, la lista no puede
  // quedar vacía y sin forma de volver
  const filtrarDeuda = soloDeuda && deudores.length > 0

  // Filtro derivado en cada render: no hace falta copiarlo a un estado
  const termino = searchTerm.trim().toLowerCase()
  const filteredClients = clients.filter(client =>
    ((client.nombre || '').toLowerCase().includes(termino) ||
      (client.documento && client.documento.toLowerCase().includes(termino)) ||
      (client.telefono && client.telefono.includes(termino))) &&
    (!filtrarDeuda || saldoDe(client) > 0)
  )

  // Si la lista se achica (búsqueda, filtro, borrado), la página se ajusta sola
  const totalPaginas = Math.max(Math.ceil(filteredClients.length / POR_PAGINA), 1)
  const paginaActual = Math.min(pagina, totalPaginas)
  const visibles = filteredClients.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA
  )

  const cambiarPagina = (nueva) => {
    setPagina(nueva)
    inicioLista.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Por qué la lista está vacía: no es lo mismo que la búsqueda no encuentre
  // nada a que el negocio no tenga clientes o que la carga haya fallado
  const mensajeVacio = errorCarga
    ? 'No se pudieron cargar los clientes. Recarga la página.'
    : termino
      ? `Ningún cliente coincide con «${searchTerm.trim()}»`
      : 'Todavía no hay clientes. Crea el primero con «Nuevo Cliente».'

  // Acciones que no son del día a día: van en el menú "⋯"
  const accionesDe = (client) => {
    const acciones = []
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

  return (
    <div className="client-list-container" ref={inicioLista}>
      <h2 className="client-list-title">
        <Users size={20} aria-hidden="true" /> Lista de Clientes
        {!loading && ` (${filteredClients.length})`}
      </h2>

      {/* En celular el texto completo no cabe y se cortaba */}
      <input
        type="text"
        aria-label="Buscar por nombre, documento o teléfono"
        placeholder={esCelular ? 'Nombre, documento o teléfono' : 'Buscar por nombre, documento o teléfono...'}
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value)
          setPagina(1)
        }}
        className="cl-buscador"
      />

      {/* 🔧 Antes era un check suelto entre el buscador y la tabla, que salía
          aunque nadie debiera. Ahora es una barra como la de stock bajo en
          Productos, y solo aparece cuando hay algo que cobrar */}
      {deudores.length > 0 && (
        <button
          type="button"
          className={`deuda-bar ${soloDeuda ? 'deuda-bar-activa' : ''}`}
          onClick={() => {
            setSoloDeuda((v) => !v)
            setPagina(1)
          }}
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

      {/* 🔧 Antes, mientras cargaba, desaparecía toda la tarjeta (título y
          buscador incluidos) y la página saltaba al volver */}
      {loading ? (
        <div className="cl-cargando">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Cargando clientes...
        </div>
      ) : filteredClients.length === 0 ? (
        <p className="cl-vacio">{mensajeVacio}</p>
      ) : (
        <>
        <div className="cl-tabla-wrap">
          <table className="clients-table">
            <thead>
              <tr className="cl-cabecera">
                <th>Documento</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                {conFiado && <th>Fiado</th>}
                <th className="cl-acciones-th">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(client => {
                const saldo = saldoDe(client)
                const cupo = Number(client.cupo_fiado) || 0
                const acciones = accionesDe(client)
                return (
                  <tr key={client.id} className="cl-fila">
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
                    <td className="cl-acciones">
                      {/* El flex va en un div y no en el td: un td con
                          display:flex deja de ser celda y descuadra la fila.
                          aria-label con el nombre: en celular el texto del
                          botón se oculta y queda solo el ícono */}
                      <div className="cl-acciones-fila">
                        <button
                          onClick={() => onEdit(client)}
                          className="btn-cliente btn-cliente-editar"
                          title="Editar cliente"
                          aria-label={`Editar a ${client.nombre}`}
                        >
                          <Pencil size={14} aria-hidden="true" /> <span>Editar</span>
                        </button>

                        {conFiado && saldo > 0 && onAbono && (
                          <button
                            onClick={() => onAbono(client, saldo)}
                            className="btn-cliente btn-cliente-abonar"
                            title="Registrar un abono a la deuda"
                            aria-label={`Registrar un abono de ${client.nombre}`}
                          >
                            <Banknote size={14} aria-hidden="true" /> <span>Abonar</span>
                          </button>
                        )}

                        {/* Como "Historial" en Productos: antes estaba en el
                            menú "⋯" y pedía dos toques para algo que se mira
                            seguido. El Consumidor final no la tiene: junta
                            las compras de todos los que no se identifican */}
                        {onCompras && !esConsumidorFinal(client) && (
                          <button
                            onClick={() => onCompras(client)}
                            className="btn-cliente btn-cliente-compras"
                            title="Ver lo que ha comprado"
                            aria-label={`Compras de ${client.nombre}`}
                          >
                            <Receipt size={14} aria-hidden="true" /> <span>Compras</span>
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
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <Paginacion
          pagina={paginaActual}
          totalPaginas={totalPaginas}
          total={filteredClients.length}
          porPagina={POR_PAGINA}
          onCambiar={cambiarPagina}
        />
        </>
      )}
    </div>
  )
}

export default ClientList
