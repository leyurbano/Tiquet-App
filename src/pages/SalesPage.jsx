import React, { useState, useEffect } from 'react'
import SalesForm from '../components/SalesForm'
import SalesList from '../components/SalesList'
import { salesService } from '../services/salesService'
import { productService } from '../services/productService'
import './SalesPage.css'

function SalesPage() {
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(true)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    const [salesData, productsData] = await Promise.all([
      salesService.getAllSales(),
      productService.getAllProducts()
    ])
    setSales(salesData)
    setProducts(productsData.data || [])
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

  return (
    <div className="sales-page">
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
            loading={loading}
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