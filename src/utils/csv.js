/**
 * Exportación a CSV para abrir con doble clic en Excel.
 *
 * Se eligió CSV y no .xlsx: no agrega dependencias, y la librería más usada
 * para .xlsx (SheetJS) tiene vulnerabilidades conocidas en su versión de npm.
 *
 * Ajustado a Excel en español (Colombia):
 *  - Separador punto y coma: con coma decimal, Excel usa ";" entre columnas.
 *  - Coma decimal en los números.
 *  - BOM UTF-8 al inicio: sin él, Excel abre el archivo con otra codificación
 *    y daña tildes y eñes.
 */

const SEPARADOR = ';'

// Inyección de fórmulas: un texto escrito por un usuario (por ejemplo, el
// nombre de un cliente) que empiece con = + - @ sería ejecutado por Excel
// como fórmula en el computador de quien abra el archivo. Se neutraliza
// anteponiendo un apóstrofo, que Excel no muestra.
const neutralizarFormula = (texto) =>
  /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto

const celda = (valor) => {
  if (valor === null || valor === undefined) return ''

  // Los números no se neutralizan (un margen negativo empieza con "-" y debe
  // seguir siendo número para que Excel pueda sumarlo)
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(valor).replace('.', ',') : ''
  }

  let texto = neutralizarFormula(String(valor))
  if (/[";\n\r]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`
  return texto
}

/**
 * @param columnas [{ clave, titulo }] en el orden en que van en el archivo
 * @param filas    objetos con esas claves
 */
export const construirCSV = (columnas, filas) => {
  const lineas = [columnas.map((c) => celda(c.titulo)).join(SEPARADOR)]
  for (const fila of filas) {
    lineas.push(columnas.map((c) => celda(fila[c.clave])).join(SEPARADOR))
  }
  return '﻿' + lineas.join('\r\n')
}

export const descargarCSV = (nombreArchivo, columnas, filas) => {
  const blob = new Blob([construirCSV(columnas, filas)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  // Se libera después de que el navegador tomó el archivo
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
