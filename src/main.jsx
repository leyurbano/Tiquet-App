import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import Toaster from './components/Toaster'
import EstadoApp from './components/EstadoApp'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { CashSessionProvider } from './contexts/CashSessionContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <CashSessionProvider>
        <BrowserRouter>
          <App />
          {/* Fuera de App: App tiene salidas tempranas donde no se vería */}
          <Toaster />
          {/* Sin conexión / versión nueva de la app instalable */}
          <EstadoApp />
        </BrowserRouter>
      </CashSessionProvider>
    </AuthProvider>
  </React.StrictMode>,
)
