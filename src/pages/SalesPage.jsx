import React, { useState, useEffect } from 'react'
import SalesForm from '../components/SalesForm'
import SalesList from '../components/SalesList'
import { salesService } from '../services/salesService'
import { productService } from '../services/productService'
import { clientService } from '../services/clientService'
import { getNowColombia, getTodayColombia, formatToColombia } from '../utils/dateFormatter'
import './SalesPage.css'

function SalesPage() {
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
    const [productsData, clientsData, mediosPagoData] = await Promise.all([
      productService.getAllProducts(),
      clientService.getAllClients(),
      salesService.getMediosPago() // 🆕 NUEVO: se carga junto con productos y clientes
    ])
    setProducts(productsData.data || [])
    setClients(clientsData)
    setMediosPago(mediosPagoData)

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

  // 🔧 CAMBIO: dos ajustes en esta función:
  // 1. Se agrega "pagos: saleData.pagos" al objeto que se manda a salesService.createSale.
  //    Antes faltaba, así que pagos_venta nunca se llenaba (ni en pago simple ni mixto).
  // 2. Ahora hace "return" del resultado (newSale o null) en cada rama, incluida la del catch.
  //    Antes no retornaba nada -> SalesForm.jsx siempre recibía "undefined" y no podía saber
  //    si la venta se guardó o falló, así que limpiaba el formulario igual en ambos casos.
  const handleCreateSale = async (saleData) => {
    setLoading(true)

    try {
      // getNowColombia() ahora devuelve ISO con offset colombiano real,
      // no UTC puro — Supabase almacena y filtra el día correcto.
      const nowColombiaISO = getNowColombia()

      const newSale = await salesService.createSale({
        cliente_id: saleData.cliente_id,
        fecha: nowColombiaISO,
        total: saleData.total,
        medio_pago_id: saleData.medio_pago_id,
        pagos: saleData.pagos // 🔧 CAMBIO: faltaba, necesario para poblar pagos_venta
      })

      if (newSale) {
        for (const item of saleData.items) {
          await salesService.addSaleItem(newSale.id, {
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio: item.precio
          })
        }

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
          fecha: nowColombiaISO,
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
        alert('❌ Error al crear la venta')
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

  const getReceiptCSS = () => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 55mm; }
  body { 
    font-family: 'Courier New', monospace; 
    background: #fff; 
    color: #000; 
    padding: 1mm; 
  }
  @page { 
    margin: 0mm; 
    padding: 0; 
    size: 55mm auto; 
  }
  @media print {
    html, body {
      width: 55mm;
      margin: 0 !important;
      padding: 0 !important;
    }
    * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
  .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
  .header h2 { font-size: 11pt; font-weight: bold; margin: 0; }
  .header p { font-size: 8pt; margin: 1mm 0 0 0; }
  .divider { border-bottom: 1px dashed #000; margin: 2mm 0; }
  .info-section { font-size: 7pt; margin-bottom: 3mm; }
  .info-row { display: flex; justify-content: flex-start; margin-bottom: 1mm; padding: 0 2mm; }
  .info-label { font-weight: bold; width: 30%; text-align: left; }
  .info-value { width: 70%; text-align: left; padding-left: 2mm; word-break: break-word; }
  .items-header { font-size: 7pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
  .item-block { font-size: 6.5pt; margin-bottom: 2mm; padding-bottom: 1mm; border-bottom: 1px dotted #ddd; }
  .item-headers { display: flex; font-size: 6.5pt; font-weight: bold; margin-bottom: 0.8mm; padding-bottom: 0.8mm; border-bottom: 1px solid #000; }
  .item-values { display: flex; }
  .header-no { width: 5%; text-align: center; }
  .header-desc { width: 43%; text-align: left; }
  .header-qty { width: 8%; text-align: center; }
  .header-subtotal { width: 44%; text-align: right; }
  .value-no { width: 5%; text-align: center; }
  .value-desc { width: 43%; text-align: left; word-break: break-word; }
  .value-qty { width: 8%; text-align: center; }
  .value-subtotal { width: 44%; text-align: right; white-space: nowrap; }
  .total-section { text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2mm 0; margin: 2mm 0; }
  .total-label { font-size: 8pt; font-weight: bold; }
  .total-amount { font-size: 12pt; font-weight: bold; }
  .footer { text-align: center; font-size: 7pt; margin-top: 2mm; margin-bottom: 0; }

  /* 🆕 NUEVO: estilos propios para la sección "FORMA DE PAGO" (soporta pago simple y mixto) */
  .payment-section {
    margin: 1.5mm 0 2mm 0;
    padding: 1mm 0;
  }
  .payment-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 7.5pt;
    padding: 0.8mm 2mm;
  }
  .payment-row:not(:last-child) {
    border-bottom: 1px dotted #ddd;
    padding-bottom: 1.2mm;
    margin-bottom: 0.8mm;
  }
  .payment-method {
    font-weight: bold;
    text-align: left;
  }
  .payment-amount {
    text-align: right;
    white-space: nowrap;
  }
`

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
      const totalStr = sale.total.toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })

      let itemsHtml = ''
      let itemNumber = 1
      if (saleDetails.detalle_ventas && saleDetails.detalle_ventas.length > 0) {
        saleDetails.detalle_ventas.forEach(item => {
          const qty = parseInt(item.cantidad) || 0
          const price = parseFloat(item.precio) || 0
          const subtotal = price * qty
          const productName = (item.productos?.descripcion || 'SIN DESC').toString()
          const subtotalStr = subtotal.toLocaleString('es-CO', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
          })

          itemsHtml += `
            <div class="item-block">
              <div class="item-values">
                <span class="value-no">${itemNumber}</span>
                <span class="value-desc">${productName}</span>
                <span class="value-qty">${qty}</span>
                <span class="value-subtotal">$${subtotalStr}</span>
              </div>
            </div>
          `
          itemNumber++
        })
      }

      // 🔧 CORRECCIÓN: pagosHtml se declara y calcula UNA sola vez, fuera del forEach
      // (antes estaba mal ubicado dentro del forEach de itemsHtml, lo que causaba un
      // ReferenceError al usarlo más abajo en el template `html`, porque `let` tiene
      // alcance de bloque y esa variable dejaba de existir al salir del forEach)
      let pagosHtml = ''
      if (saleDetails.pagos_venta && saleDetails.pagos_venta.length > 0) {
        pagosHtml = saleDetails.pagos_venta.map(p => {
          const montoStr = (p.monto || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
          return `<div class="payment-row">
            <span class="payment-method">${p.medios_pago?.pago || 'N/A'}</span>
            <span class="payment-amount">$${montoStr}</span>
          </div>`
        }).join('')
      }

      const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Recibo de Venta #${sale.id}</title>
<style>${getReceiptCSS()}</style>
</head>
<body>
<div class="header">
  <img src="/Fralu.png" alt="Logo Fralu" style="width: 40mm; height: auto; margin-bottom: 2mm;">
  <p style="font-size: 7pt; margin: 1mm 0;">Carrera 16 # 37-72</p>
  <p style="font-size: 7pt; margin: 1mm 0;">Local 202 - Tunja</p>
  <p style="font-size: 7pt; margin: 1mm 0;">3212389832</p>
  <p>${fechaStr}</p>
</div>
<div class="divider"></div>
<div class="info-section">
  <div class="info-row">
    <span class="info-label">Cliente:</span>
    <span class="info-value">${clientName}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Cedula:</span>
    <span class="info-value">${clientDocument}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Telefono:</span>
    <span class="info-value">${clientPhone}</span>
  </div>
</div>
<div class="divider"></div>
<div class="items-header">ARTICULOS</div>
<div class="item-headers">
  <span class="header-no"><b>#</b></span>
  <span class="header-desc"><b>DESCRIPCION</b></span>
  <span class="header-qty"><b>CANT</b></span>
  <span class="header-subtotal"><b>SUBTOTAL</b></span>
</div>
${itemsHtml}
<div class="divider"></div>
<div class="items-header">FORMA DE PAGO</div>
<div class="payment-section">
${pagosHtml}
</div>
<div class="divider"></div>
<div class="total-section">
  <div class="total-label">TOTAL</div>
  <div class="total-amount">$${totalStr}</div>
</div>
<div class="footer">
  <p>Gracias por su compra</p>
  <p>Vuelva pronto</p>
</div>
</body>
</html>`

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

    const totalStr = total.toLocaleString('es-CO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    })

    let itemsHtml = ''
    let itemNumber = 1
    lastSale.items.forEach(item => {
      const qty = parseInt(item.quantity) || 0
      const price = parseFloat(item.unit_price) || 0
      const subtotal = price * qty
      const productName = (item.product_name || 'SIN DESC').toString()
      const subtotalStr = subtotal.toLocaleString('es-CO', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      })

      itemsHtml += `
        <div class="item-block">
          <div class="item-values">
            <span class="value-no">${itemNumber}</span>
            <span class="value-desc">${productName}</span>
            <span class="value-qty">${qty}</span>
            <span class="value-subtotal">$${subtotalStr}</span>
          </div>
        </div>
      `
      itemNumber++
    })

    // 🆕 NUEVO: arma el desglose de forma de pago a partir de lastSale.pagos,
    // que ya viene con nombre + monto desde handleCreateSale
    let pagosHtml = ''
    if (lastSale.pagos && lastSale.pagos.length > 0) {
      pagosHtml = lastSale.pagos.map(p => {
        const montoStr = (p.monto || 0).toLocaleString('es-CO', { minimumFractionDigits: 0 })
        return `<div class="payment-row">
          <span class="payment-method">${p.nombre}</span>
          <span class="payment-amount">$${montoStr}</span>
        </div>`
      }).join('')
    }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Recibo de Venta</title>
<style>${getReceiptCSS()}</style>
</head>
<body>
<div class="header">
  <img src="/Fralu.png" alt="Logo Fralu" style="width: 40mm; height: auto; margin-bottom: 2mm;">
  <p style="font-size: 7pt; margin: 1mm 0;">Carrera 16 # 37-72</p>
  <p style="font-size: 7pt; margin: 1mm 0;">Local 202 - Tunja</p>
  <p style="font-size: 7pt; margin: 1mm 0;">3212389832</p>
  <p>${fechaStr}</p>
</div>
<div class="divider"></div>
<div class="info-section">
  <div class="info-row">
    <span class="info-label">Cliente:</span>
    <span class="info-value">${clienteName}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Cedula:</span>
    <span class="info-value">${clienteCedula}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Telefono:</span>
    <span class="info-value">${clientePhone}</span>
  </div>
</div>
<div class="divider"></div>
<div class="items-header">ARTICULOS</div>
<div class="item-headers">
  <span class="header-no"><b>#</b></span>
  <span class="header-desc"><b>DESCRIPCION</b></span>
  <span class="header-qty"><b>CANT</b></span>
  <span class="header-subtotal"><b>SUBTOTAL</b></span>
</div>
${itemsHtml}
<div class="divider"></div>
<div class="items-header">FORMA DE PAGO</div>
<div class="payment-section">
${pagosHtml}
</div>
<div class="divider"></div>
<div class="total-section">
  <div class="total-label">TOTAL</div>
  <div class="total-amount">$${totalStr}</div>
</div>
<div class="footer">
  <p>Gracias por su compra</p>
  <p>Vuelva pronto</p>
</div>
</body>
</html>`

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
            onDelete={async (id, motivo) => {
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