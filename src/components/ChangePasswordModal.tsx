import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { changePassword, clearMustChangePassword } from '../lib/api';

interface ChangePasswordModalProps {
  /** Nombre del usuario (para saludo). */
  userLabel: string;
  /** Callback cuando el cambio se completó — el caller puede limpiar UI. */
  onSuccess: () => void;
}

/**
 * Modal OBLIGATORIO para el primer login tras creación/reset administrativo
 * (Plan C flow). El usuario debe cambiar la password temporal por una
 * propia antes de acceder al resto de la app.
 *
 * Este modal NO se puede cerrar con ESC, ni click-outside, ni botón X:
 * el usuario debe completar el cambio o hacer logout manualmente.
 * El backend valida la current_password (la temporal) antes de actualizar.
 */
export default function ChangePasswordModal({ userLabel, onSuccess }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('La nueva contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('La confirmación no coincide con la nueva contraseña.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('La nueva contraseña debe ser diferente a la temporal.');
      return;
    }

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      clearMustChangePassword();
      setLoading(false);
      onSuccess();
    } catch (err) {
      setLoading(false);
      const msg = (err as Error).message || 'No se pudo cambiar la contraseña.';
      setError(msg);
    }
  };

  return createPortal(
    <div className="modal-overlay active" style={{ zIndex: 10000 }}>
      <div className="upload-modal" style={{ maxWidth: '460px' }}>
        <div className="upload-header">
          <h2 className="upload-title">Crea tu contraseña</h2>
        </div>

        <form onSubmit={handleSubmit} className="upload-body">
          <p style={{ color: '#c8cfdc', fontSize: 14, margin: '0 0 14px', lineHeight: 1.5 }}>
            Hola <strong style={{ color: '#fff' }}>{userLabel}</strong>. Ingresaste con una
            contraseña temporal. Por seguridad debes crear una nueva contraseña para continuar.
          </p>

          <div className="upload-field">
            <label>Contraseña temporal *</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="La que te enviaron por Teams"
              required
              autoFocus
            />
          </div>

          <div className="upload-field">
            <label>Nueva contraseña *</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              minLength={6}
            />
          </div>

          <div className="upload-field">
            <label>Confirmar nueva contraseña *</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repite la nueva contraseña"
              required
              minLength={6}
            />
          </div>

          {error && <p className="auth-message auth-error">{error}</p>}

          <div className="upload-actions">
            <button
              type="submit"
              className="upload-submit"
              disabled={loading}
              style={{ width: '100%' }}
            >
              {loading ? 'Cambiando...' : 'Cambiar contraseña y continuar'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
