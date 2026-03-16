import React, { useState, useEffect } from 'react'
import ClientForm from '../components/ClientForm'
import ClientList from '../components/ClientList'
import { clientService } from '../services/clientService'
import './ClientsPage.css'

function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingClient, setEditingClient] = useState(null)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const data = await clientService.getAllClients()
    setClients(data)
    setLoading(false)
  }

  const handleAddClient = async (clientData) => {
    const newClient = await clientService.createClient(clientData)
    if (newClient) {
      setClients([newClient, ...clients])
    }
  }

  const handleUpdateClient = async (clientData) => {
    const updated = await clientService.updateClient(editingClient.id, clientData)
    if (updated) {
      setClients(clients.map(c => c.id === editingClient.id ? updated : c))
      setEditingClient(null)
    }
  }

  const handleDeleteClient = async (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este cliente?')) {
      const success = await clientService.deleteClient(id)
      if (success) {
        setClients(clients.filter(c => c.id !== id))
      }
    }
  }

  return (
    <div className="clients-page-container">
      <div className="clients-grid">
        {/* Formulario */}
        <div className="clients-form-column">
          <ClientForm 
            onSubmit={editingClient ? handleUpdateClient : handleAddClient}
            initialData={editingClient}
            onCancel={() => setEditingClient(null)}
          />
        </div>

        {/* Lista */}
        <div className="clients-list-column">
          <ClientList 
            clients={clients}
            onEdit={setEditingClient}
            onDelete={handleDeleteClient}
            loading={loading}
          />
        </div>
      </div>
    </div>
  )
}

export default ClientsPage
