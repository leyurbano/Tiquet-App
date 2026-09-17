import React, { useState, useEffect, useCallback } from "react";
import { toast } from '../utils/toast'
import ProductForm from "../components/ProductForm";
import ProductList from "../components/ProductList";
import { productService } from "../services/productService";
import "./ProductsPage.css";
import { PlusCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { negocioService } from "../services/negocioService";
import { useDialogo } from "../hooks/useDialogo";

// Ventana para medir si un producto rota. Un mes cubre la compra
// mensual típica de una tienda sin castigar lo de venta lenta.
const DIAS_ROTACION = 30;

function ProductsPage() {
  // La RLS es quien realmente lo impide; esto evita mostrar acciones que fallarían
  const { esAdministrador } = useAuth();
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  // Hay cambios escritos sin guardar en el modal
  const [formSucio, setFormSucio] = useState(false);
  // Umbral general del negocio para las alertas de stock bajo
  const [minimoNegocio, setMinimoNegocio] = useState(0);
  // Unidades vendidas por producto en el último mes: la alerta de stock
  // solo avisa de lo que rota. null = todavía no cargó o no está la
  // migración 33, y entonces se avisa solo por umbral.
  const [rotacion, setRotacion] = useState(null);

  useEffect(() => {
    loadProducts();
    negocioService.getMiNegocio().then((n) =>
      setMinimoNegocio(n?.stock_minimo_defecto ?? 0)
    );
    productService.getRotacion(DIAS_ROTACION).then(setRotacion);
  }, []);

  // 🔧 Antes se traían máximo 1.000 productos: en un negocio más grande, el
  // resto no aparecía. Ahora llega el catálogo completo y ProductList pinta
  // 50 por página.
  const loadProducts = async () => {
    setLoading(true);
    const result = await productService.getTodosLosProductos();
    if (result.error) toast.error("No se pudieron cargar los productos. Recarga la página.");
    setProducts(result.data);
    setLoading(false);
  };

  const handleCreateProduct = async (formData) => {
    setLoading(true);
    const { producto: newProduct, error } = await productService.createProduct(formData);
    if (newProduct) {
      setShowForm(false);
      setFormSucio(false);
      toast.exito("Producto creado exitosamente");
      loadProducts();
    } else {
      toast.error("No se pudo crear el producto: " + (error || "error desconocido"));
    }
    setLoading(false);
    // El formulario necesita saber si guardó para decidir si se limpia
    return !!newProduct;
  };

  const handleUpdateProduct = async (formData) => {
    setLoading(true);
    const { producto: updated, error } = await productService.updateProduct(
      editingProduct.id,
      formData,
    );
    if (updated) {
      setEditingProduct(null);
      setShowForm(false);
      setFormSucio(false);
      toast.exito("Producto actualizado exitosamente");
      loadProducts();
    } else {
      toast.error("No se pudo actualizar el producto: " + (error || "error desconocido"));
    }
    setLoading(false);
    return !!updated;
  };

  const closeForm = useCallback(({ forzar = false } = {}) => {
    // Un clic en el fondo o un Escape no deberían borrar lo escrito sin avisar
    if (!forzar && formSucio &&
        !window.confirm("Hay cambios sin guardar. ¿Descartarlos?")) {
      return;
    }
    setShowForm(false);
    setEditingProduct(null);
    setFormSucio(false);
  }, [formSucio]);

  // Escape (con la confirmación de cambios sin guardar), foco, Tab y scroll.
  // El hook siempre usa la versión más reciente de closeForm
  const refDialogo = useDialogo({ onCerrar: () => closeForm(), activo: showForm });

  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowForm(true);
  };

  const handleSubmit = (formData) => {
    return editingProduct
      ? handleUpdateProduct(formData)
      : handleCreateProduct(formData);
  };

  return (
    <div className="products-page">
      <div className="products-header">
        <h1 className="products-title">📦 Gestión de Productos</h1>
        {/* Siempre montado: si se desmonta al abrir el formulario, al cerrarlo
            el foco del teclado no tiene a dónde volver */}
        {esAdministrador && (
          <button onClick={() => setShowForm(true)} className="btn-new-product">
            <PlusCircle size={18} /> Nuevo Producto
          </button>
        )}
      </div>
      <div className="products-grid">
        <div className="products-list-section full-width">
          <ProductList
            products={products}
            onEdit={esAdministrador ? handleEdit : null}
            loading={loading}
            minimoNegocio={minimoNegocio}
            rotacion={rotacion}
            mostrarCostos={esAdministrador}
          />
        </div>
      </div>

      {showForm && (
        <div className="pf-overlay" onClick={() => closeForm()}>
          <div className="pf-box" onClick={(e) => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label={editingProduct ? "Editar producto" : "Nuevo producto"}>
            <ProductForm
              initialData={editingProduct}
              onSubmit={handleSubmit}
              onCancel={() => closeForm()}
              onDirtyChange={setFormSucio}
              minimoNegocio={minimoNegocio}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductsPage;
