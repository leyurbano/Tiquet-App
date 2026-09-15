import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './InicioPage.css';
import { Eye, EyeOff } from 'lucide-react';

function InicioPage() {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verPassword, setVerPassword] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);

      if (!result.success) {
        if (result.error === 'Invalid login credentials') {
          setError('Correo o contraseña incorrectos');
        } else {
          setError(result.error || 'Error al iniciar sesión');
        }
      }

    } catch {
      setError('Error inesperado, intenta de nuevo');
    } finally {
      setLoading(false);
    }
  };

  return (
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
                <div className="input-password-wrapper">
                  <input
                    type={verPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="boton-ver-password"
                    onClick={() => setVerPassword(!verPassword)}
                  >
                    {verPassword ?   <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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

              {/* No hay correo de recuperación: sin un SMTP propio, Supabase
                  solo envía correos a los miembros del equipo del proyecto */}
              <button
                type="button"
                className="boton-olvide"
                onClick={() => setMostrarAyuda((v) => !v)}
              >
                ¿Olvidaste tu contraseña?
              </button>
              {mostrarAyuda && (
                <p className="ayuda-olvide">
                  Pídele al administrador de tu negocio que te la restablezca.
                  Te dará una contraseña temporal y, al entrar, podrás crear una nueva.
                </p>
              )}

            </form>
          </div>
        )}

      </div>
    </div>
  );
}

export default InicioPage;