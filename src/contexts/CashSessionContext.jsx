import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { cashSessionService } from '../services/cashSessionService'
import { useAuth } from './AuthContext'

const CashSessionContext = createContext()

export function CashSessionProvider({ children }) {
  const { user } = useAuth()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  // Al entrar (o al recargar la página) se busca si el usuario ya dejó
  // una caja abierta, para no volver a pedir la base a media jornada.
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (!user) {
        setSession(null)
        setLoading(false)
        return
      }
      setLoading(true)
      const abierta = await cashSessionService.getOpenSession(user.id)
      if (!cancelled) {
        setSession(abierta)
        setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [user])

  const openSession = useCallback(async (baseInicial) => {
    if (!user) return null
    const nueva = await cashSessionService.openSession(user.id, baseInicial)
    if (nueva) setSession(nueva)
    return nueva
  }, [user])

  const closeSession = useCallback(async (arqueo) => {
    if (!session) return null
    const cerrada = await cashSessionService.closeSession(session.id, arqueo)
    if (cerrada) setSession(null)
    return cerrada
  }, [session])

  return (
    <CashSessionContext.Provider
      value={{
        session,
        loading,
        necesitaApertura: !!user && !loading && !session,
        openSession,
        closeSession
      }}
    >
      {children}
    </CashSessionContext.Provider>
  )
}

export function useCashSession() {
  const context = useContext(CashSessionContext)
  if (!context) {
    throw new Error('useCashSession debe ser usado dentro de CashSessionProvider')
  }
  return context
}
