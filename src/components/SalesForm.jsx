import React, { useState, useEffect } from "react"; // 🔧 CAMBIO: se agregó useEffect
import "./SalesForm.css";
import { formatCOP } from "../utils/currencyFormatter";
import { clientService } from "../services/clientService";
import { getTodayColombia } from "../utils/dateFormatter";
import MixedPaymentModal from "./MixedPaymentModal"; // 🆕 NUEVO: modal de pago mixto
import { salesService } from "../services/salesService"; // 🔧 CAMBIO: se usa el service layer en vez de supabase directo

function SalesForm({
  products,
  clients = [],
  onSubmit,
  onCancel,
  finalCustomerId = null,
}) {
  // ✅ CORRECCIÓN: getTodayColombia() en vez de new Date().toISOString().split('T')[0]
  // new Date().toISOString() siempre es UTC — a las 7 PM Colombia ya marca el día siguiente
  const [saleDate, setSaleDate] = useState(getTodayColombia);

  const [customer, setCustomer] = useState({
    name: "",
    cedula: "",
    phone: "",
  });

  const [items, setItems] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [quantity, setQuantity] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [customerFound, setCustomerFound] = useState(null);
  const [showAddCustomerBtn, setShowAddCustomerBtn] = useState(false);
  const [autoSetFinalCustomer, setAutoSetFinalCustomer] = useState(false);

  // 🆕 NUEVO: estados para medios de pago dinámicos y pago mixto
  const [mediosPago, setMediosPago] = useState([]);
  const [showMixedModal, setShowMixedModal] = useState(false);
  const [pagosMixtos, setPagosMixtos] = useState(null);

  // 🔧 CAMBIO: ahora usa salesService.getMediosPago() en vez de llamar a supabase directo,
  // manteniendo toda la lógica de acceso a datos dentro de la capa de servicios (igual que clientService).
  // Reemplaza el hardcodeo antiguo "cash"/"transfer" -> 1/2.
  useEffect(() => {
    const cargarMediosPago = async () => {
      const data = await salesService.getMediosPago();
      console.log("mediosPago:", data);
      setMediosPago(data);
    };
    cargarMediosPago();
  }, []);

  const handleProductSearch = (searchValue) => {
    setProductSearch(searchValue);
    if (!searchValue.trim()) {
      setFilteredProducts([]);
      setSelectedProduct("");
      return;
    }
    const search = searchValue.toLowerCase();
    const filtered = products.filter(
      (p) =>
        p.descripcion.toLowerCase().includes(search) ||
        p.name?.toLowerCase().includes(search) ||
        p.id.toString().includes(search),
    );
    setFilteredProducts(filtered);
  };

  const selectProductFromSearch = (product) => {
    setSelectedProduct(product.id.toString());
    setProductSearch(product.descripcion);
    setFilteredProducts([]);
  };

  const searchCustomerByCedula = async (cedula) => {
    const trimmedCedula = cedula.trim();
    if (!trimmedCedula || trimmedCedula.length === 0) {
      setCustomer({ name: "", cedula: "", phone: "" });
      setShowAddCustomerBtn(false);
      setCustomerFound(null);
      return;
    }
    setCustomer((prev) => ({ ...prev, cedula: cedula }));
    if (trimmedCedula.length < 6) return;
    try {
      const foundCustomer =
        await clientService.getClientByDocument(trimmedCedula);
      if (foundCustomer) {
        setCustomer({
          name: foundCustomer.nombre,
          cedula: foundCustomer.documento,
          phone: foundCustomer.telefono,
        });
        setCustomerFound(foundCustomer);
        setShowAddCustomerBtn(false);
      } else {
        setShowAddCustomerBtn(true);
        setCustomerFound(null);
      }
    } catch (error) {
      console.error("Error searching customer:", error);
      setShowAddCustomerBtn(false);
    }
  };

  const addNewCustomer = async () => {
    if (!customer.name.trim() || !customer.cedula.trim()) {
      alert("Por favor completa nombre y cédula del cliente");
      return;
    }
    try {
      const newCustomer = await clientService.createClient({
        nombre: customer.name,
        documento: customer.cedula,
        telefono: customer.phone || "",
      });
      if (newCustomer) {
        setCustomerFound(newCustomer);
        setShowAddCustomerBtn(false);
        alert("✅ Cliente registrado correctamente");
      }
    } catch (error) {
      console.error("Error adding customer:", error);
      alert("❌ Error al registrar el cliente");
    }
  };

  const getProductById = (productId) => {
    return products.find((p) => p.id === parseInt(productId));
  };

  const selectedProductData = selectedProduct
    ? getProductById(selectedProduct)
    : null;

  const addItem = async () => {
    if (!selectedProduct || !quantity) return;

    if (!customerFound && !autoSetFinalCustomer && !customer.cedula.trim()) {
      await searchCustomerByCedula("222222222");
    }

    const product = products.find((p) => p.id === parseInt(selectedProduct));
    if (!product) return;
    const existingItem = items.find((item) => item.product_id === product.id);
    if (existingItem) {
      setItems(
        items.map((item) =>
          item.product_id === product.id
            ? { ...item, quantity: item.quantity + parseInt(quantity) }
            : item,
        ),
      );
    } else {
      setItems([
        ...items,
        {
          product_id: product.id,
          product_name: product.descripcion || product.name,
          unit_price: product.precio_venta || product.price,
          quantity: parseInt(quantity),
        },
      ]);
    }
    setSelectedProduct("");
    setQuantity("");
    setAutoSetFinalCustomer(true);
  };

  const removeItem = (productId) => {
    setItems(items.filter((item) => item.product_id !== productId));
  };

  const calculateTotal = () => {
    return items.reduce(
      (sum, item) => sum + item.unit_price * item.quantity,
      0,
    );
  };

  // 🔧 CAMBIO: handleSubmit ahora es async y espera el resultado de onSubmit.
  // Antes se llamaba a onSubmit(...) sin esperar nada, y el formulario se limpiaba
  // de inmediato sin saber si la venta realmente se guardó. Con el trigger de
  // validación de pagos_venta, un pago mixto que no cuadre puede hacer que
  // createSale falle y revierta la venta — y el usuario no se enteraba, perdiendo
  // todos los datos ya digitados.
  const [isSubmitting, setIsSubmitting] = useState(false); // 🆕 NUEVO: evita doble-click mientras se guarda

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (items.length === 0) {
      alert("Agrega al menos un producto");
      return;
    }

    // 🔧 CAMBIO: ahora valida paymentMethod O pagosMixtos (antes solo validaba paymentMethod)
    if (!paymentMethod && !pagosMixtos) {
      alert("Selecciona una forma de pago");
      return;
    }

    // 🔧 CAMBIO: se eliminó el hardcodeo "cash"/"transfer" -> 1/2.
    // Ahora paymentMethod YA es el id real de medios_pago (ver botones dinámicos más abajo)

    setIsSubmitting(true);
    const resultado = await onSubmit({
      cliente_id: customerFound?.id || null,
      fecha: saleDate,
      total: calculateTotal(),
      medio_pago_id: pagosMixtos ? null : paymentMethod, // 🔧 CAMBIO: null si es mixto
      pagos: pagosMixtos || [
        { medio_pago_id: paymentMethod, monto: calculateTotal() },
      ], // 🆕 NUEVO: array de pagos, siempre presente (simple = 1 elemento, mixto = varios)
      customer_name: customer.name || "N/A",
      customer_cedula: customer.cedula || "N/A",
      customer_phone: customer.phone || "N/A",
      items: items.map((item) => ({
        producto_id: item.product_id,
        cantidad: item.quantity,
        precio: item.unit_price,
      })),
    });
    setIsSubmitting(false);

    // 🆕 NUEVO: si onSubmit devuelve algo "falsy" (null, false, undefined), la venta
    // NO se guardó (por ejemplo, el trigger de validar_suma_pagos la rechazó).
    // En ese caso no se limpia el formulario, para que el usuario no pierda sus datos.
    if (!resultado) {
      alert("❌ Error al registrar la venta. Verifica los datos e intenta de nuevo.");
      return;
    }

    setSaleDate(getTodayColombia());
    setCustomer({ name: "", cedula: "", phone: "" });
    setItems([]);
    setPaymentMethod("");
    setPagosMixtos(null); // 🆕 NUEVO: limpiar pago mixto tras registrar la venta
  };

  return (
    <form onSubmit={handleSubmit} className="sales-form-wrapper">
       <img
        src="/Fralu.png"
        alt=""
        className="marca-agua-form"
      />
      <h2 className="form-title">📝 Nueva Venta</h2>

      <div className="sf-section">
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
          
        </div>
      </div>

      <div className="sf-section">
        <h3 className="form-section-title">Datos del Cliente</h3>
        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">N° Documento</label>
            <input
              type="text"
              placeholder="CC, CE, NIT"
              value={customer.cedula}
              onChange={(e) => searchCustomerByCedula(e.target.value)}
              maxLength="10"
              className="form-input"
            />
            {showAddCustomerBtn && customer.cedula.trim().length > 0 && (
              <button
                type="button"
                onClick={addNewCustomer}
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
              onChange={(e) =>
                setCustomer({ ...customer, name: e.target.value })
              }
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
              onChange={(e) =>
                setCustomer({ ...customer, phone: e.target.value })
              }
              maxLength="10"
              className="form-input"
            />
          </div>
        </div>
      </div>

      <div className="sf-section">
        <h3 className="form-section-title">🛒 Agregar Productos</h3>
        <div className="add-product-section">
          <div className="form-row-add-item">
            <div className="form-group">
              <label className="form-label">Item</label>
              <input
                type="number"
                placeholder="producto"
                value={selectedProduct}
                onChange={(e) => {
                  setSelectedProduct(e.target.value);
                  if (e.target.value) {
                    const product = products.find(
                      (p) => p.id === parseInt(e.target.value),
                    );
                    if (product) setProductSearch(product.descripcion);
                  } else {
                    setProductSearch("");
                  }
                }}
                maxLength="5"
                className="form-input"
              />
            </div>
            <div className="form-group product-search-group">
              <label className="form-label">Descripción</label>
              <input
                type="text"
                placeholder="Busca por nombre..."
                value={productSearch}
                onChange={(e) => handleProductSearch(e.target.value)}
                className="form-input"
              />
              {filteredProducts.length > 0 && (
                <div className="product-dropdown">
                  {filteredProducts.map((product) => (
                    <div
                      key={product.id}
                      className="product-option"
                      onClick={() => selectProductFromSearch(product)}
                    >
                      <span className="product-option-name">
                        {product.descripcion}
                      </span>
                      <span className="product-option-price">
                        {formatCOP(product.precio_venta)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Cantidad</label>
              <input
                type="number"
                placeholder="Cantidad"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
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

      {items.length > 0 && (
        <div className="sf-section">
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
                <div className="col-total">
                  {formatCOP(item.unit_price * item.quantity)}
                </div>
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

          <div className="sf-total">
            <span className="total-label">💰 Total de la Compra:</span>
            <span className="total-amount">{formatCOP(calculateTotal())}</span>
          </div>
        </div>
      )}

      {/* 🔧 CAMBIO: bloque completo de "Forma de Pago" reescrito.
          Antes: 2 botones fijos ("cash"/"transfer") con texto hardcodeado.
          Ahora: botones generados dinámicamente desde `mediosPago` (tabla real de Supabase)
          + botón nuevo "Pago Mixto" que abre el modal. */}
      <div className="form-group">
        <label className="form-label">Forma de Pago</label>
        <div className="form-pago">
          {mediosPago.map((medio) => (
            <button
              key={medio.id}
              type="button"
              className={paymentMethod === medio.id ? "active" : ""}
              onClick={() => {
                setPaymentMethod(medio.id);
                setPagosMixtos(null); // limpia cualquier pago mixto previo al elegir un medio simple
              }}
            >
              {medio.pago}
            </button>
          ))}
          <button
            type="button"
            className={pagosMixtos ? "active" : ""}
            onClick={() => setShowMixedModal(true)}
          >
            Pago Mixto
          </button>
        </div>

        {/* 🆕 NUEVO: feedback visual cuando ya hay un pago mixto configurado */}
        {pagosMixtos && (
          <p style={{ color: "#065f46", fontSize: "0.85rem", marginTop: "4px" }}>
            ✅ Pago mixto configurado ({pagosMixtos.length} medios)
          </p>
        )}

        {!paymentMethod && !pagosMixtos && (
          <p style={{ color: "#c0392b", fontSize: "0.85rem", marginTop: "4px" }}>
            Selecciona una forma de pago
          </p>
        )}
      </div>

      {/* 🆕 NUEVO: modal de pago mixto, se muestra solo cuando showMixedModal es true */}
      {showMixedModal && (
        <MixedPaymentModal
          total={calculateTotal()}
          mediosPago={mediosPago}
          onClose={() => setShowMixedModal(false)}
          onConfirm={(pagos) => {
            setPagosMixtos(pagos);
            setPaymentMethod(null); // invalida el pago simple si había uno
            setShowMixedModal(false);
          }}
        />
      )}

      <div className="form-buttons">
        {/* 🔧 CAMBIO: disabled ahora considera paymentMethod O pagosMixtos, y también isSubmitting
            para evitar que el usuario haga doble-click mientras la venta se está guardando */}
        <button
          type="submit"
          className="btn-submit"
          disabled={(!paymentMethod && !pagosMixtos) || items.length === 0 || isSubmitting}
        >
          {isSubmitting ? "⏳ Guardando..." : "✅ Registrar Venta"}
        </button>
        <button type="button" onClick={onCancel} className="btn-cancel">
          ❌ Cancelar
        </button>
      </div>
    </form>
  );
}

export default SalesForm;