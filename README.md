# 📊 SisVentas - Sistema de Gestión de Ventas y Productos

Sistema completo de gestión de ventas y productos desarrollado con React JS, JavaScript y Supabase.

## 🚀 Características

### 📦 Módulo de Productos
- ✅ Crear nuevos productos
- ✅ Editar información de productos
- ✅ Eliminar productos
- ✅ Control de inventario y stock
- ✅ Gestión de categorías
- ✅ Búsqueda y filtrado de productos

### 💰 Módulo de Ventas
- ✅ Registrar nuevas ventas
- ✅ Múltiples métodos de pago (efectivo, tarjeta, transferencia, cheque)
- ✅ Gestión de clientes
- ✅ Historial completo de transacciones
- ✅ Cálculo automático de totales
- ✅ Búsqueda de ventas por cliente

### 📊 Dashboard
- ✅ Vista general del sistema
- ✅ Estadísticas rápidas
- ✅ Acceso a módulos principales

## 🛠️ Instalación

### Requisitos Previos
- Node.js 16+ instalado
- Una cuenta en Supabase (https://supabase.com)

### Pasos de Instalación

1. **Instalar dependencias**
\\\ash
npm install
\\\

2. **Configurar variables de entorno**
\\\ash
cp .env.example .env.local
\\\

Edita \.env.local\ con tus credenciales de Supabase:
\\\
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
\\\

3. **Crear tablas en Supabase**

Ejecuta el siguiente SQL en el editor SQL de Supabase:

\\\sql
-- Tabla de Productos
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  category VARCHAR(100),
  sku VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de Ventas
CREATE TABLE sales (
  id BIGSERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(20),
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50),
  status VARCHAR(50) DEFAULT 'completed',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabla de Items de Ventas
CREATE TABLE sales_items (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  subtotal DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índices para mejor rendimiento
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_sales_customer ON sales(customer_name);
CREATE INDEX idx_sales_items_sale_id ON sales_items(sale_id);
CREATE INDEX idx_sales_items_product_id ON sales_items(product_id);
\\\

4. **Ejecutar la aplicación**
\\\ash
npm run dev
\\\

La aplicación se abrirá en \http://localhost:5173\

## 📁 Estructura del Proyecto

\\\
src/
├── components/           # Componentes reutilizables
│   ├── Navbar.jsx       # Barra de navegación
│   ├── ProductForm.jsx  # Formulario de productos
│   ├── ProductList.jsx  # Lista de productos
│   ├── SalesForm.jsx    # Formulario de ventas
│   └── SalesList.jsx    # Lista de ventas
├── pages/               # Páginas principales
│   ├── Dashboard.jsx    # Panel principal
│   ├── ProductsPage.jsx # Página de productos
│   └── SalesPage.jsx    # Página de ventas
├── services/            # Servicios de API
│   ├── supabaseClient.js  # Cliente de Supabase
│   ├── productService.js  # Servicio de productos
│   └── salesService.js    # Servicio de ventas
├── App.jsx              # Componente principal
└── main.jsx             # Punto de entrada
\\\

## 🎨 Tecnologías Utilizadas

- **React 19** - Librería UI
- **JavaScript** - Lenguaje de programación
- **Tailwind CSS** - Framework CSS
- **Supabase** - Backend y base de datos
- **Vite** - Herramienta de construcción

## 📦 Scripts Disponibles

- \
pm run dev\ - Ejecutar en modo desarrollo
- \
pm run build\ - Construir para producción
- \
pm run preview\ - Previsualizar build de producción

## 🔒 Seguridad

- Las credenciales de Supabase se almacenan en variables de entorno
- No incluyas \.env.local\ en el control de versiones
- Usa las políticas de RLS en Supabase para mayor seguridad

---

Desarrollado con ❤️
