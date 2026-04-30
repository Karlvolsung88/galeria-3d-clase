import { Routes, Route } from 'react-router-dom';
import Layout from './layouts/Layout';
import GaleriaPage from './pages/GaleriaPage';
import EstudiantesPage from './components/EstudiantesPage';
import ProfilePage from './components/ProfilePage';
import AdminPanel from './components/AdminPanel';
import TeacherPanel from './components/TeacherPanel';
import ResetPasswordPage from './components/ResetPasswordPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<GaleriaPage />} />
        <Route path="/estudiantes" element={<EstudiantesPage />} />
        <Route path="/perfil" element={<ProfilePage />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/teacher" element={<TeacherPanel />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>
    </Routes>
  );
}
