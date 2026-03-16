import React from 'react'
import './Dashboard.css'

function Dashboard() {
  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">Dashboard</h1>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card stat-blue">
          <div className="stat-content">
            <div>
              <p className="stat-label">Ventas Totales</p>
              <p className="stat-value">$0.00</p>
            </div>
            <span className="stat-icon">💰</span>
          </div>
        </div>

        <div className="stat-card stat-green">
          <div className="stat-content">
            <div>
              <p className="stat-label">Productos</p>
              <p className="stat-value">0</p>
            </div>
            <span className="stat-icon">📦</span>
          </div>
        </div>

        <div className="stat-card stat-purple">
          <div className="stat-content">
            <div>
              <p className="stat-label">Órdenes</p>
              <p className="stat-value">0</p>
            </div>
            <span className="stat-icon">📋</span>
          </div>
        </div>

        <div className="stat-card stat-orange">
          <div className="stat-content">
            <div>
              <p className="stat-label">Clientes</p>
              <p className="stat-value">0</p>
            </div>
            <span className="stat-icon">👥</span>
          </div>
        </div>
      </div>

      {/* Quick Access */}
      <div className="quick-access-grid">
        <div className="quick-access-card">
          <h2 className="quick-access-title">📦 Gestión de Productos</h2>
          <p className="quick-access-description">Administra tu catálogo de productos, actualiza precios y controla el inventario.</p>
          <ul className="quick-access-list">
            <li>✅ Crear nuevos productos</li>
            <li>✅ Editar información</li>
            <li>✅ Controlar stock</li>
            <li>✅ Gestionar categorías</li>
          </ul>
        </div>

        <div className="quick-access-card">
          <h2 className="quick-access-title">💳 Gestión de Ventas</h2>
          <p className="quick-access-description">Registra ventas, crea órdenes y gestiona pagos de tus clientes.</p>
          <ul className="quick-access-list">
            <li>✅ Registrar nuevas ventas</li>
            <li>✅ Múltiples métodos de pago</li>
            <li>✅ Historial de transacciones</li>
            <li>✅ Reportes de ventas</li>
          </ul>
        </div>
      </div>

      {/* Info Section */}
      <div className="info-section">
        <h3 className="info-title">ℹ️ Información Importante</h3>
        <p className="info-text">
          Este sistema de gestión está integrado con Supabase. Necesitas configurar tu cuenta de Supabase y crear las tablas necesarias.
        </p>
      </div>
    </div>
  )
}

export default Dashboard
