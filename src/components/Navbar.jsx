import React from 'react'
import './Navbar.css'

function Navbar({ currentPage, setCurrentPage }) {
  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-content">
          {/* Logo */}
          <div className="navbar-logo">
            <h1 className="logo-title">📊 SisVentas</h1>
          </div>

          {/* Navigation Links */}
          <div className="navbar-links">
            <button
              onClick={() => setCurrentPage('products')}
              className={`nav-button ${currentPage === 'products' ? 'nav-active' : 'nav-inactive'}`}
            >
              📦 Productos
            </button>
            <button
              onClick={() => setCurrentPage('sales')}
              className={`nav-button ${currentPage === 'sales' ? 'nav-active' : 'nav-inactive'}`}
            >
              💰 Ventas
            </button>
            <button
              onClick={() => setCurrentPage('clients')}
              className={`nav-button ${currentPage === 'clients' ? 'nav-active' : 'nav-inactive'}`}
            >
              👥 Clientes
            </button>
          </div>

          {/* Spacer */}
          <div className="navbar-spacer"></div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
