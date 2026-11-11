// Formato para Pesos Colombianos
export const formatCOP = (value) => {
  const num = parseFloat(value) || 0
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num)
}

/**
 * Cantidades (unidades de stock, totales) con separador de miles:
 * 12345 → "12.345", 1234567 → "1.234.567". Hasta 2 decimales, para los
 * productos que se venden por peso.
 *
 * useGrouping 'always': en español, Intl puede dejar los números de 4
 * cifras sin punto ("1234") por la regla de agrupación mínima de algunos
 * navegadores; así siempre sale "1.234".
 */
export const formatNumero = (value) => {
  const num = parseFloat(value) || 0
  return new Intl.NumberFormat('es-CO', {
    maximumFractionDigits: 2,
    useGrouping: 'always'
  }).format(num)
}

// Alternativa sin símbolo si lo prefieres
export const formatCOPNoSymbol = (value) => {
  const num = parseFloat(value) || 0
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num)
}
