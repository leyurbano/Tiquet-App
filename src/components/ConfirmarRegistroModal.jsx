import React from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { useDialogo } from '../hooks/useDialogo'
import './CajaModal.css'

/**
 * Resumen antes de registrar algo que no se puede editar después: una
 * entrada de mercancía, un ajuste o una importación.
 *
 * 🔧 Antes se registraban con un solo clic. Un "1000" donde iba "100" sumaba
 * 900 unidades de más, y como entradas y ajustes no se editan, solo se
 * arreglaba con otro ajuste a mano. Ver los totales antes de confirmar es
 * lo que hace saltar ese error a la vista.
 *
 * lineas: [{ etiqueta, valor, tono: 'falta' | 'sobra' | undefined }]
 */
function ConfirmarRegistroModal({
  titulo, icono: Icono, lineas, aviso, textoConfirmar,
  procesando = false, onConfirmar, onCancelar
}) {
  const refDialogo = useDialogo({ onCerrar: procesando ? null : onCancelar })

  return (
    <div className="caja-overlay" onClick={procesando ? undefined : onCancelar}>
      <div className="caja-box" onClick={(e) => e.stopPropagation()} ref={refDialogo} role="dialog" aria-modal="true" tabIndex={-1} aria-label={titulo}>
        <div className="caja-header">
          <h2 className="caja-title caja-con-icono">
            {Icono && <Icono size={22} aria-hidden="true" />} {titulo}
          </h2>
          <button
            type="button"
            className="caja-cerrar"
            onClick={onCancelar}
            disabled={procesando}
            aria-label="Volver sin registrar"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="confirmar-lineas">
          {lineas.map((l) => (
            <div key={l.etiqueta} className="caja-row">
              <span>{l.etiqueta}</span>
              <span className={`caja-row-value ${l.tono ? `confirmar-${l.tono}` : ''}`}>{l.valor}</span>
            </div>
          ))}
        </div>

        {aviso && <p className="caja-hint confirmar-aviso">{aviso}</p>}

        <div className="caja-buttons">
          <div className="caja-acciones-fila">
            <button type="button" className="caja-btn-primary" onClick={onConfirmar} disabled={procesando}>
              {procesando
                ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                : <Check size={16} aria-hidden="true" />}
              {procesando ? 'Registrando...' : textoConfirmar}
            </button>
            <button type="button" className="caja-btn-secondary" onClick={onCancelar} disabled={procesando}>
              Revisar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ConfirmarRegistroModal
