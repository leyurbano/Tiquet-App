import React from 'react'
import './home.css'
import { useNavigate } from 'react-router-dom'

function Home() {
  return (
    <div className="dashboard-container">
      <h1 className="dashboard-title">FRALUDETALLES</h1>

      <div className="stats-grid">
        <button className="stat-card stat-blue" onClick={() => console.log('Venta')}>
          <div className="stat-content">
            <p className="stat-label">Venta</p>
          </div>
        </button>

        <button className="stat-card stat-green" onClick={() => console.log('Compra')}>
          <div className="stat-content">
            <p className="stat-label">Compra</p>
          </div>
        </button>

        <button className="stat-card stat-orange" onClick={() => console.log('Reporte')}>
          <div className="stat-content">
            <p className="stat-label">Reporte</p>
          </div>
        </button>
      </div>
    </div>
  )
}

export default Home