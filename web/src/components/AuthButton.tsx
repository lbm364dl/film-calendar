'use client';

import { useState, useRef, useEffect } from 'react';
import { getBrowserSupabase } from '@/lib/supabase-browser';
import type { LangKey } from '@/lib/translations';

const labels = {
  es: {
    login: 'Iniciar sesión',
    signup: 'Crear cuenta',
    logout: 'Cerrar sesión',
    email: 'Email',
    password: 'Contraseña',
    loginBtn: 'Iniciar sesión',
    signupBtn: 'Crear cuenta',
    switchToSignup: '¿No tienes cuenta? Créala aquí',
    switchToLogin: '¿Ya tienes cuenta? Inicia sesión',
    error: 'Error',
    checkEmail: 'Revisa tu email para confirmar tu cuenta',
    loggingIn: 'Entrando...',
    signingUp: 'Creando cuenta...',
    continueGoogle: 'Continuar con Google *',
    domainNote: '* Google mostrará',
    domainUrl: 'continuar a dkhesnmqbdxofhbtuzgr.supabase.co',
    domainExplain: 'Es nuestro servidor de autenticación gratuito, así mantenemos los costes al mínimo.',
    orWithEmail: 'o con email',
  },
  en: {
    login: 'Sign in',
    signup: 'Create account',
    logout: 'Sign out',
    email: 'Email',
    password: 'Password',
    loginBtn: 'Sign in',
    signupBtn: 'Create account',
    switchToSignup: "Don't have an account? Create one",
    switchToLogin: 'Already have an account? Sign in',
    error: 'Error',
    checkEmail: 'Check your email to confirm your account',
    loggingIn: 'Signing in...',
    signingUp: 'Creating account...',
    continueGoogle: 'Continue with Google *',
    domainNote: '* Google will show',
    domainUrl: 'continue to dkhesnmqbdxofhbtuzgr.supabase.co',
    domainExplain: 'That\'s our free auth server, it helps us keep maintenance costs as low as possible.',
    orWithEmail: 'or with email',
  },
};

interface AuthButtonProps {
  lang: LangKey;
  userId: string | null;
  userEmail: string | null;
  hasLetterboxd?: boolean;
  onOpenLetterboxd?: () => void;
}

export default function AuthButton({ lang, userId, userEmail, hasLetterboxd, onOpenLetterboxd }: AuthButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authClosing, setAuthClosing] = useState(false);

  // Listen for auth state changes (e.g., after OAuth redirect)
  // and reload to pick up the new session in SSR
  useEffect(() => {
    const supabase = getBrowserSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && !userId) {
        window.location.reload();
      }
    });
    return () => subscription.unsubscribe();
  }, [userId]);
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

  const openAuth = () => { setShowAuthModal(true); setAuthClosing(false); setError(''); setMessage(''); };
  const closeAuth = () => { setAuthClosing(true); setTimeout(() => { setShowAuthModal(false); setAuthClosing(false); }, 150); };

  // Listen for 'open-auth' custom event from other components
  useEffect(() => {
    window.addEventListener('open-auth', openAuth);
    return () => window.removeEventListener('open-auth', openAuth);
  }, []);

  useEffect(() => {
    if (!showAuthModal) return;
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAuth(); };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, [showAuthModal]);

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

  // Logged in: show DC-style user pill (avatar + name + LBXD badge)
  if (userId) {
    const initial = (userEmail || '?')[0].toUpperCase();
    // Short name = email local-part capitalised; falls back to "Me".
    const emailLocal = userEmail ? userEmail.split('@')[0] : '';
    const shortName = emailLocal
      ? emailLocal.charAt(0).toUpperCase() + emailLocal.slice(1, 12)
      : (lang === 'es' ? 'Cuenta' : 'Account');
    return (
      <div className="auth-area" ref={dropdownRef}>
        <button
          className="user-pill"
          onClick={() => setShowDropdown(!showDropdown)}
          title={userEmail || ''}
          aria-expanded={showDropdown}
        >
          <span className="user-pill-avatar">{initial}</span>
          <span className="user-pill-name">{shortName}</span>
          {hasLetterboxd && (
            <span className="user-pill-lbxd" title="Letterboxd">LBXD</span>
          )}
          <svg width="9" height="9" viewBox="0 0 12 8" className="user-pill-chevron" aria-hidden>
            <path fill="currentColor" d="M1.41 0L6 4.58 10.59 0 12 1.41l-6 6-6-6z" />
          </svg>
        </button>
        {showDropdown && (
          <div className="auth-dropdown">
            <div className="auth-dropdown-email">{userEmail}</div>
            {onOpenLetterboxd && (
              <button
                className="auth-dropdown-btn auth-dropdown-btn-lb"
                onClick={() => { setShowDropdown(false); onOpenLetterboxd(); }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/letterboxd.svg" width={14} height={14} alt="" style={{ verticalAlign: '-2px', marginRight: 6 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                {hasLetterboxd
                  ? (lang === 'es' ? 'Importar Letterboxd' : 'Letterboxd import')
                  : (lang === 'es' ? 'Conectar Letterboxd' : 'Connect Letterboxd')}
              </button>
            )}
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
      <button className="auth-login-btn" onClick={openAuth}>
        {t.login}
      </button>

      {showAuthModal && (
        <div className={`auth-modal-overlay${authClosing ? ' closing' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) closeAuth(); }}>
          <div className="auth-modal">
            <button className="auth-modal-close" onClick={closeAuth}>&times;</button>
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

            <div className="auth-domain-note">
              <p>{t.domainNote}</p>
              <p className="auth-domain-url">{t.domainUrl}</p>
              <p>{t.domainExplain}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
