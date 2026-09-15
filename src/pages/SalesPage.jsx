import React, { useState, useEffect } from 'react'
import { toast } from '../utils/toast'
import SalesForm from '../components/SalesForm'
import SalesList from '../components/SalesList'
import { salesService } from '../services/salesService'
import { negocioService } from '../services/negocioService'
import { buildReceiptHTML } from '../utils/receipt'
import { formatCOP } from '../utils/currencyFormatter'
import { fiadoService } from '../services/fiadoService'
import { useDialogo } from '../hooks/useDialogo'
import { productService } from '../services/productService'
import { clientService } from '../services/clientService'
import { getTodayColombia, formatToColombia } from '../utils/dateFormatter'
import { useAuth } from '../contexts/AuthContext'
import { useCashSession } from '../contexts/CashSessionContext'
import AperturaCajaModal from '../components/AperturaCajaModal'
import './SalesPage.css'

function SalesPage() {
  // Anular mueve stock y dinero: la RLS lo restringe a administradores
  const { esAdministrador, esSuperAdmin, estadoCuenta } = useAuth()

  // 🆕 La caja se abre al venir a vender, no al iniciar sesión
  const { session, loading: cargandoCaja } = useCashSession()
  const [aperturaOmitida, setAperturaOmitida] = useState(false)
  const puedeOmitirApertura = esAdministrador || esSuperAdmin
  const mostrarApertura =
    !cargandoCaja && !session && estadoCuenta === 'activo' && !aperturaOmitida
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)
  const [lastSale, setLastSale] = useState(null)
  const [showPrintModal, setShowPrintModal] = useState(false)
  const [formKey, setFormKey] = useState(0)
  // Ventana "¿Desea imprimir?": el foco cae en Imprimir (Enter imprime) y
  // Escape equivale a Saltar
  const refImprimir = useDialogo({
    onCerrar: () => { setShowPrintModal(false); setFormKey(k => k + 1) },
    activo: showPrintModal
  })

  // 🆕 NUEVO: catálogo de medios de pago, necesario para traducir medio_pago_id -> nombre
  // en el recibo que se imprime justo después de registrar la venta (lastSale no trae el join
  // de pagos_venta.medios_pago como sí lo trae getAllSales/getSaleById desde Supabase)
  const [mediosPago, setMediosPago] = useState([])

  // 🆕 Configuración del negocio (encabezado y pie del tiquete)
  const [negocio, setNegocio] = useState(null)

  // Devoluciones: administradores siempre; vendedores solo si el negocio lo
  // permite. La base de datos aplica los mismos límites (registrar_devolucion)
  const puedeDevolver = esAdministrador || esSuperAdmin || !!negocio?.devoluciones_vendedor

  // ✅ getTodayColombia() ahora devuelve siempre la fecha correcta en Colombia
  const [selectedDate, setSelectedDate] = useState(getTodayColombia)

  // Carga única de catálogos al montar
  useEffect(() => {
    loadInitialData()
  }, [])

  useEffect(() => {
    loadSalesByDate(selectedDate)
  }, [selectedDate])

  // Solo catálogos: las ventas del día las trae el efecto de selectedDate.
  // 🔧 Antes también las pedía aquí, así que al abrir se descargaban dos veces
  const loadInitialData = async () => {
    const [productsData, clientsData, mediosPagoData, negocioData] = await Promise.all([
      productService.getTodosLosProductos(),
      clientService.getAllClients(),
      salesService.getMediosPago(), // 🆕 NUEVO: se carga junto con productos y clientes
      negocioService.getMiNegocio() // 🆕 datos del negocio para el tiquete
    ])
    setProducts(productsData.data || [])
    setClients(clientsData)
    setMediosPago(mediosPagoData)
    setNegocio(negocioData)
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

        // Si hubo fiado, el tiquete muestra cuánto queda debiendo el cliente
        const huboFiado = (saleData.pagos || []).some(
          p => mediosPago.find(m => m.id === p.medio_pago_id)?.es_fiado
        )
        const saldoFiado = huboFiado && saleData.cliente_id
          ? await fiadoService.getSaldo(saleData.cliente_id)
          : null

        setLastSale({
          id: newSale.id,
          fecha: newSale.fecha,
          total: saleData.total,
          items: itemsWithProductInfo,
          pagos: pagosConNombre, // 🆕 NUEVO: desglose de pagos para el recibo impreso
          saldoFiado,
          customer: {
            name: saleData.customer_name || 'N/A',
            cedula: saleData.customer_cedula || 'N/A',
            phone: saleData.customer_phone || 'N/A'
          }
        })
        setShowPrintModal(true)

        await loadSalesByDate(selectedDate)
        setShowForm(true)
        toast.exito('Venta registrada exitosamente')
        setLoading(false)
        return newSale // 🔧 CAMBIO: retorno explícito para que SalesForm sepa que sí se guardó
      } else {
        toast.error('No se pudo registrar la venta: ' + (errorVenta || 'error desconocido'))
        setLoading(false)
        return null // 🔧 CAMBIO: retorno explícito de fallo
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al registrar la venta')
      setLoading(false)
      return null // 🔧 CAMBIO: también se retorna null si hubo una excepción
    }
  }

  /**
   * Abre el documento del tiquete para imprimir.
   *
   * 🔧 Antes solo usaba window.open. Si el navegador bloqueaba la ventana
   * emergente, window.open devolvía null, el código fallaba al escribir en
   * ella y el cliente se quedaba sin tiquete, sin ningún aviso.
   *
   * Ahora intenta la ventana emergente, como siempre, y si el navegador la
   * bloquea imprime desde un iframe oculto dentro de la misma página, que los
   * bloqueadores de ventanas no afectan.
   *
   * Devuelve la ventana (o la del iframe) sobre la que se imprime.
   */
  const abrirDocumentoImpresion = (html, opcionesVentana) => {
    const ventana = window.open('', '_blank', opcionesVentana)
    if (ventana) {
      ventana.document.write(html)
      ventana.document.close()
      return ventana
    }

    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    Object.assign(iframe.style, {
      position: 'fixed', right: '0', bottom: '0',
      width: '0', height: '0', border: '0'
    })
    document.body.appendChild(iframe)

    const doc = iframe.contentWindow.document
    doc.open()
    doc.write(html)
    doc.close()

    // Se retira al terminar la impresión, o al minuto si el navegador no avisa
    const retirar = () => iframe.remove()
    iframe.contentWindow.addEventListener('afterprint', () => setTimeout(retirar, 500))
    setTimeout(retirar, 60000)

    return iframe.contentWindow
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

    // 🔧 Antes se asignaba img.onload DESPUÉS de la espera: si el logo ya
    // había cargado para entonces (lo normal si está en caché), ese evento no
    // se volvía a disparar y el tiquete nunca se mandaba a imprimir.
    // Ahora se revisa img.complete; `impreso` evita imprimir dos veces.
    let impreso = false
    const imprimir = () => {
      if (impreso) return
      impreso = true
      printWindow.focus()
      printWindow.print()
    }

    setTimeout(() => {
      if (img && !img.complete) {
        img.onload = imprimir
        img.onerror = imprimir
      } else {
        imprimir()
      }
    }, 500)
  }

  const handleViewInvoice = async (sale) => {
    try {
      const saleDetails = await salesService.getSaleById(sale.id)
      if (!saleDetails) {
        toast.error('No se pudieron cargar los detalles de la venta')
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

      // Esta ventana se abre después de un `await`: es justo el caso en que
      // los navegadores más bloquean ventanas emergentes. El helper cae al
      // iframe si pasa.
      const printWindow = abrirDocumentoImpresion(html, 'height=900,width=800,top=50,left=50,scrollbars=yes')
      printAndCut(printWindow)

    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar la factura')
    }
  }

  const handlePrint = () => {
    if (!lastSale || !lastSale.items || lastSale.items.length === 0) {
      toast.aviso('No hay items para imprimir')
      return
    }

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
      pagos: lastSale.pagos || [],
      saldoFiado: lastSale.saldoFiado ?? null
    })

    try {
      const printWindow = abrirDocumentoImpresion(html, 'height=600,width=400')
      printAndCut(printWindow)
    } catch (error) {
      // El modal queda abierto para que se pueda reintentar
      console.error('Error preparando la impresión:', error)
      toast.error('No se pudo preparar el tiquete para imprimir. Intenta de nuevo.')
      return
    }

    setShowPrintModal(false)
    setFormKey(k => k + 1)
  }

  return (
    <div className="sales-page">
      {mostrarApertura && (
        <AperturaCajaModal
          onOmitir={puedeOmitirApertura ? () => setAperturaOmitida(true) : undefined}
        />
      )}

      {showPrintModal && (
        <div className="modal-overlay">
          <div className="modal-content" ref={refImprimir} role="dialog" aria-modal="true" tabIndex={-1} aria-label="Imprimir recibo">
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
            {/* Sin caja abierta no se vende: la venta no entraría en ningún
                arqueo. La base de datos también lo impide (migración 16). */}
            {cargandoCaja ? null : session ? (
              <SalesForm
                key={formKey}
                products={products}
                onSubmit={handleCreateSale}
                onCancel={() => setShowForm(false)}
                logoUrl={negocio?.logo_url}
              />
            ) : (
              <div className="caja-cerrada-aviso">
                <p className="caja-cerrada-titulo">🔒 Caja cerrada</p>
                <p>Para registrar ventas, abre la caja con la base del turno.</p>
                <button
                  type="button"
                  className="btn-new-sale"
                  onClick={() => setAperturaOmitida(false)}
                >
                  Abrir caja
                </button>
              </div>
            )}
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
            puedeDevolver={puedeDevolver}
            mediosPago={mediosPago}
            esAdministrador={esAdministrador || esSuperAdmin}
            negocio={negocio}
            onDevuelta={async (devolucion) => {
              toast.exito(`Devolución #${devolucion.id} registrada por ${formatCOP(devolucion.total)}`)
              // El stock cambió: el formulario de venta debe verlo
              const [, productsData] = await Promise.all([
                loadSalesByDate(selectedDate),
                productService.getTodosLosProductos()
              ])
              setProducts(productsData.data || [])
            }}
            onDelete={!esAdministrador ? null : async (id, motivo) => {
              // La confirmación y el motivo se piden en AnularVentaModal
              const result = await salesService.annulSale(id, motivo)
              if (result.success) {
                toast.exito(`Venta anulada y ${result.itemsRestored} producto(s) restaurado(s)`)
                await loadSalesByDate(selectedDate)
              } else {
                toast.error(`Error al anular la venta: ${result.error}`)
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default SalesPage