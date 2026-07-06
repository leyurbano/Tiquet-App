import React from "react";
import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProductsPage from "./pages/ProductsPage";
import SalesPage from "./pages/SalesPage";
import ClientsPage from "./pages/ClientsPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import Dashboard from "./pages/home";
import { useAuth } from "./contexts/AuthContext";

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <Routes>
      {/* Rutas públicas */}
      <Route
        path="/login"
        element={user ? <Navigate to="/sales" replace /> : <LoginPage />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/sales" replace /> : <RegisterPage />}
      />

      {/* Ruta raíz - va directo a /sales */}
      <Route
        path="/"
        element={
          user ? (
            <Navigate to="/sales" replace />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Dashboard (opcional, para después) */}
      <Route
        path="/dashboard"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main">
                <Dashboard />
              </div>
            </div>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Rutas protegidas */}
      <Route
        path="/sales"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main">
                <SalesPage />
              </div>
            </div>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/products"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main">
                <ProductsPage />
              </div>
            </div>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route
        path="/clients"
        element={
          user ? (
            <div className="app-container">
              <Navbar />
              <div className="app-main">
                <ClientsPage />
              </div>
            </div>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Ruta 404 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
