import React, { useState } from 'react'
import './App.css'
import Navbar from './components/Navbar'
import ProductsPage from './pages/ProductsPage'
import SalesPage from './pages/SalesPage'
import ClientsPage from './pages/ClientsPage'

function App() {
  const [currentPage, setCurrentPage] = useState('sales')

  const renderPage = () => {
    switch(currentPage) {
      case 'products':
        return <ProductsPage />
      case 'sales':
        return <SalesPage />
      case 'clients':
        return <ClientsPage />
      default:
        return <ProductsPage />
    }
  }

  return (
    <div className="app-container">
      <Navbar currentPage={currentPage} setCurrentPage={setCurrentPage} />
      <div className="app-main">
        {renderPage()}
      </div>
    </div>
  )
}

export default App
