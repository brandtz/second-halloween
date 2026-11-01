import { useState, type FormEvent } from 'react';
import { EmailAuthProvider, linkWithCredential, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import type { Services } from './firebase';
import { errorMessage } from './firebase';
import Modal from './Modal';

export default function AuthDialog({ services, onClose, onSuccess }: {
  services: Services; onClose: () => void; onSuccess: () => void;
}) {
  const [mode, setMode] = useState<'signin' | 'register' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const { auth } = services;
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setMessage('If this email has an account, a password reset email will arrive shortly.');
      } else {
        if (mode === 'register') {
          if (auth.currentUser?.isAnonymous) await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email.trim(), password));
          else await createUserWithEmailAndPassword(auth, email.trim(), password);
        } else await signInWithEmailAndPassword(auth, email.trim(), password);
        onSuccess();
      }
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Modal title={mode === 'reset' ? 'Reset your password' : 'Host account'} onClose={onClose} busy={busy}>
    <p className="muted">Use your account to update your house from any device. There are no shared edit PINs.</p>
    <div className="segmented auth-tabs">
      <button disabled={busy} aria-pressed={mode === 'signin'} onClick={() => { setMode('signin'); setError(''); }}>Sign in</button>
      <button disabled={busy} aria-pressed={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>Create account</button>
    </div>
    <form onSubmit={submit}>
      <label>Email<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} /></label>
      {mode !== 'reset' && <label>Password<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
        required minLength={mode === 'register' ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} /></label>}
      {mode === 'register' && <p className="muted small">Use at least 12 characters. Your current guest walk stays with this new account.</p>}
      {mode === 'signin' && <p className="muted small">Signing in loads that account's walk. A guest walk is not merged into an existing account.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      {message && <p role="status" className="notice">{message}</p>}
      <div className="modal-footer">
        <button type="button" disabled={busy} onClick={() => { setMode('reset'); setError(''); }}>Forgot password?</button>
        <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button>
      </div>
    </form>
  </Modal>;
}
