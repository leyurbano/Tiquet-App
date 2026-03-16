import React, { useState, useEffect } from 'react'
import SalesForm from '../components/SalesForm'
import SalesList from '../components/SalesList'
import { salesService } from '../services/salesService'
import { productService } from '../services/productService'
import { clientService } from '../services/clientService'
import { getNowColombia, formatToColombia } from '../utils/dateFormatter'
import './SalesPage.css'

function SalesPage() {
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [clients, setClients] = useState([])
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)
  const [lastSale, setLastSale] = useState(null)
  const [showPrintModal, setShowPrintModal] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [salesData, productsData, clientsData] = await Promise.all([
      salesService.getAllSales(true), // true = filtrar solo ventas de hoy
      productService.getAllProducts(),
      clientService.getAllClients()
    ])
    setSales(salesData)
    setProducts(productsData.data || [])
    setClients(clientsData)
    setLoading(false)
  }

  const handleCreateSale = async (saleData) => {
    setLoading(true)
    
    try {
      // Crear la venta con columnas correctas - USAR FECHA DE COLOMBIA
      const newSale = await salesService.createSale({
        cliente_id: saleData.cliente_id,
        fecha: getNowColombia(),
        total: saleData.total
      })

      if (newSale) {
        // Agregar items con columnas correctas
        for (const item of saleData.items) {
          await salesService.addSaleItem(newSale.id, {
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            precio: item.precio
          })
        }

        // Enriquecer items con información de productos para impresión
        const itemsWithProductInfo = saleData.items.map(item => {
          const product = products.find(p => p.id === item.producto_id)
          return {
            product_id: item.producto_id,
            product_name: product?.descripcion || 'Sin descripción',
            unit_price: item.precio,
            quantity: item.cantidad
          }
        })

        // Guardar la venta para impresión CON TODA LA INFORMACIÓN
        setLastSale({
          id: newSale.id,
          fecha: new Date().toISOString(),
          total: saleData.total,
          items: itemsWithProductInfo,
          customer: {
            name: saleData.customer_name || 'N/A',
            cedula: saleData.customer_cedula || 'N/A',
            phone: saleData.customer_phone || 'N/A'
          }
        })
        setShowPrintModal(true)

        await loadData()
        setShowForm(true)
        alert('✅ Venta registrada exitosamente')
      } else {
        alert('❌ Error al crear la venta')
      }
    } catch (error) {
      console.error('Error:', error)
      alert('❌ Error al registrar la venta')
    }
    
    setLoading(false)
  }

  const handleViewInvoice = async (sale) => {
    try {
      // Obtener los detalles de la venta con sus items
      const saleDetails = await salesService.getSaleById(sale.id)
      if (!saleDetails) {
        alert('No se pudieron cargar los detalles de la venta')
        return
      }

      // Obtener datos completos del cliente (documento y teléfono)
      const clientData = clients.find(c => c.id === sale.cliente_id)
      const clientName = clientData?.nombre || `Cliente #${sale.cliente_id}`
      const clientDocument = clientData?.documento || 'N/A'
      const clientPhone = clientData?.telefono || 'N/A'
      
      // Formatear fecha y hora - SIEMPRE en zona horaria de Colombia
      const fechaStr = formatToColombia(sale.fecha)
      
      const totalStr = sale.total.toLocaleString('es-CO', {minimumFractionDigits: 0, maximumFractionDigits: 0})

      // Construir HTML para items con estructura mejorada
      let itemsHtml = ''
      let itemNumber = 1
      if (saleDetails.detalle_ventas && saleDetails.detalle_ventas.length > 0) {
        saleDetails.detalle_ventas.forEach(item => {
          const qty = parseInt(item.cantidad) || 0
          const price = parseFloat(item.precio) || 0
          const subtotal = price * qty
          const productName = (item.productos?.descripcion || 'SIN DESC').toString()
          const subtotalStr = subtotal.toLocaleString('es-CO', {minimumFractionDigits: 0, maximumFractionDigits: 0})
          
          itemsHtml += `
            <div class="item-block">
              <div class="item-headers">
                <span class="header-no"><b>#</b></span>
                <span class="header-desc"><b>DESCRIPCION</b></span>
                <span class="header-qty"><b>CANT</b></span>
                <span class="header-subtotal"><b>SUBTOTAL</b></span>
              </div>
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

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Recibo de Venta #${sale.id}</title>
<style>
* { margin: 0; padding: 0; line-height: 1; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Courier New', monospace; width: 50mm; background: #fff; color: #000; padding: 1mm; }
@page { margin: 0; padding: 0; size: 50mm auto; }
.header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 1mm; margin-bottom: 1mm; }
.header h2 { font-size: 10pt; font-weight: bold; margin: 0; line-height: 1.2; }
.header p { font-size: 7pt; margin: 0.5mm 0 0 0; }
.divider { border-bottom: 1px dashed #000; margin: 1mm 0; }
.info-section { font-size: 6.5pt; margin-bottom: 1mm; }
.info-row { display: flex; justify-content: space-between; margin-bottom: 0.5mm; }
.info-label { font-weight: bold; width: 35%; }
.info-value { width: 60%; text-align: right; word-break: break-word; }
.items-header { font-size: 6.5pt; font-weight: bold; text-align: center; margin-bottom: 0.5mm; }
.item-block { font-size: 6pt; margin-bottom: 1mm; padding-bottom: 0.5mm; border-bottom: 1px dotted #ddd; }
.item-headers { display: flex; margin-bottom: 0.3mm; font-weight: bold; }
.item-values { display: flex; }
.header-no { width: 8%; text-align: center; }
.header-desc { width: 45%; text-align: left; }
.header-qty { width: 17%; text-align: center; }
.header-subtotal { width: 30%; text-align: right; }
.value-no { width: 8%; text-align: center; }
.value-desc { width: 45%; text-align: left; word-break: break-word; }
.value-qty { width: 17%; text-align: center; }
.value-subtotal { width: 30%; text-align: right; }
.total-section { text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1mm 0; margin: 1mm 0; }
.total-label { font-size: 7pt; font-weight: bold; }
.total-amount { font-size: 11pt; font-weight: bold; }
.footer { text-align: center; font-size: 6.5pt; margin-top: 0.5mm; margin-bottom: 0; line-height: 1.2; }
</style>
</head>
<body>
<div class="header">
<h2>RECIBO DE VENTA <br> FRALU DETALLES</h2>
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
${itemsHtml}

<div class="divider"></div>

<div class="total-section">
<div class="total-label">TOTAL</div>
<div class="total-amount">$${totalStr}</div>
</div>

<div class="footer">
<p>Gracias por su compra</p>
<p>Vuelva pronto</p>
</div>

<script>
  // Enviar comando de corte de papel después de imprimir
  window.onafterprint = async () => {
    try {
      const printerServerUrl = '${process.env.REACT_APP_PRINTER_SERVER_URL || 'http://localhost:3001'}'
      // Cortar papel
      await fetch(printerServerUrl + '/api/cut-paper', { method: 'POST' })
      // Luego abrir gavete
      await fetch(printerServerUrl + '/api/open-drawer', { method: 'POST' })
    } catch (error) {
      console.log('Servidor de impresora no disponible')
    }
  }
  
  // Auto-imprimir cuando se abre la ventana
  window.onload = () => {
    setTimeout(() => {
      window.print()
    }, 500)
  }
</script>
</body>
</html>`

    const printWindow = window.open('', '_blank', 'height=900,width=800,top=50,left=50,scrollbars=yes')
    printWindow.document.write(html)
    printWindow.document.close()
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
    
    // Calcular el total
    const total = lastSale.items.reduce((sum, item) => {
      const qty = parseInt(item.quantity) || 0
      const price = parseFloat(item.unit_price) || 0
      return sum + (price * qty)
    }, 0)

    // Datos del cliente
    const clienteName = (lastSale.customer?.name || 'SIN NOMBRE').toString().toUpperCase()
    const clienteCedula = (lastSale.customer?.cedula || 'N/A').toString()
    const clientePhone = (lastSale.customer?.phone || 'N/A').toString()
    const fechaStr = new Date().toLocaleString('es-CO')
    const totalStr = total.toLocaleString('es-CO', {minimumFractionDigits: 0, maximumFractionDigits: 0})

    // Construir HTML para items con estructura mejorada
    let itemsHtml = ''
    let itemNumber = 1
    lastSale.items.forEach(item => {
      const qty = parseInt(item.quantity) || 0
      const price = parseFloat(item.unit_price) || 0
      const subtotal = price * qty
      const productName = (item.product_name || 'SIN DESC').toString()
      const priceStr = price.toLocaleString('es-CO', {minimumFractionDigits: 0, maximumFractionDigits: 0})
      const subtotalStr = subtotal.toLocaleString('es-CO', {minimumFractionDigits: 0, maximumFractionDigits: 0})
      
      itemsHtml += `
        <div class="item-block">
          <div class="item-headers">
            <span class="header-no"><b>#</b></span>
            <span class="header-desc"><b>DESCRIPCION</b></span>
            <span class="header-qty"><b>CANT</b></span>
            <span class="header-subtotal"><b>SUBTOTAL</b></span>
          </div>
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

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Recibo de Venta</title>
<style>
* { margin: 0; padding: 0; line-height: 1; }
html, body { margin: 0; padding: 0; }
body { font-family: 'Courier New', monospace; width: 50mm; background: #fff; color: #000; padding: 1mm; }
@page { margin: 0; padding: 0; size: 50mm auto; }
.header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 1mm; margin-bottom: 1mm; }
.header h2 { font-size: 10pt; font-weight: bold; margin: 0; line-height: 1.2; }
.header p { font-size: 7pt; margin: 0.5mm 0 0 0; }
.divider { border-bottom: 1px dashed #000; margin: 1mm 0; }
.info-section { font-size: 6.5pt; margin-bottom: 1mm; }
.info-row { display: flex; justify-content: space-between; margin-bottom: 0.5mm; }
.info-label { font-weight: bold; width: 35%; }
.info-value { width: 60%; text-align: right; word-break: break-word; }
.items-header { font-size: 6.5pt; font-weight: bold; text-align: center; margin-bottom: 0.5mm; }
.item-block { font-size: 6pt; margin-bottom: 1mm; padding-bottom: 0.5mm; border-bottom: 1px dotted #ddd; }
.item-headers { display: flex; margin-bottom: 0.3mm; font-weight: bold; }
.item-values { display: flex; }
.header-no { width: 8%; text-align: center; }
.header-desc { width: 45%; text-align: left; }
.header-qty { width: 17%; text-align: center; }
.header-subtotal { width: 30%; text-align: right; }
.value-no { width: 8%; text-align: center; }
.value-desc { width: 45%; text-align: left; word-break: break-word; }
.value-qty { width: 17%; text-align: center; }
.value-subtotal { width: 30%; text-align: right; }
.total-section { text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 1mm 0; margin: 1mm 0; }
.total-label { font-size: 7pt; font-weight: bold; }
.total-amount { font-size: 11pt; font-weight: bold; }
.footer { text-align: center; font-size: 6.5pt; margin-top: 0.5mm; margin-bottom: 0; line-height: 1.2; }
</style>
</head>
<body>
<div class="header">
<h2>RECIBO DE VENTA <br> FRALU DETALLES</h2>
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
${itemsHtml}

<div class="divider"></div>

<div class="total-section">
<div class="total-label">TOTAL</div>
<div class="total-amount">$${totalStr}</div>
</div>

<div class="footer">
<p>Gracias por su compra</p>
<p>Vuelva pronto</p>
</div>

<script>
  // Enviar comando de corte de papel después de imprimir
  window.onafterprint = async () => {
    try {
      const printerServerUrl = '${process.env.REACT_APP_PRINTER_SERVER_URL || 'http://localhost:3001'}'
      // Cortar papel
      await fetch(printerServerUrl + '/api/cut-paper', { method: 'POST' })
      // Luego abrir gavete
      await fetch(printerServerUrl + '/api/open-drawer', { method: 'POST' })
    } catch (error) {
      console.log('Servidor de impresora no disponible')
    }
  }
</script>
</body>
</html>`

    printWindow.document.write(html)
    printWindow.document.close()
    
    setTimeout(() => {
      printWindow.focus()
      printWindow.print()
    }, 500)
    
    setShowPrintModal(false)
  }

  // Esta función ya no se necesita pues el corte se maneja desde el HTML impreso
  // Se mantiene para compatibilidad futura
  const openCashDrawer = async () => {
    try {
      const printerServerUrl = process.env.REACT_APP_PRINTER_SERVER_URL || 'http://localhost:3001'
      await fetch(`${printerServerUrl}/api/open-drawer`, {
        method: 'POST'
      })
    } catch (error) {
      console.log('Gavete no disponible o servidor no conectado')
    }
  }

  return (
    <div className="sales-page">
      {/* Modal de Impresión */}
      {showPrintModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>¿Desea imprimir el recibo?</h2>
            <div className="modal-buttons">
              <button onClick={handlePrint} className="btn-print">
                🖨️ Imprimir
              </button>
              <button onClick={() => setShowPrintModal(false)} className="btn-skip">
                ⏭️ Saltar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sales-header">
        <h1 className="sales-title">💰 Gestión de Ventas</h1>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="btn-new-sale"
          >
            ➕ Nueva Venta
          </button>
        )}
      </div>

      <div className="sales-grid">
        {showForm && (
          <div className="form-section">
            <SalesForm
              products={products}
              onSubmit={handleCreateSale}
              onCancel={() => setShowForm(false)}
            />
          </div>
        )}

        <div className="list-section">
          <SalesList
            sales={sales}
            clients={clients}
            loading={loading}
            onViewInvoice={handleViewInvoice}
            onDelete={async (id) => {
              if (window.confirm('¿Eliminar esta venta?')) {
                await salesService.deleteSale(id)
                await loadData()
              }
            }}
          />
        </div>
      </div>
    </div>
  )
}

export default SalesPage