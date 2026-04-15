import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../lib/api';

type Phase = 'form' | 'submitting' | 'ok' | 'error';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [phase, setPhase] = useState<Phase>('form');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!token) {
      setPhase('error');
      setError('Enlace inválido: falta el token.');
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (newPassword !== confirm) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setPhase('submitting');
    try {
      await resetPassword(token, newPassword);
      setPhase('ok');
      setTimeout(() => navigate('/', { replace: true }), 2500);
    } catch (err: any) {
      setPhase('error');
      setError(err.message || 'No se pudo restablecer la contraseña');
    }
  }

  return (
    <main className="reset-main">
      <div className="reset-card">
        <h1 className="reset-title">Restablecer contraseña</h1>

        {phase === 'ok' && (
          <>
            <p className="reset-msg reset-msg--ok">
              ✓ Contraseña actualizada. Redirigiendo a la galería…
            </p>
          </>
        )}

        {phase === 'error' && (
          <>
            <p className="reset-msg reset-msg--error">{error}</p>
            <button
              className="reset-btn"
              onClick={() => navigate('/', { replace: true })}
            >
              Volver a la galería
            </button>
          </>
        )}

        {(phase === 'form' || phase === 'submitting') && (
          <form onSubmit={handleSubmit} className="reset-form">
            <p className="reset-hint">
              Elige una nueva contraseña (mínimo 6 caracteres). El enlace expira una hora después de haberlo solicitado.
            </p>

            <label className="reset-field">
              <span>Nueva contraseña</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                disabled={phase === 'submitting'}
                autoFocus
              />
            </label>

            <label className="reset-field">
              <span>Confirmar contraseña</span>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={6}
                disabled={phase === 'submitting'}
              />
            </label>

            {error && <p className="reset-msg reset-msg--error">{error}</p>}

            <button type="submit" className="reset-btn reset-btn--primary" disabled={phase === 'submitting'}>
              {phase === 'submitting' ? 'Guardando…' : 'Restablecer contraseña'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
