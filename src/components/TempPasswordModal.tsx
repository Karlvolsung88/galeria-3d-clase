import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TempPasswordModalProps {
  /** Nombre visible del usuario destinatario de la password, para contexto. */
  userLabel: string;
  /** La password temporal generada por el backend. Se muestra una sola vez. */
  tempPassword: string;
  /** Título del modal — "Usuario creado" | "Contraseña reseteada". */
  title: string;
  /** Callback al cerrar — el admin confirma que ya copió la password. */
  onClose: () => void;
}

/**
 * Modal "shown once" — muestra una password temporal generada por el admin
 * con aviso prominente de que no se volverá a ver. Copia al portapapeles +
 * confirmación explícita para cerrar (evita cierres accidentales).
 *
 * Parte del Plan C: admin copia esta password y la envía por Teams al usuario.
 * El usuario entra con ella, el frontend detecta must_change_password=true y
 * lo fuerza al flujo de cambio de contraseña.
 */
export default function TempPasswordModal({ userLabel, tempPassword, title, onClose }: TempPasswordModalProps) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Bloqueo de scroll mientras el modal está abierto. NO se cierra con ESC ni
  // click-outside a propósito — el admin debe confirmar con el checkbox que
  // ya copió la password.
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback — seleccionar el texto para copia manual
      window.prompt('Copia esta contraseña:', tempPassword);
    }
  }, [tempPassword]);

  return createPortal(
    <div className="modal-overlay active">
      <div className="upload-modal" style={{ maxWidth: '520px' }}>
        <div className="upload-header">
          <h2 className="upload-title">{title}</h2>
        </div>

        <div className="upload-body">
          <p style={{ color: '#c8cfdc', fontSize: 14, margin: '0 0 14px' }}>
            Contraseña temporal para <strong style={{ color: '#fff' }}>{userLabel}</strong>.
            Cópiala ahora y envíasela por Teams — al cerrar este mensaje no se volverá a mostrar.
          </p>

          {/* Bloque destacado con la password */}
          <div
            style={{
              background: 'rgba(34, 197, 94, 0.08)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: 4,
              padding: '18px 16px',
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            <code
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 22,
                fontWeight: 600,
                color: '#22c55e',
                letterSpacing: 2,
                userSelect: 'all',
              }}
            >
              {tempPassword}
            </code>
          </div>

          <button
            type="button"
            className="upload-submit"
            onClick={handleCopy}
            style={{
              width: '100%',
              marginBottom: 14,
              background: copied ? 'rgba(34, 197, 94, 0.2)' : undefined,
            }}
          >
            {copied ? '✓ Copiado al portapapeles' : '📋 Copiar contraseña'}
          </button>

          <div
            style={{
              background: 'rgba(255, 193, 7, 0.06)',
              border: '1px solid rgba(255, 193, 7, 0.25)',
              borderRadius: 2,
              padding: '10px 12px',
              marginBottom: 14,
              fontSize: 12,
              color: '#e2b75b',
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.5,
            }}
          >
            ⚠️ Esta contraseña <strong>solo se muestra una vez</strong>.<br />
            El usuario deberá cambiarla al iniciar sesión por primera vez.
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: '#c8cfdc',
              cursor: 'pointer',
              marginBottom: 14,
            }}
          >
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            Ya copié la contraseña y la guardé en lugar seguro
          </label>

          <div className="upload-actions">
            <button
              type="button"
              className="upload-submit"
              onClick={onClose}
              disabled={!confirmed}
              style={{ width: '100%' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
