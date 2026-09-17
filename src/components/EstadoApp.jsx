import React, { useState, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import './EstadoApp.css'

const UNA_HORA = 60 * 60 * 1000

/**
 * Avisos de la app instalable (PWA):
 *  - Sin conexión: las ventas, el stock y la caja viven en el servidor, así
 *    que sin internet no se puede operar. Mejor decirlo que mostrar errores.
 *  - Versión nueva: se pregunta antes de actualizar, porque recargar en
 *    medio de una venta haría perder lo que el vendedor estaba cargando.
 */
function EstadoApp() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)

  useEffect(() => {
    const conectado = () => setEnLinea(true)
    const desconectado = () => setEnLinea(false)
    window.addEventListener('online', conectado)
    window.addEventListener('offline', desconectado)
    return () => {
      window.removeEventListener('online', conectado)
      window.removeEventListener('offline', desconectado)
    }
  }, [])

  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker
  } = useRegisterSW({
    // Una app que se deja abierta todo el día también debe enterarse de las
    // versiones nuevas, no solo al abrirla
    onRegisteredSW(_url, registro) {
      if (registro) setInterval(() => registro.update(), UNA_HORA)
    }
  })

  return (
    <>
      {!enLinea && (
        <div className="estado-app estado-offline" role="status">
          Sin conexión a internet. No se pueden registrar ventas hasta que vuelva la conexión.
        </div>
      )}

      {hayVersionNueva && (
        <div className="estado-app estado-version" role="status">
          <span>Hay una versión nueva de Tiquet-App.</span>
          <div className="estado-botones">
            <button type="button" className="estado-btn" onClick={() => updateServiceWorker(true)}>
              Actualizar
            </button>
            <button type="button" className="estado-btn-sec" onClick={() => setHayVersionNueva(false)}>
              Después
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default EstadoApp
