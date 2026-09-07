/**
 * Generador único del tiquete de venta.
 *
 * 🔧 Antes este HTML estaba duplicado en handleViewInvoice y handlePrint,
 * con la dirección, el teléfono y el logo escritos a mano en ambos. Cualquier
 * cambio había que hacerlo dos veces, y con varios negocios todos habrían
 * impreso los datos de Fralu.
 *
 * Ahora los datos del encabezado y el pie salen de la tabla `negocios`.
 */

const money = (valor) =>
  (parseFloat(valor) || 0).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })

// Evita que una descripción con < o & rompa el HTML del recibo
const esc = (texto) =>
  String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export const getReceiptCSS = (anchoPapel = '55mm') => `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: ${anchoPapel}; }
  body {
    font-family: 'Courier New', monospace;
    background: #fff;
    color: #000;
    padding: 1mm;
  }
  @page {
    margin: 0mm;
    padding: 0;
    size: ${anchoPapel} auto;
  }
  @media print {
    html, body {
      width: ${anchoPapel};
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
  .header-no, .value-no { width: 5%; text-align: center; }
  .header-desc, .value-desc { width: 43%; text-align: left; word-break: break-word; }
  .header-qty, .value-qty { width: 8%; text-align: center; }
  .header-subtotal, .value-subtotal { width: 44%; text-align: right; }
  .value-subtotal { white-space: nowrap; }
  .total-section { text-align: center; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 2mm 0; margin: 2mm 0; }
  .total-label { font-size: 8pt; font-weight: bold; }
  .total-amount { font-size: 12pt; font-weight: bold; }
  .footer {
    text-align: center;
    font-size: 7pt;
    margin-top: 2mm;
    margin-bottom: 0;
    /* pre-line respeta los saltos que escriba el usuario y deja que el
       resto del texto se acomode solo al ancho del papel */
    white-space: pre-line;
    word-wrap: break-word;
  }
  .payment-section { margin: 1.5mm 0 2mm 0; padding: 1mm 0; }
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
  .payment-method { font-weight: bold; text-align: left; }
  .payment-amount { text-align: right; white-space: nowrap; }
`

/**
 * Arma el HTML completo del tiquete.
 *
 * @param negocio  fila de la tabla `negocios` (puede venir null: se degrada
 *                 a un encabezado mínimo en vez de romper la impresión)
 * @param venta    { id, fechaStr, total }
 * @param cliente  { nombre, documento, telefono }
 * @param items    [{ descripcion, cantidad, subtotal }]
 * @param pagos    [{ nombre, monto }]
 */
export const buildReceiptHTML = ({ negocio, venta, cliente, items = [], pagos = [] }) => {
  const n = negocio || {}

  const logoHtml = n.logo_url
    ? `<img src="${esc(n.logo_url)}" alt="${esc(n.nombre_comercial)}" style="width: 40mm; height: auto; margin-bottom: 2mm;">`
    : `<h2>${esc(n.nombre_comercial || 'Recibo de venta')}</h2>`

  // Cada línea del encabezado solo se pinta si el negocio la tiene cargada
  const lineaHeader = (valor) =>
    valor ? `<p style="font-size: 7pt; margin: 1mm 0;">${esc(valor)}</p>` : ''

  const itemsHtml = items
    .map(
      (item, i) => `
  <div class="item-block">
    <div class="item-values">
      <span class="value-no">${i + 1}</span>
      <span class="value-desc">${esc(item.descripcion)}</span>
      <span class="value-qty">${item.cantidad}</span>
      <span class="value-subtotal">$${money(item.subtotal)}</span>
    </div>
  </div>`
    )
    .join('')

  const pagosHtml = pagos
    .map(
      (p) => `
  <div class="payment-row">
    <span class="payment-method">${esc(p.nombre)}</span>
    <span class="payment-amount">$${money(p.monto)}</span>
  </div>`
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Recibo de Venta${venta.id ? ` #${venta.id}` : ''}</title>
<style>${getReceiptCSS(n.ancho_papel || '55mm')}</style>
</head>
<body>
<div class="header">
  ${logoHtml}
  ${lineaHeader(n.direccion)}
  ${lineaHeader(n.ciudad)}
  ${lineaHeader(n.telefono)}
  ${n.nit ? lineaHeader('NIT: ' + n.nit) : ''}
  <p>${esc(venta.fechaStr)}</p>
</div>
<div class="divider"></div>
<div class="info-section">
  <div class="info-row">
    <span class="info-label">Cliente:</span>
    <span class="info-value">${esc(cliente.nombre)}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Cedula:</span>
    <span class="info-value">${esc(cliente.documento)}</span>
  </div>
  <div class="info-row">
    <span class="info-label">Telefono:</span>
    <span class="info-value">${esc(cliente.telefono)}</span>
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
  <div class="total-amount">$${money(venta.total)}</div>
</div>
<div class="footer">${esc(n.mensaje_pie || 'Gracias por su compra')}</div>
</body>
</html>`
}
