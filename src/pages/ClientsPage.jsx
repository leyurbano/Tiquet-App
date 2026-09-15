import React, { useState, useEffect, useCallback } from 'react'
import ClientForm from '../components/ClientForm'
import ClientList from '../components/ClientList'
import AbonoModal from '../components/AbonoModal'
import HistorialFiadoModal from '../components/HistorialFiadoModal'
import { clientService } from '../services/clientService'
import { fiadoService } from '../services/fiadoService'
import { toast } from '../utils/toast'
import { formatCOP } from '../utils/currencyFormatter'
import './ClientsPage.css'
import { PlusCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

function ClientsPage() {
  // Borrar clientes y asignar cupo de fiado es solo de administradores
  // (la base de datos lo exige igual)
  const { esAdministrador } = useAuth()
  const [clients, setClients] = useState([])
  // Saldo de fiado por cliente; null = el fiado no está instalado
  const [saldos, setSaldos] = useState(null)
  // Resultado de la última acción, visible en pantalla en vez de un alert
  const [mensaje, setMensaje] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingClient, setEditingClient] = useState(null)
  const [showForm, setShowForm] = useState(false)
  // Hay cambios escritos sin guardar en el modal
  const [formSucio, setFormSucio] = useState(false)
  const [abonando, setAbonando] = useState(null) // { cliente, saldo }
  const [historial, setHistorial] = useState(null) // cliente

  const fiadoActivo = saldos !== null

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    setLoading(true)
    const [data, saldosData] = await Promise.all([
      clientService.getAllClients(),
      fiadoService.getSaldos()
    ])
    setClients(data)
    setSaldos(saldosData)
    setLoading(false)
  }

  const recargarSaldos = async () => setSaldos(await fiadoService.getSaldos())

  const closeForm = useCallback(({ forzar = false } = {}) => {
    // Un clic en el fondo o un Escape no deberían borrar lo escrito sin avisar
    if (!forzar && formSucio &&
        !window.confirm('Hay cambios sin guardar. ¿Descartarlos?')) {
      return
    }
    setShowForm(false)
    setEditingClient(null)
    setFormSucio(false)
  }, [formSucio])

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
    // closeForm va en las dependencias: sin eso, el manejador de Escape se
    // quedaría con la primera versión y saltaría la confirmación de cambios
    // sin guardar. useCallback hace que solo cambie cuando cambia formSucio
  }, [showForm, closeForm])

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

  const handleDeleteClient = async (client) => {
    if (!window.confirm(`¿Eliminar a ${client.nombre}?`)) return

    setMensaje(null)
    const { ok, error } = await clientService.deleteClient(client.id)

    if (ok) {
      setClients(clients.filter(c => c.id !== client.id))
      setMensaje({ tipo: 'ok', texto: `${client.nombre} fue eliminado.` })
    } else {
      // 🔧 Antes un fallo no mostraba nada: ahora se dice por qué
      setMensaje({ tipo: 'error', texto: error })
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

      {mensaje && (
        <div className={`clients-mensaje ${mensaje.tipo === 'ok' ? 'clients-msg-ok' : 'clients-msg-error'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="clients-grid">
        <div className="clients-list-column">
          <ClientList
            clients={clients}
            onEdit={handleEdit}
            onDelete={esAdministrador ? handleDeleteClient : null}
            loading={loading}
            saldos={saldos}
            onAbono={(cliente, saldo) => setAbonando({ cliente, saldo })}
            onHistorial={setHistorial}
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
              mostrarCupo={fiadoActivo}
              puedeEditarCupo={fiadoActivo && esAdministrador}
            />
          </div>
        </div>
      )}

      {abonando && (
        <AbonoModal
          cliente={abonando.cliente}
          saldo={abonando.saldo}
          onCancel={() => setAbonando(null)}
          onDone={async (abono) => {
            setAbonando(null)
            toast.exito(`Abono registrado. ${abonando.cliente.nombre} queda debiendo ${formatCOP(abono.saldo)}`)
            await recargarSaldos()
          }}
        />
      )}

      {historial && (
        <HistorialFiadoModal cliente={historial} onClose={() => setHistorial(null)} />
      )}
    </div>
  )
}

export default ClientsPage
