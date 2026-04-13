import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { login, register } from '../lib/api';

interface AuthModalProps {
  onSuccess: () => void;
  onClose: () => void;
}

export default function AuthModal({ onSuccess, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [handleKeyDown]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      setLoading(false);
      onSuccess();
    } catch (err: any) {
      setLoading(false);
      setError(err.message || 'Credenciales incorrectas');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);

    try {
      await register(email, password, fullName);
      setLoading(false);
      setSuccess('Cuenta creada exitosamente. Inicia sesión.');
      setMode('login');
    } catch (err: any) {
      setLoading(false);
      setError(err.message);
    }
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setFullName('');
    setError('');
    setSuccess('');
  };

  return createPortal(
    <div
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="upload-modal" style={{ maxWidth: '420px' }}>
        <div className="upload-header">
          <h2 className="upload-title">
            {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta'}
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => { setMode('login'); resetForm(); }}
          >
            Ingresar
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => { setMode('register'); resetForm(); }}
          >
            Registrarse
          </button>
        </div>

        <form
          onSubmit={mode === 'login' ? handleLogin : handleRegister}
          className="upload-body"
        >
          {mode === 'register' && (
            <div className="upload-field">
              <label>Nombre completo *</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Ej: Juan Pérez"
                required
              />
            </div>
          )}

          <div className="upload-field">
            <label>Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@universidad.edu"
              required
            />
          </div>

          <div className="upload-field">
            <label>Contraseña *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="auth-message auth-error">{error}</p>
          )}

          {success && (
            <p className="auth-message auth-success">{success}</p>
          )}

          <div className="upload-actions">
            <button type="button" className="upload-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="upload-submit" disabled={loading}>
              {loading
                ? (mode === 'login' ? 'Ingresando...' : 'Registrando...')
                : (mode === 'login' ? 'Ingresar' : 'Crear cuenta')
              }
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
