import React, { useState, useEffect } from 'react'
import SalesForm from '../components/SalesForm'
import SalesList from '../components/SalesList'
import { salesService } from '../services/salesService'
import { productService } from '../services/productService'
import { clientService } from '../services/clientService'
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
      // Crear la venta con columnas correctas
      const newSale = await salesService.createSale({
        cliente_id: saleData.cliente_id,
        fecha: new Date().toISOString(),
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
      
      // Formatear fecha y hora
      const saleDate = new Date(sale.fecha)
      const fechaStr = saleDate.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
      
      const totalStr = sale.total.toLocaleString('es-CO', {minimumFractionDigits: 0, maximumFractionDigits: 0})

      // Construir HTML para items con formato de tabla
      let itemsHtml = ''
      let itemNumber = 1
      
      if (saleDetails.detalle_ventas && saleDetails.detalle_ventas.length > 0) {
        saleDetails.detalle_ventas.forEach(item => {
          const qty = parseInt(item.cantidad) || 0
          const price = parseFloat(item.precio) || 0
          const subtotal = price * qty
          const productName = (item.productos?.descripcion || 'SIN DESC').toString()
          const subtotalStr = subtotal.toLocaleString('es-CO', {minimumFractionDigits: 0, maximumFractionDigits: 0})
          
          itemsHtml += `<tr style="border-bottom: 1px dotted #ccc;">
            <td style="text-align: left; padding: 5px 0; width: 5%;">${itemNumber}</td>
            <td style="text-align: left; padding: 5px 5px; width: 60%;">${productName}</td>
            <td style="text-align: center; padding: 5px 0; width: 15%;">${qty}</td>
            <td style="text-align: right; padding: 5px 0; width: 20%;">$${subtotalStr}</td>
          </tr>`
          itemNumber++
        })
      } else {
        itemsHtml += '<tr><td colspan="4" style="text-align: center; padding: 10px; color: #666;">Sin items registrados</td></tr>'
      }

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Recibo de Venta #${sale.id}</title>
<style>
* { margin: 0; padding: 0; }
body { 
  font-family: 'Courier New', monospace; 
  max-width: 500px; 
  margin: 0 auto; 
  background: #fff; 
  color: #000; 
  padding: 0;
}
.receipt { 
  background: #fff; 
  padding: 30px 20px; 
  min-height: 100vh;
}
.header { 
  text-align: center; 
  margin-bottom: 20px; 
}
.header-title {
  font-size: 14pt; 
  font-weight: bold; 
  margin-bottom: 5px; 
}
.header-subtitle { 
  font-size: 11pt; 
  font-weight: bold; 
  margin-bottom: 10px; 
}
.header-datetime {
  font-size: 10pt;
  margin-bottom: 20px;
}
.divider { 
  border-bottom: 1px solid #000; 
  margin: 15px 0; 
}
.client-section { 
  font-size: 10pt; 
  margin-bottom: 20px;
}
.info-row { 
  margin-bottom: 5px;
  display: flex;
  justify-content: flex-start;
}
.info-label { 
  font-weight: bold;
  min-width: 80px;
}
.info-value { 
  flex: 1;
}
.items-section {
  margin: 20px 0;
}
.items-title {
  font-size: 11pt;
  font-weight: bold;
  margin-bottom: 10px;
  text-align: center;
}
.items-table {
  width: 100%;
  font-size: 9pt;
  border-collapse: collapse;
}
.items-table thead {
  border-bottom: 1px solid #000;
}
.items-table th {
  padding: 8px 0;
  text-align: left;
  font-weight: bold;
}
.items-table th:nth-child(1) { width: 8%; text-align: center; }
.items-table th:nth-child(2) { width: 62%; }
.items-table th:nth-child(3) { width: 15%; text-align: center; }
.items-table th:nth-child(4) { width: 15%; text-align: right; }
.items-table td {
  padding: 6px 0;
  border-bottom: 1px dotted #ccc;
}
.items-table td:nth-child(1) { text-align: center; }
.items-table td:nth-child(3) { text-align: center; }
.items-table td:nth-child(4) { text-align: right; }
.total-section { 
  text-align: right; 
  border-top: 1px solid #000; 
  border-bottom: 1px solid #000; 
  padding: 15px 0; 
  margin: 20px 0; 
  font-size: 12pt;
  font-weight: bold;
}
.total-label {
  margin-bottom: 10px;
}
.total-amount { 
  font-size: 16pt; 
  font-weight: bold;
}
.footer { 
  text-align: center; 
  font-size: 9pt; 
  margin-top: 20px;
  padding-top: 15px;
}
.footer-thanks {
  margin-bottom: 10px;
}
.footer-info {
  font-size: 8pt;
  color: #666;
}
.no-print { 
  text-align: center; 
  margin-top: 30px; 
  padding-top: 20px;
  border-top: 1px solid #ccc;
}
.btn-print, .btn-close {
  padding: 10px 25px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12pt;
  font-weight: bold;
  margin: 10px 5px;
  color: white;
}
.btn-print {
  background-color: #3b82f6;
}
.btn-print:hover {
  background-color: #2563eb;
}
.btn-close {
  background-color: #6b7280;
}
.btn-close:hover {
  background-color: #4b5563;
}
@media print {
  body { background: #fff; padding: 0; margin: 0; }
  .receipt { padding: 0; }
  .no-print { display: none; }
}
</style>
</head>
<body>
<div class="receipt">
<div class="header">
<div class="header-title">RECIBO DE VENTA</div>
<div class="header-subtitle">FRALU DETALLES</div>
<div class="header-datetime">${fechaStr}</div>
</div>

<div class="divider"></div>

<div class="client-section">
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

<div class="items-section">
<div class="items-title">ARTICULOS</div>
<table class="items-table">
<thead>
<tr>
<th>#</th>
<th>DESCRIPCION</th>
<th>CANT</th>
<th>SUBTOTAL</th>
</tr>
</thead>
<tbody>
${itemsHtml}
</tbody>
</table>
</div>

<div class="divider"></div>

<div class="total-section">
<div class="total-label">TOTAL:</div>
<div class="total-amount">$${totalStr}</div>
</div>

<div class="footer">
<div class="footer-thanks">✓ Gracias por su compra</div>
<div class="footer-info">Sistema FRALU © ${new Date().getFullYear()}</div>
</div>
</div>

<div class="no-print">
<button class="btn-print" onclick="window.print()">🖨️ IMPRIMIR</button>
<button class="btn-close" onclick="window.close()">✕ CERRAR</button>
</div>
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
* { margin: 0; padding: 0; }
body { font-family: 'Courier New', monospace; width: 80mm; background: #fff; color: #000; padding: 2mm; }
.header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 3mm; margin-bottom: 3mm; }
.header h2 { font-size: 11pt; font-weight: bold; margin: 0; }
.header p { font-size: 8pt; margin: 1mm 0 0 0; }
.divider { border-bottom: 1px dashed #000; margin: 2mm 0; }
.info-section { font-size: 7pt; margin-bottom: 3mm; }
.info-row { display: flex; justify-content: space-between; margin-bottom: 1mm; }
.info-label { font-weight: bold; width: 35%; }
.info-value { width: 60%; text-align: right; word-break: break-word; }
.items-header { font-size: 7pt; font-weight: bold; text-align: center; margin-bottom: 1mm; }
.item-block { font-size: 6.5pt; margin-bottom: 2mm; padding-bottom: 1mm; border-bottom: 1px dotted #ddd; }
.item-headers { display: flex; margin-bottom: 0.8mm; font-weight: bold; }
.item-values { display: flex; }
.header-no { width: 8%; text-align: center; }
.header-desc { width: 45%; text-align: left; }
.header-qty { width: 17%; text-align: center; }
.header-subtotal { width: 30%; text-align: right; }
.value-no { width: 8%; text-align: center; }
.value-desc { width: 45%; text-align: left; word-break: break-word; }
.value-qty { width: 17%; text-align: center; }
.value-subtotal { width: 30%; text-align: right; }
.total-section { text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2mm 0; margin: 2mm 0; }
.total-label { font-size: 8pt; font-weight: bold; }
.total-amount { font-size: 12pt; font-weight: bold; }
.footer { text-align: center; font-size: 7pt; margin-top: 3mm; }
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