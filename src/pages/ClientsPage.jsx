import React, { useState, useEffect } from 'react'
import ClientForm from '../components/ClientForm'
import ClientList from '../components/ClientList'
import { clientService } from '../services/clientService'
import './ClientsPage.css'
import { PlusCircle } from 'lucide-react'

function ClientsPage() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingClient, setEditingClient] = useState(null)
  const [showForm, setShowForm] = useState(false)
  // Hay cambios escritos sin guardar en el modal
  const [formSucio, setFormSucio] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const data = await clientService.getAllClients()
    setClients(data)
    setLoading(false)
  }

  const closeForm = ({ forzar = false } = {}) => {
    // Un clic en el fondo o un Escape no deberían borrar lo escrito sin avisar
    if (!forzar && formSucio &&
        !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) {
      return
    }
    setShowForm(false)
    setEditingClient(null)
    setFormSucio(false)
  }

  useEffect(() => {
    if (!showForm) return

    document.body.style.overflow = 'hidden'
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeForm()
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', handleKeyDown)
    }
    // formSucio va en las dependencias a propósito: sin él, el manejador de
    // Escape se quedaría con el valor inicial (false) y saltaría la confirmación
  }, [showForm, formSucio])

  const handleAddClient = async (clientData) => {
    const newClient = await clientService.createClient(clientData)
    if (newClient) {
      setClients([newClient, ...clients])
      closeForm({ forzar: true })
    }
    return !!newClient
  }

  const handleUpdateClient = async (clientData) => {
    const updated = await clientService.updateClient(editingClient.id, clientData)
    if (updated) {
      setClients(clients.map(c => c.id === editingClient.id ? updated : c))
      closeForm({ forzar: true })
    }
    return !!updated
  }

  const handleDeleteClient = async (id) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar este cliente?')) {
      const success = await clientService.deleteClient(id)
      if (success) {
        setClients(clients.filter(c => c.id !== id))
      }
    }
  }

  const handleEdit = (client) => {
    setEditingClient(client)
    setShowForm(true)
  }

  return (
    <div className="clients-page-container">
      <div className="clients-header">
        <h1 className="clients-title">👥 Gestión de Clientes</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-new-client">
            <PlusCircle size={18} /> Nuevo Cliente
          </button>
        )}
      </div>

      <div className="clients-grid">
        <div className="clients-list-column">
          <ClientList
            clients={clients}
            onEdit={handleEdit}
            onDelete={handleDeleteClient}
            loading={loading}
          />
        </div>
      </div>

      {showForm && (
        <div className="cf-overlay" onClick={() => closeForm()}>
          <div className="cf-box" onClick={(e) => e.stopPropagation()}>
            <ClientForm
              onSubmit={editingClient ? handleUpdateClient : handleAddClient}
              initialData={editingClient}
              onCancel={() => closeForm()}
              onDirtyChange={setFormSucio}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default ClientsPage
