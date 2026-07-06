import React from 'react'
import './Navbar.css'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  const handleLogout = async () => {
    try {
      await logout()
      navigate('/login')
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
    }
  }

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <div className="navbar-content">
          <div className="navbar-logo">
            <h1 className="logo-title">FRALUDETALLES</h1>
          </div>

          <div className="navbar-links">
            <button 
              className={`nav-button ${location.pathname === '/sales' ? 'nav-active' : 'nav-inactive'}`}
              onClick={() => navigate('/sales')}
            >
              Ventas
            </button>
            <button 
              className={`nav-button ${location.pathname === '/products' ? 'nav-active' : 'nav-inactive'}`}
              onClick={() => navigate('/products')}
            >
              Productos
            </button>
            <button 
              className={`nav-button ${location.pathname === '/clients' ? 'nav-active' : 'nav-inactive'}`}
              onClick={() => navigate('/clients')}
            >
              Clientes
            </button>
            <button 
              className="nav-button logout-btn"
              onClick={handleLogout}
            >
              Cerrar Sesión
            </button>
          </div>

          <div className="navbar-spacer"></div>
        </div>
      </div>
    </nav>
  )
}

export default Navbar
