import React, { useState, useRef } from "react";
import "./ProductList.css";
import { formatCOP, formatNumero } from "../utils/currencyFormatter";
import ProductHistoryModal from "./ProductHistoryModal";
import MovimientoStockModal from "./MovimientoStockModal";
import Paginacion from "./Paginacion";
import { Pencil, History, Package, AlertTriangle, ArrowUpDown, ArrowDownWideNarrow, Loader2 } from "lucide-react";
import { estadoStock, contarBajos, umbralDe } from "../utils/stock";
import { numeroProducto, coincideNumero, nombreProducto } from "../utils/producto";
import { useEsCelular } from "../hooks/useEsCelular";

// 25 y no 50: sin scroll interno, 50 filas son casi tres pantallas y la
// paginación queda al fondo. Para buscar algo puntual está el buscador
const POR_PAGINA = 25;

// El orden lo elige el usuario. Por defecto, por número: es la costumbre de
// quien ya se sabe el catálogo. "Más recientes" evita que un producto recién
// creado quede escondido en la última página.
const ORDENES = {
  numero: {
    etiqueta: "Número (1, 2, 3…)",
    comparar: (a, b) => numeroProducto(a) - numeroProducto(b),
  },
  recientes: {
    etiqueta: "Más recientes",
    comparar: (a, b) => numeroProducto(b) - numeroProducto(a),
  },
  nombre: {
    etiqueta: "Nombre (A → Z)",
    comparar: (a, b) =>
      (a.descripcion || "").localeCompare(b.descripcion || "", "es"),
  },
  stock: {
    etiqueta: "Menos stock primero",
    comparar: (a, b) => (a.cantidad || 0) - (b.cantidad || 0),
  },
};

/**
 * Lista del catálogo. Recibe TODOS los productos (los totales y las alertas
 * de stock se calculan sobre el catálogo completo) y pinta POR_PAGINA a la vez:
 * pintar miles de filas a la vez es lo que volvía lenta la pantalla.
 */
function ProductList({
  products,
  onEdit,
  loading = false,
  minimoNegocio = 0,
  rotacion = null,
  mostrarCostos = false,
  puedeMoverStock = false,
  onMovimientoRegistrado = null,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [orden, setOrden] = useState("numero");
  const [historyProduct, setHistoryProduct] = useState(null);
  // Producto al que se le están sumando o bajando unidades (o null)
  const [movimientoProduct, setMovimientoProduct] = useState(null);
  const [soloBajos, setSoloBajos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const inicioLista = useRef(null);
  const esCelular = useEsCelular();

  const alertas = contarBajos(products || [], minimoNegocio, rotacion);
  const totalAlertas = alertas.agotados + alertas.bajos;

  const termino = searchTerm.trim().toLowerCase();
  const filteredProducts = (products || []).filter((product) => {
    if (soloBajos && estadoStock(product, minimoNegocio, rotacion) === "ok") return false;
    if (!termino) return true;
    return (
      (product.descripcion || "").toLowerCase().includes(termino) ||
      coincideNumero(product, termino) ||
      (product.codigo_barras || "").toLowerCase().includes(termino)
    );
  });

  // Copia antes de ordenar: sort modifica el arreglo original
  const ordenados = [...filteredProducts].sort(ORDENES[orden].comparar);

  // Si la lista se achica (búsqueda, filtro, recarga), la página se ajusta sola
  const totalPaginas = Math.max(Math.ceil(ordenados.length / POR_PAGINA), 1);
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = ordenados.slice(
    (paginaActual - 1) * POR_PAGINA,
    paginaActual * POR_PAGINA,
  );

  const cambiarPagina = (nueva) => {
    setPagina(nueva);
    inicioLista.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const totalProducts = (products || []).reduce(
    (sum, product) => sum + (product.cantidad || 0),
    0,
  );
  // Solo los administradores reciben los costos desde la base de datos
  const totalInventoryValue = (products || []).reduce(
    (sum, product) => sum + (Number(product.costo_total) || 0),
    0,
  );

  return (
    <div className="product-list-container" ref={inicioLista}>
      <h2 className="product-list-title">
        <Package size={20} aria-hidden="true" /> Lista de Productos ({filteredProducts.length})
      </h2>

      <div className="search-and-stats-wrapper">
        {/* La búsqueda ya encontraba por código de barras, pero no lo decía.
            En celular el texto completo no cabe y se cortaba: ahí se omite,
            aunque se sigue buscando por código */}
        <input
          type="text"
          aria-label="Buscar por nombre, número o código de barras"
          placeholder={esCelular ? "Nombre o número" : "Nombre, número o código de barras"}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setPagina(1);
          }}
          className="pl-buscador"
        />
        {/* En celular se ve solo el icono (ver ProductList.css). El
            aria-label nombra el menú aunque la etiqueta esté oculta */}
        <label className={`orden-campo ${orden !== "numero" ? "orden-activo" : ""}`}>
          <span className="orden-etiqueta">Ordenar por</span>
          <ArrowDownWideNarrow size={20} className="orden-icono" aria-hidden="true" />
          <select
            aria-label="Ordenar por"
            title={`Ordenar por: ${ORDENES[orden].etiqueta}`}
            value={orden}
            onChange={(e) => {
              setOrden(e.target.value);
              setPagina(1);
            }}
            className="orden-select"
          >
            {Object.entries(ORDENES).map(([clave, o]) => (
              <option key={clave} value={clave}>{o.etiqueta}</option>
            ))}
          </select>
        </label>
        <div className="stats-container">
          <div className="stat-label">
            <span className="stat-label-text">Unidades en stock:</span>
            <span className="stat-value">{formatNumero(totalProducts)}</span>
          </div>
          {mostrarCostos && (
            <div className="stat-label">
              <span className="stat-label-text">Valor Inventario:</span>
              <span className="stat-value">{formatCOP(totalInventoryValue)}</span>
            </div>
          )}
        </div>
      </div>

      {totalAlertas > 0 && (
        <button
          type="button"
          className={`stock-alert-bar ${soloBajos ? "stock-alert-activa" : ""}`}
          aria-pressed={soloBajos}
          onClick={() => {
            setSoloBajos((v) => !v);
            setPagina(1);
          }}
        >
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            {alertas.agotados > 0 && (
              <strong>{alertas.agotados} agotado{alertas.agotados !== 1 ? "s" : ""}</strong>
            )}
            {alertas.agotados > 0 && alertas.bajos > 0 && " · "}
            {alertas.bajos > 0 && (
              <span>{alertas.bajos} por agotarse</span>
            )}
            {rotacion && <span className="stock-alert-nota">de lo que se está vendiendo</span>}
          </span>
          <span className="stock-alert-accion">
            {soloBajos ? "Ver todos" : "Ver solo estos"}
          </span>
        </button>
      )}

      {loading ? (
        <div className="pl-cargando">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Cargando productos...
        </div>
      ) : filteredProducts.length === 0 ? (
        <p className="pl-vacio">
          {soloBajos
            ? "Nada por reponer: lo que se está vendiendo tiene stock"
            : "No hay productos disponibles"}
        </p>
      ) : (
        <>
          <div className="pl-tabla-wrap">
            <table className="products-table">
              <thead>
                <tr className="pl-cabecera">
                  {/* Alineadas a la derecha por defecto (.pl-cabecera th),
                      igual que las cifras que encabezan */}
                  <th>#</th>
                  <th className="pl-th-izq">Descripción</th>
                  <th>Stock</th>
                  {mostrarCostos && (
                    <>
                      <th className="hide-mobile">Costo Unit.</th>
                      <th className="hide-mobile">Costo Total</th>
                    </>
                  )}
                  <th>Precio Venta</th>
                  <th className="pl-th-centro">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((product) => {
                  const estado = estadoStock(product, minimoNegocio, rotacion);
                  return (
                  <tr key={product.id} className={`pl-fila fila-${estado}`}>
                    <td className="cell-numeric">{numeroProducto(product)}</td>
                    <td className="cell-description">
                      {nombreProducto(product.descripcion)}
                    </td>
                    <td className="cell-numeric">
                      <span className={`stock-valor stock-${estado}`}>
                        {formatNumero(product.cantidad)}
                      </span>
                      {estado !== "ok" && (
                        <div className="stock-minimo">
                          mín. {formatNumero(umbralDe(product, minimoNegocio))}
                        </div>
                      )}
                    </td>
                    {mostrarCostos && (
                      <>
                        <td className="cell-numeric hide-mobile">
                          {formatCOP(product.costo || 0)}
                        </td>
                        <td className="cell-numeric hide-mobile">
                          {formatCOP(product.costo_total || 0)}
                        </td>
                      </>
                    )}
                    <td className="cell-numeric cell-price">
                      {product.precio_venta ? (
                        formatCOP(product.precio_venta)
                      ) : (
                        <span className="pl-sin-precio">Sin precio</span>
                      )}
                    </td>
                    <td className="cell-actions">
                      {/* El flex va en un div y no en el td: un td con
                          display:flex deja de ser celda y descuadra la fila */}
                      <div className="pl-acciones">
                        {onEdit && (
                          <button
                            onClick={() => onEdit(product)}
                            className="btn-edit"
                            title="Editar producto"
                            aria-label={`Editar ${product.descripcion}`}
                          >
                            {/* El texto va en <span>: en celular se oculta y
                                queda solo el ícono */}
                            <Pencil size={14} aria-hidden="true" /> <span>Editar</span>
                          </button>
                        )}
                        {/* Reponer es lo que más se hace desde esta lista: antes
                            obligaba a irse a Inventario y buscar el producto otra vez */}
                        {puedeMoverStock && (
                          <button
                            onClick={() => setMovimientoProduct(product)}
                            className="btn-stock"
                            title="Sumar o bajar unidades"
                            aria-label={`Mover stock de ${product.descripcion}`}
                          >
                            <ArrowUpDown size={14} aria-hidden="true" /> <span>Stock</span>
                          </button>
                        )}
                        {/* Botón eliminar deshabilitado: evita romper el historial de productos con ventas asociadas */}
                        <button
                          onClick={() => setHistoryProduct(product)}
                          className="btn-history"
                          title="Ver historial de movimientos"
                          aria-label={`Historial de ${product.descripcion}`}
                        >
                          <History size={14} aria-hidden="true" /> <span>Historial</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Paginacion
            pagina={paginaActual}
            totalPaginas={totalPaginas}
            total={filteredProducts.length}
            porPagina={POR_PAGINA}
            onCambiar={cambiarPagina}
          />
        </>
      )}

      {movimientoProduct && (
        <MovimientoStockModal
          producto={movimientoProduct}
          onCancel={() => setMovimientoProduct(null)}
          onRegistrado={() => {
            setMovimientoProduct(null);
            onMovimientoRegistrado?.();
          }}
        />
      )}

      {historyProduct && (
        <ProductHistoryModal
          product={historyProduct}
          onClose={() => setHistoryProduct(null)}
        />
      )}
    </div>
  );
}

export default ProductList;
