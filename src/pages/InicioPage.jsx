import { useNavigate } from 'react-router-dom';

import './InicioPage.css';

function InicioPage() {
  const navigate = useNavigate();

  return (
    <div className="welcome-container">
         
      <div className="welcome-card">
       <img src="/logoApp2.png" alt="Tiquet-App" className="welcome-logo" />
           <button className="welcome-boton" onClick={() => navigate('/login')}>
          Ingresar
        </button>
      </div>
     
    </div>
  );
}

export default InicioPage;