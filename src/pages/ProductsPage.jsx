import React, { useState, useEffect, useCallback } from "react";
import { toast } from '../utils/toast'
import ProductForm from "../components/ProductForm";
import ProductList from "../components/ProductList";
import { productService } from "../services/productService";
import "./ProductsPage.css";
import { PlusCircle } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { negocioService } from "../services/negocioService";

function ProductsPage() {
  // La RLS es quien realmente lo impide; esto evita mostrar acciones que fallarían
  const { esAdministrador } = useAuth();
  const [products, setProducts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [loading, setLoading] = useState(false);
  // Fija en 1 hasta que exista paginación real (hoy se traen 1000 de una vez)
  const [currentPage] = useState(1);
  const [productsPerPage] = useState(1000);
  // Hay cambios escritos sin guardar en el modal
  const [formSucio, setFormSucio] = useState(false);
  // Umbral general del negocio para las alertas de stock bajo
  const [minimoNegocio, setMinimoNegocio] = useState(0);

  useEffect(() => {
    loadProducts(1);
    negocioService.getMiNegocio().then((n) =>
      setMinimoNegocio(n?.stock_minimo_defecto ?? 0)
    );
    // Carga única al montar: loadProducts se recrea en cada render y no cambia
    // lo que trae, así que no va en las dependencias
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProducts = async (page) => {
    setLoading(true);
    const result = await productService.getAllProducts(page, productsPerPage);
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
      loadProducts(1);
    } else {
      toast.error("No se pudo crear el producto: " + (error || "error desconocido"));
    }
    setLoading(false);
    // El formulario necesita saber si guardó para decidir si se limpia
    return !!newProduct;
  };

  const handleUpdateProduct = async (formData) => {
    setLoading(true);
    const updated = await productService.updateProduct(
      editingProduct.id,
      formData,
    );
    if (updated) {
      setEditingProduct(null);
      setShowForm(false);
      setFormSucio(false);
      toast.exito("Producto actualizado exitosamente");
      loadProducts(currentPage);
    } else {
      toast.error("Error al actualizar el producto");
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

  useEffect(() => {
    if (!showForm) return;

    document.body.style.overflow = "hidden";
    const handleKeyDown = (e) => {
      if (e.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
    // closeForm va en las dependencias: sin eso, el manejador de Escape se
    // quedaría con la primera versión y saltaría la confirmación de cambios
    // sin guardar. useCallback hace que solo cambie cuando cambia formSucio
  }, [showForm, closeForm]);

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
        {esAdministrador && !showForm && (
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
          />
        </div>
      </div>

      {showForm && (
        <div className="pf-overlay" onClick={() => closeForm()}>
          <div className="pf-box" onClick={(e) => e.stopPropagation()}>
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
