import React from 'react'
import './Paginacion.css'

/**
 * Controles de paginación para listas largas.
 * No se muestra si todo cabe en una página.
 */
function Paginacion({ pagina, totalPaginas, total, porPagina, onCambiar }) {
  if (totalPaginas <= 1) return null

  const desde = (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, total)

  return (
    <nav className="paginacion" aria-label="Paginación">
      <button
        type="button"
        className="paginacion-btn"
        onClick={() => onCambiar(1)}
        disabled={pagina === 1}
        aria-label="Primera página"
      >
        «
      </button>
      <button
        type="button"
        className="paginacion-btn"
        onClick={() => onCambiar(pagina - 1)}
        disabled={pagina === 1}
      >
        ‹ Anterior
      </button>

      <span className="paginacion-info">
        {desde}–{hasta} de {total} · página {pagina} de {totalPaginas}
      </span>

      <button
        type="button"
        className="paginacion-btn"
        onClick={() => onCambiar(pagina + 1)}
        disabled={pagina === totalPaginas}
      >
        Siguiente ›
      </button>
      <button
        type="button"
        className="paginacion-btn"
        onClick={() => onCambiar(totalPaginas)}
        disabled={pagina === totalPaginas}
        aria-label="Última página"
      >
        »
      </button>
    </nav>
  )
}

export default Paginacion
