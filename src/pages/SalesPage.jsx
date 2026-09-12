import React, { useState, useEffect } from 'react'
import SalesForm from '../components/SalesForm'
import SalesList from '../components/SalesList'
import { salesService } from '../services/salesService'
import { negocioService } from '../services/negocioService'
import { buildReceiptHTML } from '../utils/receipt'
import { productService } from '../services/productService'
import { clientService } from '../services/clientService'
import { getTodayColombia, formatToColombia } from '../utils/dateFormatter'
import { useAuth } from '../contexts/AuthContext'
import './SalesPage.css'

function SalesPage() {
  // Anular mueve stock y dinero: la RLS lo restringe a administradores
  const { esAdministrador } = useAuth()
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)
  const [lastSale, setLastSale] = useState(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [finalCustomerId, setFinalCustomerId] = useState(null)
  const [formKey, setFormKey] = useState(0)

  // 🆕 NUEVO: catálogo de medios de pago, necesario para traducir medio_pago_id -> nombre
  // en el recibo que se imprime justo después de registrar la venta (lastSale no trae el join
  // de pagos_venta.medios_pago como sí lo trae getAllSales/getSaleById desde Supabase)
  const [mediosPago, setMediosPago] = useState([])

  // 🆕 Configuración del negocio (encabezado y pie del tiquete)
  const [negocio, setNegocio] = useState(null)

  // ✅ getTodayColombia() ahora devuelve siempre la fecha correcta en Colombia
  const [selectedDate, setSelectedDate] = useState(getTodayColombia)

  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    loadSalesByDate(selectedDate)
  }, [selectedDate])

  const loadInitialData = async () => {
    setLoading(true)
    const [productsData, clientsData, mediosPagoData, negocioData] = await Promise.all([
      productService.getAllProducts(),
      clientService.getAllClients(),
      salesService.getMediosPago(), // 🆕 NUEVO: se carga junto con productos y clientes
      negocioService.getMiNegocio() // 🆕 datos del negocio para el tiquete
    ])
    setProducts(productsData.data || [])
    setClients(clientsData)
    setMediosPago(mediosPagoData)
    setNegocio(negocioData)

    const finalCustomer = clientsData.find(c => c.documento === '222222222')
    if (finalCustomer) {
      setFinalCustomerId(finalCustomer.id)
    }

    await loadSalesByDate(getTodayColombia())
    setLoading(false)
  }

  const loadSalesByDate = async (fecha) => {
    setLoading(true)
    const salesData = await salesService.getAllSales(false, fecha)
    setSales(salesData)
    setLoading(false)
  }

  // Registra la venta y devuelve el resultado (la venta o null) para que
  // SalesForm sepa si puede limpiar el formulario.
  const handleCreateSale = async (saleData) => {
    setLoading(true)

    try {
      // 🔧 Una sola llamada: la base de datos registra venta, pagos y
      // productos en una transacción. Si algo falla, no queda nada a medias.
      const { venta: newSale, error: errorVenta } = await salesService.registrarVenta({
        cliente_id: saleData.cliente_id,
        medio_pago_id: saleData.medio_pago_id,
        items: saleData.items,
        pagos: saleData.pagos
      })

      if (newSale) {

        const itemsWithProductInfo = saleData.items.map(item => {
          const product = products.find(p => p.id === item.producto_id)
          return {
            product_id: item.producto_id,
            product_name: product?.descripcion || 'Sin descripción',
            unit_price: item.precio,
            quantity: item.cantidad
          }
        })

        // 🆕 NUEVO: arma el desglose de pagos con el nombre de cada medio,
        // usando el catálogo mediosPago cargado en loadInitialData
        const pagosConNombre = (saleData.pagos || []).map(p => ({
          nombre: mediosPago.find(m => m.id === p.medio_pago_id)?.pago || 'N/A',
          monto: p.monto
        }))

        setLastSale({
          id: newSale.id,
          fecha: newSale.fecha,
          total: saleData.total,
          items: itemsWithProductInfo,
          pagos: pagosConNombre, // 🆕 NUEVO: desglose de pagos para el recibo impreso
          customer: {
            name: saleData.customer_name || 'N/A',
            cedula: saleData.customer_cedula || 'N/A',
            phone: saleData.customer_phone || 'N/A'
          }
        })
        setShowPrintModal(true)

        await loadSalesByDate(selectedDate)
        setShowForm(true)
        alert('✅ Venta registrada exitosamente')
        setLoading(false)
        return newSale // 🔧 CAMBIO: retorno explícito para que SalesForm sepa que sí se guardó
      } else {
        alert('❌ No se pudo registrar la venta: ' + (errorVenta || 'error desconocido'))
        setLoading(false)
        return null // 🔧 CAMBIO: retorno explícito de fallo
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error al registrar la venta')
      setLoading(false)
      return null // 🔧 CAMBIO: también se retorna null si hubo una excepción
    }
  }

  const printAndCut = (printWindow) => {
    const img = printWindow.document.querySelector('img')

    printWindow.onafterprint = async () => {
      // Vite expone las variables de entorno por import.meta.env (con prefijo VITE_).
      // Antes se leía process.env, que no existe en el navegador: lanzaba
      // ReferenceError y el catch lo silenciaba, así que el corte de papel y la
      // apertura del cajón nunca se llegaban a ejecutar.
      const printerServerUrl = import.meta.env.VITE_PRINTER_SERVER_URL || 'http://localhost:3001'

      try {
        await fetch(printerServerUrl + '/api/cut-paper', { method: 'POST' })
        await fetch(printerServerUrl + '/api/open-drawer', { method: 'POST' })
      } catch (error) {
        console.warn(`No se pudo contactar el servidor de impresora en ${printerServerUrl}:`, error.message)
      }
    }

    setTimeout(() => {
      printWindow.focus()
      if (img) {
        img.onload = () => printWindow.print()
        img.onerror = () => printWindow.print()
      } else {
        printWindow.print()
      }
    }, 500)
  }

  const handleViewInvoice = async (sale) => {
    try {
      const saleDetails = await salesService.getSaleById(sale.id)
      if (!saleDetails) {
        alert('No se pudieron cargar los detalles de la venta')
        return
      }

      const clientData = clients.find(c => c.id === sale.cliente_id)
      const clientName = clientData?.nombre || `Cliente #${sale.cliente_id}`
      const clientDocument = clientData?.documento || 'N/A'
      const clientPhone = clientData?.telefono || 'N/A'
      const fechaStr = formatToColombia(sale.fecha)
      const items = (saleDetails.detalle_ventas || []).map(item => {
        const qty = parseInt(item.cantidad) || 0
        const price = parseFloat(item.precio) || 0
        return {
          descripcion: item.productos?.descripcion || 'SIN DESC',
          cantidad: qty,
          subtotal: price * qty
        }
      })

      const pagos = (saleDetails.pagos_venta || []).map(p => ({
        nombre: p.medios_pago?.pago || 'N/A',
        monto: p.monto || 0
      }))

      const html = buildReceiptHTML({
        negocio,
        venta: { id: sale.id, fechaStr, total: sale.total },
        cliente: { nombre: clientName, documento: clientDocument, telefono: clientPhone },
        items,
        pagos
      })

      const printWindow = window.open('', '_blank', 'height=900,width=800,top=50,left=50,scrollbars=yes')
      printWindow.document.write(html)
      printWindow.document.close()
      printAndCut(printWindow)

    } catch (error) {
      console.error('Error:', error)
      alert('Error al cargar la factura')
    }
  }

  const handlePrint = () => {
    if (!lastSale || !lastSale.items || lastSale.items.length === 0) {
      alert('No hay items para imprimir')
      return
    }

    const printWindow = window.open('', '_blank', 'height=600,width=400')

    const total = lastSale.items.reduce((sum, item) => {
      const qty = parseInt(item.quantity) || 0
      const price = parseFloat(item.unit_price) || 0
      return sum + (price * qty)
    }, 0)

    const clienteName = (lastSale.customer?.name || 'SIN NOMBRE').toString().toUpperCase()
    const clienteCedula = (lastSale.customer?.cedula || 'N/A').toString()
    const clientePhone = (lastSale.customer?.phone || 'N/A').toString()

    // ✅ formatToColombia convierte correctamente el ISO con offset a hora Colombia
    const fechaStr = formatToColombia(lastSale.fecha)

    const items = lastSale.items.map(item => {
      const qty = parseInt(item.quantity) || 0
      const price = parseFloat(item.unit_price) || 0
      return {
        descripcion: item.product_name || 'SIN DESC',
        cantidad: qty,
        subtotal: price * qty
      }
    })

    const html = buildReceiptHTML({
      negocio,
      venta: { id: lastSale.id, fechaStr, total },
      cliente: { nombre: clienteName, documento: clienteCedula, telefono: clientePhone },
      items,
      pagos: lastSale.pagos || []
    })

    printWindow.document.write(html)
    printWindow.document.close()
    printAndCut(printWindow)

    setShowPrintModal(false)
    setFormKey(k => k + 1)
  }

  return (
    <div className="sales-page">
      {showPrintModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>¿Desea imprimir el recibo?</h2>
            <div className="modal-buttons">
              <button onClick={handlePrint} className="btn-print">
                🖨️ Imprimir
              </button>
              <button onClick={() => { setShowPrintModal(false); setFormKey(k => k + 1) }} className="btn-skip">
                ⏭️ Saltar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sales-header">
        <h1 className="sales-title">💰 Gestión de Ventas</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-new-sale">
            ➕ Nueva Venta
          </button>
        )}
      </div>

      <div className="sales-grid">
        {showForm && (
          <div className="form-section">
            <SalesForm
              key={formKey}
              products={products}
              clients={clients}
              onSubmit={handleCreateSale}
              onCancel={() => setShowForm(false)}
              finalCustomerId={finalCustomerId}
            />
          </div>
        )}

        <div className="list-section">
          <SalesList
            sales={sales}
            clients={clients}
            loading={loading}
            selectedDate={selectedDate}
            onDateChange={setSelectedDate}
            onViewInvoice={handleViewInvoice}
            onDelete={!esAdministrador ? null : async (id, motivo) => {
              // La confirmación y el motivo se piden en AnularVentaModal
              const result = await salesService.annulSale(id, motivo)
              if (result.success) {
                alert(`✅ Venta anulada y ${result.itemsRestored} producto(s) restaurado(s)`)
                await loadSalesByDate(selectedDate)
              } else {
                alert(`❌ Error al anular la venta: ${result.error}`)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default SalesPage