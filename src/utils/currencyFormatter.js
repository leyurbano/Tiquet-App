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

// Alternativa sin símbolo si lo prefieres
export const formatCOPNoSymbol = (value) => {
  const num = parseFloat(value) || 0
  return new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(num)
}
