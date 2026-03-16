import React, { useState, useEffect } from 'react'
import './ClientList.css'

function ClientList({ clients, onEdit, onDelete, loading = false }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredClients, setFilteredClients] = useState(clients)

  useEffect(() => {
    const filtered = clients.filter(client =>
      client.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (client.documento && client.documento.includes(searchTerm)) ||
      (client.telefono && client.telefono.includes(searchTerm))
    )
    setFilteredClients(filtered)
  }, [searchTerm, clients])

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
                <th className="actions-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.map(client => (
                <tr key={client.id} className="table-row">
                  <td className="document-cell">{client.documento}</td>
                  <td className="name-cell">{client.nombre}</td>
                  <td className="phone-cell">{client.telefono || '-'}</td>
                  <td className="actions-cell">
                    <button
                      onClick={() => onEdit(client)}
                      className="btn-edit"
                    >
                      ✏️ Editar
                    </button>
                    <button
                      onClick={() => onDelete(client.id)}
                      className="btn-delete"
                    >
                      🗑️ Eliminar
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

export default ClientList
