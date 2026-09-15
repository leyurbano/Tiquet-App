import React from "react";
import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProductsPage from "./pages/ProductsPage";
import SalesPage from "./pages/SalesPage";
import ClientsPage from "./pages/ClientsPage";
import CierreCajaPage from "./pages/CierreCajaPage";
import ConfiguracionPage from "./pages/ConfiguracionPage";
import PlataformaPage from "./pages/PlataformaPage";
import { useAuth } from "./contexts/AuthContext";
import CuentaBloqueada from "./components/CuentaBloqueada";
import CambiarContrasenaModal from "./components/CambiarContrasenaModal";
import InicioPage from "./pages/InicioPage"; // 🔧 CAMBIO — solo un import, eliminé el duplicado

function App() {
  const { user, loading, estadoCuenta, esSuperAdmin, debeCambiarContrasena } = useAuth();

  // Usuario autenticado que no puede operar. La excepción es el super admin
  // de plataforma sin negocio propio, que solo administra la plataforma.
  const cuentaBloqueada =
    user && estadoCuenta && estadoCuenta !== "activo" &&
    !(estadoCuenta === "sin_negocio" && esSuperAdmin);

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <p>Cargando...</p>
      </div>
    );
  }

  if (cuentaBloqueada) return <CuentaBloqueada />;

  // Contraseña asignada por el administrador: se cambia antes de operar
  if (user && estadoCuenta === "activo" && debeCambiarContrasena) {
    return <CambiarContrasenaModal obligatorio />;
  }

  return (
    <>
      <Routes>
        {/* 🔧 CAMBIO — verifica si hay sesión antes de mostrar inicio */}
      <Route
        path="/"
        element={user ? <Navigate to="/sales" replace /> : <InicioPage />}
      />

      {/* Rutas protegidas */}
      <Route
        path="/sales"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main"><SalesPage /></div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/products"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main"><ProductsPage /></div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/clients"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main"><ClientsPage /></div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/cierre"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main"><CierreCajaPage /></div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/configuracion"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main"><ConfiguracionPage /></div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

      <Route
        path="/plataforma"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main"><PlataformaPage /></div>
            </div>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />

        {/* Ruta 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;