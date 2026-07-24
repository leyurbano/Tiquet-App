import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './InicioPage.css';

function InicioPage() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (!result.success) {
        // 🔧 si falló, muestra el mensaje de error
        setError(result.error || 'Error al iniciar sesión');
      }
      // si result.success === true, no hace nada —
      // onAuthStateChange detecta la sesión y App.jsx redirige a /sales automáticamente

    } catch {
      setError('Error inesperado, intentá de nuevo');
    } finally {
      setLoading(false);
    }
  };

  return (
    // 🔧 CAMBIO — la clase del contenedor cambia según el estado
<div className={`welcome-container ${mostrarForm ? 'form-activo' : ''}`}>
      <div className="welcome-card">

        <img
          src="/logoApp2.png"
          alt="Tiquet-App"
          className="welcome-logo"
        />

        {!mostrarForm && (
          <button
            className="welcome-boton"
            onClick={() => setMostrarForm(true)}
          >
            Ingresar
          </button>
        )}

        {mostrarForm && (
          <div className="welcome-form">
            <form onSubmit={handleSubmit}>

              <div className="form-group">
                <label className="form-label">Correo electrónico</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="tu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Contraseña</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && <div className="error-message">{error}</div>}

              <button
                type="submit"
                className="welcome-boton"
                disabled={loading}
              >
                {loading ? 'Cargando...' : 'Iniciar Sesión'}
              </button>

              <button
                type="button"
                className="boton-cancelar"
                onClick={() => {
                  setMostrarForm(false);
                  setError('');
                  setEmail('');
                  setPassword('');
                }}
              >
                Cancelar
              </button>

            </form>
          </div>
        )}

      </div>
    </div>
  );
}

export default InicioPage;