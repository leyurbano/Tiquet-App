import React, { useState, useEffect, useRef } from 'react'
import './Navbar.css'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useCashSession } from '../contexts/CashSessionContext'
import { negocioService } from '../services/negocioService'
import { formatHoraColombia } from '../utils/dateFormatter'
import CierreCajaModal from './CierreCajaModal'
import CambiarContrasenaModal from './CambiarContrasenaModal'
import {
  ChevronDown, KeyRound, LogOut, ShoppingCart, Package, Boxes, Warehouse,
  Users, BarChart3, Store, Settings, UserCog, LayoutGrid
} from 'lucide-react'

const iniciales = (texto) =>
  (texto || '')
    .replace(/@.*/, '') // si solo hay correo, se usa lo que va antes de la @
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase() || '?'

/**
 * Barra de navegación.
 *
 * 🔧 Antes eran hasta 11 botones sueltos que se desbordaban en portátiles y
 * tablets, y no se veía quién tenía la sesión abierta. En un computador de
 * caja compartido eso importa: si un vendedor sigue vendiendo en la sesión
 * de otro, las ventas y el efectivo quedan a nombre del otro.
 *
 * Ahora: cinco secciones (agrupadas con menús desplegables) y, a la derecha,
 * la cuenta con nombre, rol, negocio y estado de la caja.
 * Lo que ve cada rol no cambió; solo está reorganizado.
 *
 * Todas las clases llevan el prefijo nb-: los CSS de la app son globales, y
 * nombres genéricos como .logo-title chocaban con los de otras pantallas.
 */
function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, perfil, logout, esAdministrador, esSuperAdmin } = useAuth()
  const { session } = useCashSession()
  const [menuOpen, setMenuOpen] = useState(false) // menú hamburguesa (pantallas chicas)
  const [abierto, setAbierto] = useState(null) // desplegable abierto: id del grupo o 'cuenta'
  const [showCierre, setShowCierre] = useState(false) // arqueo antes de salir
  const [showContrasena, setShowContrasena] = useState(false)
  const [nombreNegocio, setNombreNegocio] = useState('')
  const menuRef = useRef(null) // para cerrar al hacer clic afuera

  // Nombre del negocio de la sesión. Se busca por el negocio del perfil: un
  // super admin puede ver varios negocios y no sirve tomar el primero
  const negocioId = perfil?.negocio_id
  useEffect(() => {
    if (!negocioId) return
    negocioService.getNegocios().then((lista) =>
      setNombreNegocio(lista.find((n) => n.id === negocioId)?.nombre_comercial || '')
    )
  }, [negocioId])

  const nombreUsuario = perfil?.nombre || user?.email || 'Usuario'
  const rol = esSuperAdmin
    ? 'Super admin'
    : perfil?.rol === 'administrador'
      ? 'Administrador'
      : 'Vendedor'
  const negocio = negocioId ? nombreNegocio : esSuperAdmin ? 'Plataforma' : ''
  const detalleCuenta = `${rol}${negocio ? ` · ${negocio}` : ''}`
  const estadoCaja = session
    ? `Caja abierta desde ${formatHoraColombia(session.abierta_en)}`
    : 'Sin caja abierta'
  // Con caja abierta, salir pasa primero por el cierre: el botón lo dice
  const textoSalir = session ? 'Cerrar caja y salir' : 'Cerrar sesión'

  // ---- Secciones según el rol (los mismos permisos de antes) ----------
  // Ícono + texto: quien atiende la caja reconoce el ícono de un vistazo
  const itemsCatalogo = [
    { ruta: '/products', etiqueta: 'Productos', icono: Boxes },
    ...(esAdministrador ? [{ ruta: '/inventario', etiqueta: 'Inventario', icono: Warehouse }] : [])
  ]
  const itemsNegocio = [
    ...(esAdministrador
      ? [
          { ruta: '/configuracion', etiqueta: 'Configuración', icono: Settings },
          { ruta: '/usuarios', etiqueta: 'Usuarios', icono: UserCog }
        ]
      : []),
    ...(esSuperAdmin ? [{ ruta: '/plataforma', etiqueta: 'Plataforma', icono: LayoutGrid }] : [])
  ]
  const secciones = [
    { id: 'ventas', icono: ShoppingCart, items: [{ ruta: '/sales', etiqueta: 'Ventas', icono: ShoppingCart }] },
    { id: 'catalogo', etiqueta: 'Catálogo', icono: Package, items: itemsCatalogo },
    { id: 'clientes', icono: Users, items: [{ ruta: '/clients', etiqueta: 'Clientes', icono: Users }] },
    ...(esAdministrador
      ? [{ id: 'reportes', icono: BarChart3, items: [{ ruta: '/cierre', etiqueta: 'Reportes', icono: BarChart3 }] }]
      : []),
    { id: 'negocio', etiqueta: 'Negocio', icono: Store, items: itemsNegocio }
  ].filter((s) => s.items.length > 0)

  const esActiva = (ruta) => location.pathname === ruta

  // ---- Acciones ----------------------------------------------------------
  const cerrarMenus = () => {
    setMenuOpen(false)
    setAbierto(null)
  }

  const handleNav = (path) => {
    navigate(path)
    cerrarMenus()
  }

  const salir = async () => {
    await logout()
    navigate('/')
  }

  // Con caja abierta, primero se hace el arqueo del turno; sin caja abierta
  // (por ejemplo si se omitió la apertura) se cierra sesión directamente
  const handleLogout = () => {
    cerrarMenus()
    if (session) setShowCierre(true)
    else salir()
  }

  const abrirContrasena = () => {
    cerrarMenus()
    setShowContrasena(true)
  }

  const alternar = (id) => setAbierto((actual) => (actual === id ? null : id))

  // Teclado en un desplegable: flechas para moverse, Escape para cerrar y
  // volver al botón que lo abrió
  const teclasGrupo = (id) => (e) => {
    const contenedor = e.currentTarget
    const disparador = contenedor.querySelector('[aria-haspopup]')

    if (e.key === 'Escape' && abierto === id) {
      e.preventDefault()
      setAbierto(null)
      disparador?.focus()
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()

    if (abierto !== id) {
      setAbierto(id)
      requestAnimationFrame(() => contenedor.querySelector('[role="menuitem"]')?.focus())
      return
    }
    const items = [...contenedor.querySelectorAll('[role="menuitem"]')]
    const i = items.indexOf(document.activeElement)
    const siguiente = e.key === 'ArrowDown'
      ? (i + 1) % items.length
      : (i - 1 + items.length) % items.length
    items[siguiente]?.focus()
  }

  // Si el foco sale del desplegable (Tab o clic en otra parte), se cierra
  const alSalirFoco = (id) => (e) => {
    if (abierto === id && !e.currentTarget.contains(e.relatedTarget)) setAbierto(null)
  }

  // Cerrar al hacer clic fuera de la barra
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) cerrarMenus()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Escape cierra el menú hamburguesa y cualquier desplegable
  useEffect(() => {
    if (!menuOpen && !abierto) return
    const alPresionar = (e) => {
      if (e.key === 'Escape') cerrarMenus()
    }
    document.addEventListener('keydown', alPresionar)
    return () => document.removeEventListener('keydown', alPresionar)
  }, [menuOpen, abierto])

  // Cerrar al cambiar de ruta (por si navegan con el botón atrás)
  useEffect(() => {
    cerrarMenus()
  }, [location.pathname])

  const avatar = (
    <span className={`nb-avatar ${session ? 'nb-caja-abierta' : ''}`} aria-hidden="true">
      {iniciales(nombreUsuario)}
      <span className="nb-caja-punto" />
    </span>
  )

  return (
    <>
    <nav className="nb" ref={menuRef} aria-label="Navegación principal">
      <div className="nb-contenedor">
        <div className="nb-fila">

          <button type="button" className="nb-marca" onClick={() => handleNav('/sales')} title="Ir a Ventas">
            <img src="/icono.svg" alt="" className="nb-marca-icono" />
            <span className="nb-marca-texto">Tiquet-App</span>
          </button>

          {/* Secciones: en línea en pantallas grandes, en el menú hamburguesa en las chicas */}
          <div className={`nb-secciones ${menuOpen ? 'nb-secciones-abierto' : ''}`}>

            {/* Solo en el menú hamburguesa: quién tiene la sesión */}
            <div className="nb-movil-usuario">
              {avatar}
              <span className="nb-movil-textos">
                <strong>{nombreUsuario}</strong>
                <span>{detalleCuenta}</span>
                <span className={`nb-estado-caja ${session ? 'abierta' : ''}`}>{estadoCaja}</span>
              </span>
            </div>

            {secciones.map((s) =>
              s.items.length === 1 ? (
                <button
                  key={s.id}
                  type="button"
                  className={`nb-link ${esActiva(s.items[0].ruta) ? 'nb-link-activo' : ''}`}
                  onClick={() => handleNav(s.items[0].ruta)}
                  aria-current={esActiva(s.items[0].ruta) ? 'page' : undefined}
                >
                  <s.icono size={17} className="nb-icono" aria-hidden="true" />
                  {s.items[0].etiqueta}
                </button>
              ) : (
                <div
                  key={s.id}
                  className="nb-grupo"
                  onKeyDown={teclasGrupo(s.id)}
                  onBlur={alSalirFoco(s.id)}
                >
                  <button
                    type="button"
                    className={`nb-link nb-grupo-btn ${s.items.some((i) => esActiva(i.ruta)) ? 'nb-link-activo' : ''}`}
                    aria-haspopup="menu"
                    aria-expanded={abierto === s.id}
                    onClick={() => alternar(s.id)}
                  >
                    <s.icono size={17} className="nb-icono" aria-hidden="true" />
                    {s.etiqueta}
                    <ChevronDown size={15} className="nb-flecha" aria-hidden="true" />
                  </button>
                  {/* En el menú hamburguesa el grupo se muestra como título de sección */}
                  <span className="nb-grupo-titulo">{s.etiqueta}</span>
                  <div className={`nb-menu ${abierto === s.id ? 'nb-menu-abierto' : ''}`} role="menu" aria-label={s.etiqueta}>
                    {s.items.map((item) => (
                      <button
                        key={item.ruta}
                        type="button"
                        role="menuitem"
                        className={`nb-menu-item ${esActiva(item.ruta) ? 'nb-menu-item-activo' : ''}`}
                        onClick={() => handleNav(item.ruta)}
                        aria-current={esActiva(item.ruta) ? 'page' : undefined}
                      >
                        <item.icono size={16} aria-hidden="true" />
                        {item.etiqueta}
                      </button>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* Solo en el menú hamburguesa: acciones de la cuenta */}
            <div className="nb-movil-cuenta">
              <button type="button" className="nb-menu-item" onClick={abrirContrasena}>
                <KeyRound size={16} aria-hidden="true" /> Cambiar contraseña
              </button>
              <button type="button" className="nb-menu-item nb-menu-salir" onClick={handleLogout}>
                <LogOut size={16} aria-hidden="true" /> {textoSalir}
              </button>
            </div>
          </div>

          {/* Cuenta: quién está conectado, en qué negocio y si tiene caja abierta */}
          <div className="nb-cuenta" onKeyDown={teclasGrupo('cuenta')} onBlur={alSalirFoco('cuenta')}>
            <button
              type="button"
              className="nb-cuenta-btn"
              aria-haspopup="menu"
              aria-expanded={abierto === 'cuenta'}
              onClick={() => alternar('cuenta')}
              title={`${nombreUsuario} · ${estadoCaja}`}
            >
              {avatar}
              <span className="nb-cuenta-textos">
                <span className="nb-cuenta-nombre">{nombreUsuario}</span>
                <span className="nb-cuenta-rol">{detalleCuenta}</span>
              </span>
              <ChevronDown size={15} aria-hidden="true" className="nb-cuenta-flecha" />
            </button>

            {abierto === 'cuenta' && (
              <div className="nb-menu nb-menu-abierto nb-menu-derecha" role="menu" aria-label="Cuenta">
                <div className="nb-cuenta-info">
                  <strong>{nombreUsuario}</strong>
                  {user?.email && user.email !== nombreUsuario && <span>{user.email}</span>}
                  <span>{detalleCuenta}</span>
                  <span className={`nb-estado-caja ${session ? 'abierta' : ''}`}>{estadoCaja}</span>
                </div>
                <button type="button" role="menuitem" className="nb-menu-item" onClick={abrirContrasena}>
                  <KeyRound size={15} aria-hidden="true" /> Cambiar contraseña
                </button>
                <button type="button" role="menuitem" className="nb-menu-item nb-menu-salir" onClick={handleLogout}>
                  <LogOut size={15} aria-hidden="true" /> {textoSalir}
                </button>
              </div>
            )}
          </div>

          {/* Botón hamburguesa — solo en pantallas chicas */}
          <button
            type="button"
            className="nb-hamburguesa"
            onClick={() => {
              setAbierto(null)
              setMenuOpen((prev) => !prev)
            }}
            aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
            aria-expanded={menuOpen}
          >
            <span className={`nb-linea ${menuOpen ? 'nb-linea-1' : ''}`} />
            <span className={`nb-linea ${menuOpen ? 'nb-linea-2' : ''}`} />
            <span className={`nb-linea ${menuOpen ? 'nb-linea-3' : ''}`} />
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
    {showContrasena && (
      <CambiarContrasenaModal onCerrar={() => setShowContrasena(false)} />
    )}
    </>
  )
}

export default Navbar
