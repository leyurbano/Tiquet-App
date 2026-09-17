import React from 'react'
import { toast } from '../utils/toast'
import './CredencialTemporal.css'

/**
 * Muestra la contraseña temporal de un usuario recién creado o restablecido.
 *
 * Por qué es una tarjeta con botón de "Ya la entregué" y no un aviso que se
 * desvanece: esta contraseña **no queda guardada en ninguna parte**. Si se
 * pierde de pantalla, la única salida es restablecerla otra vez. Un toast o
 * un mensaje que cualquier otra acción reemplace es justo lo que no sirve
 * aquí, así que se queda hasta que la persona confirme que la entregó.
 *
 * Y va en monospace con botón de copiar porque desde la migración a la
 * política de Auth las contraseñas llevan símbolos (`gK+-Qw8n+5*q`):
 * retipear eso desde una frase corrida es un error esperando ocurrir.
 *
 * credencial: { nombre, email, password, motivo: 'creado' | 'restablecido' }
 */
function CredencialTemporal({ credencial, onCerrar }) {
  if (!credencial) return null

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(credencial.password)
      toast.exito('Contraseña copiada')
    } catch {
      // El portapapeles falla sin HTTPS o sin permiso: no se pierde nada,
      // la contraseña sigue visible en pantalla
      toast.aviso('No se pudo copiar automáticamente; anótala a mano')
    }
  }

  return (
    <div className="cred-caja" role="status">
      <p className="cred-titulo">
        {credencial.motivo === 'creado' ? 'Usuario creado' : 'Contraseña restablecida'}
        {credencial.nombre ? `: ${credencial.nombre}` : ''}
      </p>

      {credencial.email && (
        <p className="cred-dato">Correo: <strong>{credencial.email}</strong></p>
      )}

      <p className="cred-dato">
        Contraseña temporal: <code className="cred-password">{credencial.password}</code>
      </p>

      <p className="cred-nota">
        Entrégasela a la persona. Al entrar por primera vez, la app le pedirá
        crear una contraseña propia. Esta contraseña no se vuelve a mostrar.
      </p>

      <div className="cred-acciones">
        <button type="button" className="cred-btn" onClick={copiar}>
          Copiar contraseña
        </button>
        <button type="button" className="cred-btn cred-btn-sec" onClick={onCerrar}>
          Ya la entregué
        </button>
      </div>
    </div>
  )
}

export default CredencialTemporal
