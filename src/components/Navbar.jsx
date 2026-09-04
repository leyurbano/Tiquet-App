import React, { useState, useEffect, useRef } from 'react'
import './Navbar.css'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCashSession } from '../contexts/CashSessionContext'
import CierreCajaModal from './CierreCajaModal'

function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()
  const { session } = useCashSession()
  const [menuOpen, setMenuOpen] = useState(false) // 🆕 estado del menú hamburguesa
  const [showCierre, setShowCierre] = useState(false) // 🆕 arqueo antes de salir
  const menuRef = useRef(null)                     // 🆕 para cerrar al hacer clic afuera

  const salir = async () => {
    await logout()
    navigate('/')
  }

  // 🆕 Con caja abierta, primero se hace el arqueo del turno; sin caja abierta
  // (por ejemplo si se omitió la apertura) se cierra sesión directamente.
  const handleLogout = () => {
    setMenuOpen(false)
    if (session) {
      setShowCierre(true)
    } else {
      salir()
    }
  }

  // 🆕 Cerrar menú al navegar
  const handleNav = (path) => {
    navigate(path)
    setMenuOpen(false)
  }

  // 🆕 Cerrar menú al hacer clic fuera de él
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // 🆕 Cerrar menú al cambiar de ruta (por si navegan con el botón atrás)
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <>
    <nav className="navbar" ref={menuRef}>
      <div className="navbar-container">
        <div className="navbar-content">

          {/* Logo */}
          <div className="navbar-logo">
            <h1 className="logo-title">Tiquet-App</h1>
          </div>

          {/* Links — visibles en desktop, ocultos en móvil */}
          <div className={`navbar-links ${menuOpen ? 'navbar-links-open' : ''}`}>
            <button
              className={`nav-button ${location.pathname === '/sales' ? 'nav-active' : 'nav-inactive'}`}
              onClick={() => handleNav('/sales')}
            >
              Ventas
            </button>
            <button
              className={`nav-button ${location.pathname === '/products' ? 'nav-active' : 'nav-inactive'}`}
              onClick={() => handleNav('/products')}
            >
              Productos
            </button>
            <button
              className={`nav-button ${location.pathname === '/clients' ? 'nav-active' : 'nav-inactive'}`}
              onClick={() => handleNav('/clients')}
            >
              Clientes
            </button>
            <button
              className={`nav-button ${location.pathname === '/cierre' ? 'nav-active' : 'nav-inactive'}`}
              onClick={() => handleNav('/cierre')}
            >
              Cierre
            </button>
            <button
              className="nav-button logout-btn"
              onClick={handleLogout}
            >
              Cerrar Sesión
            </button>
          </div>

          {/* Botón hamburguesa — solo visible en móvil */}
          <button
            className="navbar-hamburger"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-label="Abrir menú"
            aria-expanded={menuOpen}
          >
            <span className={`hamburger-line ${menuOpen ? 'line-top-open' : ''}`} />
            <span className={`hamburger-line ${menuOpen ? 'line-mid-open' : ''}`} />
            <span className={`hamburger-line ${menuOpen ? 'line-bot-open' : ''}`} />
          </button>

        </div>
      </div>
    </nav>

    {/* Fuera del <nav> a propósito: dentro heredaría su contexto de apilamiento */}
    {showCierre && (
      <CierreCajaModal
        onCancel={() => setShowCierre(false)}
        onDone={salir}
      />
    )}
    </>
  )
}

export default Navbar