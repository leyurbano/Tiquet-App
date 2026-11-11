import { useEffect, useState } from 'react'

// El mismo corte que usan los @media de las pantallas
const CONSULTA = '(max-width: 768px)'

/**
 * ¿La pantalla es de celular? Para lo que CSS no puede cambiar, como el
 * texto de un placeholder. Se actualiza si se gira el celular o se cambia
 * el tamaño de la ventana.
 */
export function useEsCelular() {
  const [esCelular, setEsCelular] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(CONSULTA).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(CONSULTA)
    const cambiar = (e) => setEsCelular(e.matches)
    mq.addEventListener('change', cambiar)
    return () => mq.removeEventListener('change', cambiar)
  }, [])

  return esCelular
}
