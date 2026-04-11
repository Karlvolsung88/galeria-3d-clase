import { Routes, Route } from 'react-router-dom';
import Layout from './layouts/Layout';
import GaleriaPage from './pages/GaleriaPage';
import EstudiantesPage from './components/EstudiantesPage';
import ProfilePage from './components/ProfilePage';
import SceneCanvas from './components/SceneCanvas';

export default function App() {
  return (
    <>
      <SceneCanvas />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<GaleriaPage />} />
          <Route path="/estudiantes" element={<EstudiantesPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Routes>
    </>
  );
}
