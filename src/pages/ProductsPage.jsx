import React, { useState, useEffect } from 'react'
import ProductForm from '../components/ProductForm'
import ProductList from '../components/ProductList'
import { productService } from '../services/productService'
import './ProductsPage.css'

function ProductsPage() {
  const [products, setProducts] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProducts, setTotalProducts] = useState(0)
  const [productsPerPage] = useState(1000)

  useEffect(() => {
    loadProducts(currentPage)
  }, [currentPage])

  const loadProducts = async (page) => {
    setLoading(true)
    const result = await productService.getAllProducts(page, productsPerPage)
    setProducts(result.data)
    setTotalProducts(result.total)
    setLoading(false)
  }

  const handleCreateProduct = async (formData) => {
    setLoading(true)
    const newProduct = await productService.createProduct(formData)
    if (newProduct) {
      setShowForm(false)
      alert('✅ Producto creado exitosamente')
      loadProducts(1)
    } else {
      alert('❌ Error al crear el producto')
    }
    setLoading(false)
  }

  const handleUpdateProduct = async (formData) => {
    setLoading(true)
    const updated = await productService.updateProduct(editingProduct.id, formData)
    if (updated) {
      setEditingProduct(null)
      setShowForm(false)
      alert('✅ Producto actualizado exitosamente')
      loadProducts(currentPage)
    } else {
      alert('❌ Error al actualizar el producto')
    }
    setLoading(false)
  }

  const handleDeleteProduct = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este producto?')) {
      setLoading(true)
      const deleted = await productService.deleteProduct(id)
      if (deleted) {
        alert('✅ Producto eliminado')
        loadProducts(currentPage)
      } else {
        alert('❌ Error al eliminar el producto')
      }
      setLoading(false)
    }
  }

  const handleEdit = (product) => {
    setEditingProduct(product)
    setShowForm(true)
  }

  const handleSubmit = (formData) => {
    if (editingProduct) {
      handleUpdateProduct(formData)
    } else {
      handleCreateProduct(formData)
    }
  }

  return (
    <div className="products-page">
      <div className="products-header">
        <h1 className="products-title">📦 Gestión de Productos</h1>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn-new-product">
            ➕ Nuevo Producto
          </button>
        )}
      </div>

      <div className="products-grid">
        {showForm && (
          <div className="form-section">
            <ProductForm
              initialData={editingProduct}
              onSubmit={handleSubmit}
              onCancel={() => { setShowForm(false); setEditingProduct(null) }}
            />
          </div>
        )}
        <div className={`list-section ${showForm ? 'with-form' : 'full-width'}`}>
          <ProductList
            products={products}
            onEdit={handleEdit}
            onDelete={handleDeleteProduct}
            loading={loading}
          />
        </div>
      </div>
    </div>
  )
}

export default ProductsPage