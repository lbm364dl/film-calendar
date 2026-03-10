'use client';

import { useState, useRef, useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import type { LangKey } from '@/lib/translations';

const labels = {
  es: {
    login: 'Iniciar sesión',
    signup: 'Registrarse',
    logout: 'Cerrar sesión',
    email: 'Email',
    password: 'Contraseña',
    loginBtn: 'Entrar',
    signupBtn: 'Crear cuenta',
    switchToSignup: '¿No tienes cuenta? Regístrate',
    switchToLogin: '¿Ya tienes cuenta? Inicia sesión',
    error: 'Error',
    checkEmail: 'Revisa tu email para confirmar tu cuenta',
    loggingIn: 'Entrando...',
    signingUp: 'Creando cuenta...',
    continueGoogle: 'Continuar con Google',
    orWithEmail: 'o con email',
  },
  en: {
    login: 'Log in',
    signup: 'Sign up',
    logout: 'Log out',
    email: 'Email',
    password: 'Password',
    loginBtn: 'Log in',
    signupBtn: 'Sign up',
    switchToSignup: "Don't have an account? Sign up",
    switchToLogin: 'Already have an account? Log in',
    error: 'Error',
    checkEmail: 'Check your email to confirm your account',
    loggingIn: 'Logging in...',
    signingUp: 'Signing up...',
    continueGoogle: 'Continue with Google',
    orWithEmail: 'or with email',
  },
};

interface AuthButtonProps {
  lang: LangKey;
  userId: string | null;
  userEmail: string | null;
}

export default function AuthButton({ lang, userId, userEmail }: AuthButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const t = labels[lang];

  const getCallbackRedirectUrl = () => {
    // Store return path in cookie so redirectTo stays clean (no query params)
    // This avoids Supabase redirect URL allow-list mismatch
    const next = `${window.location.pathname}${window.location.search}` || '/';
    document.cookie = `fc_auth_next=${encodeURIComponent(next)};path=/;max-age=600;SameSite=Lax`;
    return `${window.location.origin}/auth/callback`;
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    const supabase = getBrowserSupabase();
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });

    if (err) {
      setError(err.message);
      setSubmitting(false);
    } else {
      // Reload to let server component pick up the session
      window.location.reload();
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setSubmitting(true);

    const supabase = getBrowserSupabase();
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: getCallbackRedirectUrl(),
      },
    });

    setSubmitting(false);
    if (err) {
      setError(err.message);
    } else {
      setMessage(t.checkEmail);
    }
  };

  const handleLogout = async () => {
    const supabase = getBrowserSupabase();
    await supabase.auth.signOut();
    window.location.reload();
  };

  const handleGoogleLogin = async () => {
    setError('');
    setMessage('');
    setSubmitting(true);

    const supabase = getBrowserSupabase();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getCallbackRedirectUrl(),
      },
    });

    if (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  // Logged in: show avatar/email + dropdown
  if (userId) {
    const initial = (userEmail || '?')[0].toUpperCase();
    return (
      <div className="auth-area" ref={dropdownRef}>
        <button
          className="auth-avatar"
          onClick={() => setShowDropdown(!showDropdown)}
          title={userEmail || ''}
        >
          {initial}
        </button>
        {showDropdown && (
          <div className="auth-dropdown">
            <div className="auth-dropdown-email">{userEmail}</div>
            <button className="auth-dropdown-btn" onClick={handleLogout}>
              {t.logout}
            </button>
          </div>
        )}
      </div>
    );
  }

  // Not logged in: show login button + modal
  return (
    <>
      <button className="auth-login-btn" onClick={() => { setShowAuthModal(true); setError(''); setMessage(''); }}>
        {t.login}
      </button>

      {showAuthModal && (
        <div className="auth-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
          <div className="auth-modal">
            <button className="auth-modal-close" onClick={() => setShowAuthModal(false)}>&times;</button>
            <h2>{isSignup ? t.signup : t.login}</h2>

            <button type="button" className="auth-oauth-btn" onClick={handleGoogleLogin} disabled={submitting}>
              <span className="auth-oauth-google-g">G</span>
              <span>{t.continueGoogle}</span>
            </button>

            <div className="auth-oauth-divider">
              <span>{t.orWithEmail}</span>
            </div>

            <form onSubmit={isSignup ? handleSignup : handleLogin}>
              <input
                type="email"
                placeholder={t.email}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <input
                type="password"
                placeholder={t.password}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
              />

              {error && <div className="auth-error">{error}</div>}
              {message && <div className="auth-message">{message}</div>}

              <button type="submit" className="auth-submit-btn" disabled={submitting}>
                {submitting
                  ? (isSignup ? t.signingUp : t.loggingIn)
                  : (isSignup ? t.signupBtn : t.loginBtn)
                }
              </button>
            </form>

            <button
              className="auth-switch-btn"
              onClick={() => { setIsSignup(!isSignup); setError(''); setMessage(''); }}
            >
              {isSignup ? t.switchToLogin : t.switchToSignup}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
