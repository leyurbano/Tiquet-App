import { useState, useId } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { mensajeErrorLogin } from '../utils/errorLogin';
import './InicioPage.css';
import { Eye, EyeOff, Loader2, LogIn } from 'lucide-react';

function InicioPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verPassword, setVerPassword] = useState(false);
  const [mostrarAyuda, setMostrarAyuda] = useState(false);
  const { login } = useAuth();
  // Conecta cada etiqueta con su campo
  const idCampo = useId();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // trim: un espacio al final, pegado o del autocorrector del celular,
      // daba "correo o contraseña incorrectos" sin razón visible
      const result = await login(email.trim(), password);

      if (!result.success) {
        if (result.error) console.warn('Inicio de sesión rechazado:', result.error);
        setError(mensajeErrorLogin(result.error));
      }
    } catch (err) {
      setError(mensajeErrorLogin(err?.message));
    } finally {
      setLoading(false);
    }
  };

  // 🔧 Antes se veía primero el logo grande con un botón "Ingresar", y solo
  // al tocarlo aparecía el formulario: un toque de más en cada turno, y un
  // botón "Cancelar" que solo devolvía a la portada. Como en los demás
  // sistemas de punto de venta, el formulario ya está a la vista.
  return (
    <div className="welcome-container">
      <div className="welcome-card">

        <img
          src="/logoApp2.png"
          alt="Tiquet-App"
          className="welcome-logo"
        />

        {/* Título para el lector de pantalla: el logo ya lo dice a la vista */}
        <h1 className="login-titulo-oculto">Iniciar sesión en Tiquet-App</h1>

        <div className="welcome-form">
          <form onSubmit={handleSubmit}>

            {/* autoComplete: el navegador y los gestores de contraseñas
                ofrecen guardar y llenar los datos. Antes había que escribir
                todo en cada turno */}
            <div className="login-campo">
              <label className="login-label" htmlFor={`${idCampo}-email`}>Correo electrónico</label>
              <input
                id={`${idCampo}-email`}
                type="email"
                className="login-input"
                placeholder="tu@email.com"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="login-campo">
              <label className="login-label" htmlFor={`${idCampo}-password`}>Contraseña</label>
              <div className="login-password">
                <input
                  id={`${idCampo}-password`}
                  type={verPassword ? 'text' : 'password'}
                  className="login-input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-ver-password"
                  onClick={() => setVerPassword((v) => !v)}
                  aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={verPassword}
                >
                  {verPassword
                    ? <EyeOff size={18} aria-hidden="true" />
                    : <Eye size={18} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {/* role="alert": el lector de pantalla lo anuncia al aparecer */}
            {error && <div className="login-error" role="alert">{error}</div>}

            <button
              type="submit"
              className="welcome-boton"
              disabled={loading}
            >
              {loading
                ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
                : <LogIn size={18} aria-hidden="true" />}
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>

            {/* No hay correo de recuperación: sin un SMTP propio, Supabase
                solo envía correos a los miembros del equipo del proyecto */}
            <button
              type="button"
              className="login-olvide"
              onClick={() => setMostrarAyuda((v) => !v)}
              aria-expanded={mostrarAyuda}
              aria-controls={`${idCampo}-ayuda`}
            >
              ¿Olvidaste tu contraseña?
            </button>
            {mostrarAyuda && (
              <p className="login-ayuda" id={`${idCampo}-ayuda`}>
                Pídele al administrador de tu negocio que te la restablezca.
                Te dará una contraseña temporal y, al entrar, podrás crear una nueva.
              </p>
            )}

          </form>
        </div>

      </div>
    </div>
  );
}

export default InicioPage;
