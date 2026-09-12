import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { AuthProvider } from './contexts/AuthContext'
import { CashSessionProvider } from './contexts/CashSessionContext'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <CashSessionProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </CashSessionProvider>
    </AuthProvider>
  </React.StrictMode>,
)
