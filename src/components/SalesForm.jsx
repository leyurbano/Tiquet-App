import React, { useState } from 'react'
import './SalesForm.css'
import { formatCOP } from '../utils/currencyFormatter'
import { clientService } from '../services/clientService'

function SalesForm({ products, onSubmit, onCancel }) {
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0])
  
  const [customer, setCustomer] = useState({
    name: '',
    cedula: '',
    phone: ''
  })

  const [items, setItems] = useState([])
  const [selectedProduct, setSelectedProduct] = useState('')
  const [quantity, setQuantity] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [customerFound, setCustomerFound] = useState(null)
  const [showAddCustomerBtn, setShowAddCustomerBtn] = useState(false)
// DESPUÉS
const searchCustomerByCedula = async (cedula) => {
  const trimmedCedula = cedula.trim()
  
  // Limpiar si está vacío
  if (!trimmedCedula || trimmedCedula.length === 0) {
    setCustomer({ name: '', cedula: '', phone: '' })
    setShowAddCustomerBtn(false)
    setCustomerFound(null)
    return
  }

  // Actualizar campo cédula
  setCustomer(prev => ({ ...prev, cedula: cedula }))

  // Solo buscar si tiene al menos 6 caracteres
  if (trimmedCedula.length < 6) return

  try {
    const foundCustomer = await clientService.getClientByDocument(trimmedCedula)
    
    if (foundCustomer) {
      setCustomer({
        name: foundCustomer.nombre,
        cedula: foundCustomer.documento,
        phone: foundCustomer.telefono
      })
      setCustomerFound(foundCustomer)
      setShowAddCustomerBtn(false)
    } else {
      setShowAddCustomerBtn(true)
      setCustomerFound(null)
    }
  } catch (error) {
    console.error('Error searching customer:', error)
    setShowAddCustomerBtn(false)
  }
}

  // Buscar producto por ID/item
  const getProductById = (productId) => {
    return products.find(p => p.id === parseInt(productId))
  }

  const selectedProductData = selectedProduct ? getProductById(selectedProduct) : null

  const addItem = () => {
    if (!selectedProduct || !quantity) return

    const product = products.find(p => p.id === parseInt(selectedProduct))
    if (!product) return

    const existingItem = items.find(item => item.product_id === product.id)
    
    if (existingItem) {
      setItems(items.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + parseInt(quantity) }
          : item
      ))
    } else {
      setItems([...items, {
        product_id: product.id,
        product_name: product.descripcion || product.name,
        unit_price: product.precio_venta || product.price,
        quantity: parseInt(quantity)
      }])
    }

    setSelectedProduct('')
    setQuantity('')
  }

  const removeItem = (productId) => {
    setItems(items.filter(item => item.product_id !== productId))
  }

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0)
  }

 
const handleSubmit = (e) => {
  e.preventDefault()
  if (items.length === 0) {
    alert('Agrega al menos un producto')
    return
  }

  onSubmit({
    cliente_id: customerFound?.id || null,
    fecha: saleDate,
    total: calculateTotal(),
    items: items.map(item => ({
      producto_id: item.product_id,
      cantidad: item.quantity,
      precio: item.unit_price
    }))
  })

  setSaleDate(new Date().toISOString().split('T')[0])
  setCustomer({ name: '', cedula: '', phone: '' })
  setItems([])
}

  return (
    <form onSubmit={handleSubmit} className="sales-form-wrapper">
      <h2 className="form-title">📝 Nueva Venta</h2>

      {/* Datos de la Venta y Cliente */}
      <div className="form-section">
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Fecha</label>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              required
              className="form-input"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Forma de Pago</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="form-input"
            >
              <option value="cash">💵 Efectivo</option>
              <option value="card">💳 Tarjeta</option>
              <option value="transfer">🏦 Transferencia</option>
              <option value="check">✅ Cheque</option>
            </select>
          </div>
        </div>
      </div>

      {/* Datos del Cliente */}
      <div className="form-section">
        <h3 className="form-section-title">👤 Datos del Cliente</h3>
        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">N° Documento</label>
            <input
              type="text"
              placeholder="CC, CE, NIT"
              value={customer.cedula}
              onChange={(e) => {
                const newValue = e.target.value
                searchCustomerByCedula(newValue)
              }}
              maxLength="10"
              className="form-input"
            />
            {showAddCustomerBtn && customer.cedula.trim().length > 0 && (
              <button
                type="button"
                onClick={() => alert('Funcionalidad para agregar cliente')}
                className="btn-add-customer"
              >
                ➕ Agregar Cliente
              </button>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Nombre Completo</label>
            <input
              type="text"
              placeholder="Nombre del cliente"
              value={customer.name}
              onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
              required
              className="form-input"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">Celular</label>
            <input
              type="tel"
              placeholder="3100000000"
              value={customer.phone}
              onChange={(e) => setCustomer({ ...customer, phone: e.target.value })}
              maxLength="10"
              className="form-input"
            />
          </div>
        </div>
      </div>

      {/* Agregar productos */}
      <div className="form-section">
        <h3 className="form-section-title">🛒 Agregar Productos</h3>
        <div className="add-product-section">
          <div className="form-row-add-item">
            <div className="form-group">
              <label className="form-label">Item</label>
              <input
                type="number"
                placeholder="producto"
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                maxLength="5"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Descripción</label>
              <div className="product-display">
                {selectedProductData ? (
                  <>
                    <span className="product-name">{selectedProductData.descripcion}</span>
                    <span className="product-price">{formatCOP(selectedProductData.precio_venta)}</span>
                  </>
                ) : (
                  <span className="product-empty">Selecciona un item</span>
                )}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Cantidad</label>
              <input
                type="number"
                placeholder="Cantidad"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addItem()
                  }
                }}
                min="1"
                maxLength="5"
                className="form-input"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Items de la venta */}
      {items.length > 0 && (
        <div className="form-section">
          <h3 className="form-section-title">📦 Productos en la Venta</h3>
          <div className="sales-items-table">
            <div className="table-header-sales">
              <div className="col-number">#</div>
              <div className="col-product">Descripción</div>
              <div className="col-qty">Cantidad</div>
              <div className="col-total">Total del Producto</div>
              <div className="col-action">Acción</div>
            </div>
            {items.map((item, index) => (
              <div key={item.product_id} className="table-row-sales">
                <div className="col-number">{index + 1}</div>
                <div className="col-product">{item.product_name}</div>
                <div className="col-qty">{item.quantity}</div>
                <div className="col-total">{formatCOP(item.unit_price * item.quantity)}</div>
                <div className="col-action">
                  <button
                    type="button"
                    onClick={() => removeItem(item.product_id)}
                    className="btn-remove-item"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="total-section">
            <span className="total-label">💰 Total de la Compra:</span>
            <span className="total-amount">{formatCOP(calculateTotal())}</span>
          </div>
        </div>
      )}

      {/* Botones */}
      <div className="form-buttons">
        <button
          type="submit"
          className="btn-submit"
        >
          ✅ Registrar Venta
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-cancel"
        >
          ❌ Cancelar
        </button>
      </div>
    </form>
  )
}

export default SalesForm
