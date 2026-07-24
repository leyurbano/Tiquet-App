import { useNavigate } from 'react-router-dom';

import './InicioPage.css';

function InicioPage() {
  const navigate = useNavigate();

  return (
    <div className="welcome-container">
         <img src="/Logo.png" alt="Fralu" className="welcome-logo" />
      <div className="welcome-card">
       
        <h1 className="welcome-titulo">Tiquet-App</h1>
        <p className="welcome-subtitulo">Sistema de punto de venta</p>
        <button className="welcome-boton" onClick={() => navigate('/login')}>
          Ingresar
        </button>
      </div>
    </div>
  );
}

export default InicioPage;