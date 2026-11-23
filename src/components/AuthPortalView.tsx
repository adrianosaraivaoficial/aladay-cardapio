import React, { useId, useState } from 'react';
import {
  ShieldCheck,
  KeyRound,
  Smartphone,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';
import { AuthSession } from '../types';
import { StatusNotice } from './StatusNotice';

interface AuthPortalViewProps {
  currentSession: AuthSession | null;
  onSessionAuthenticated: (session: AuthSession) => void;
  onNavigateToAdmin: () => void;
  onLogout?: () => void;
}

export const AuthPortalView: React.FC<AuthPortalViewProps> = ({
  currentSession,
  onSessionAuthenticated,
  onNavigateToAdmin,
  onLogout,
}) => {
  const fieldId = useId();
  const [authTab, setAuthTab] = useState<'password' | 'whatsapp_otp'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [otpCodeInput, setOtpCodeInput] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const resp = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          email,
          password,
        }),
      });
      clearTimeout(timeoutId);
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setFeedback({ type: 'error', message: data.error || 'Credenciais inválidas. Verifique seu e-mail e senha.' });
      } else {
        const newSession: AuthSession = {
          token: data.token,
          user: data.user,
          claims: data.claims,
          authMethod: 'password',
          authenticatedAt: data.authenticatedAt,
        };
        setFeedback({
          type: 'success',
          message: `Bem-vindo, ${data.user.name}! Redirecionando para o painel...`,
        });
        onSessionAuthenticated(newSession);
        onNavigateToAdmin();
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      setFeedback({
        type: 'error',
        message:
          err?.name === 'AbortError'
            ? 'Tempo limite excedido ao conectar ao servidor. Tente novamente.'
            : err.message || 'Erro de conexão com o servidor.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestWhatsappOtp = async () => {
    if (!whatsappPhone.trim() || !email.trim()) {
      setFeedback({ type: 'error', message: 'Informe seu e-mail cadastrado e número de WhatsApp.' });
      return;
    }
    setLoading(true);
    setFeedback(null);

    try {
      const resp = await fetch('/api/v1/auth/whatsapp-otp/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone: whatsappPhone,
        }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setFeedback({ type: 'error', message: data.error || 'Não foi possível enviar o código no WhatsApp.' });
      } else {
        setOtpRequested(true);
        setFeedback({
          type: 'success',
          message: data.message || `Código de 6 dígitos enviado para o seu WhatsApp.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao solicitar código via WhatsApp.' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyWhatsappOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFeedback(null);

    try {
      const resp = await fetch('/api/v1/auth/whatsapp-otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          code: otpCodeInput,
        }),
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        setFeedback({ type: 'error', message: data.error || 'Código inválido ou expirado.' });
      } else {
        const newSession: AuthSession = {
          token: data.token,
          user: data.user,
          claims: data.claims,
          authMethod: 'whatsapp_otp',
          authenticatedAt: data.authenticatedAt,
        };
        setOtpRequested(false);
        setFeedback({
          type: 'success',
          message: `Autenticado com sucesso! Bem-vindo, ${data.user.name}.`,
        });
        onSessionAuthenticated(newSession);
        onNavigateToAdmin();
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Erro ao validar código.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="aladay-keyboard mx-auto max-w-lg space-y-6 py-6 sm:py-8">
      <div className="aladay-panel space-y-6 sm:p-8">
        <div className="space-y-1.5 text-center">
          <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-3 shadow-sm shadow-blue-600/25">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold text-slate-950">Acesso ao Painel do Restaurante</h1>
          <p className="text-xs text-slate-500">
            Entre com suas credenciais ou receba um código de acesso diretamente no seu WhatsApp.
          </p>
        </div>

        {/* Method Tabs */}
        <div className="bg-slate-100 p-1 rounded-xl flex gap-1">
          <button
            type="button"
            aria-pressed={authTab === 'password'}
            onClick={() => {
              setAuthTab('password');
              setFeedback(null);
            }}
            className={`aladay-action flex-1 px-2 text-xs ${
              authTab === 'password'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>E-mail e Senha</span>
          </button>
          <button
            type="button"
            aria-pressed={authTab === 'whatsapp_otp'}
            onClick={() => {
              setAuthTab('whatsapp_otp');
              setFeedback(null);
            }}
            className={`aladay-action flex-1 px-2 text-xs ${
              authTab === 'whatsapp_otp'
                ? 'bg-white text-blue-600 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
            <span>Código via WhatsApp</span>
          </button>
        </div>

        {feedback && (
          <StatusNotice tone={feedback.type}>
            {feedback.type === 'success' ? <CheckCircle2 size={17} aria-hidden="true" /> : <AlertCircle size={17} aria-hidden="true" />}
            {feedback.message}
          </StatusNotice>
        )}

        {authTab === 'password' ? (
          <form onSubmit={handlePasswordLogin} className="space-y-4">
            <div>
              <label htmlFor={fieldId + '-login-email'} className="block text-xs font-semibold text-slate-700 mb-1.5">
                E-mail de Acesso
              </label>
              <input
                id={fieldId + '-login-email'} name="username" autoComplete="username"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="aladay-field"
                placeholder="seuemail@restaurante.com.br"
                required
              />
            </div>

            <div>
              <label htmlFor={fieldId + '-password'} className="block text-xs font-semibold text-slate-700 mb-1.5">
                Senha
              </label>
              <input
                id={fieldId + '-password'} name="password" autoComplete="current-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="aladay-field"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="aladay-action aladay-action-primary w-full"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{loading ? 'Entrando...' : 'Entrar no Painel'}</span>
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor={fieldId + '-otp-email'} className="block text-xs font-semibold text-slate-700 mb-1.5">
                Seu E-mail Cadastrado
              </label>
              <input
                id={fieldId + '-otp-email'} name="email" autoComplete="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="aladay-field"
                placeholder="seuemail@restaurante.com.br"
                required
              />
            </div>

            <div>
              <label htmlFor={fieldId + '-phone'} className="block text-xs font-semibold text-slate-700 mb-1.5">
                Seu WhatsApp (Com DDD)
              </label>
              <input
                id={fieldId + '-phone'} name="tel" autoComplete="tel"
                type="tel"
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                className="aladay-field"
                placeholder="5511999999999"
                required
              />
            </div>

            {!otpRequested ? (
              <button
                type="button"
                onClick={handleRequestWhatsappOtp}
                disabled={loading}
                className="aladay-action aladay-action-primary w-full"
              >
                <Smartphone className="w-4 h-4" />
                <span>{loading ? 'Enviando código...' : 'Receber Código de 6 Dígitos no WhatsApp'}</span>
              </button>
            ) : (
              <form onSubmit={handleVerifyWhatsappOtp} className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <label htmlFor={fieldId + '-otp-code'} className="block text-xs font-semibold text-slate-800 mb-1.5">
                    Digite o código de 6 dígitos enviado para seu WhatsApp
                  </label>
                  <input
                    id={fieldId + '-otp-code'} name="code" autoComplete="one-time-code" inputMode="numeric"
                    type="text"
                    maxLength={6}
                    value={otpCodeInput}
                    onChange={(e) => setOtpCodeInput(e.target.value)}
                    className="aladay-field text-center font-mono font-bold tracking-widest"
                    placeholder="000000"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="aladay-action aladay-action-primary w-full"
                >
                  Confirmar Código e Entrar
                </button>
              </form>
            )}
          </div>
        )}

        {/* Current active session shortcut */}
        {currentSession?.user && (
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <div className="text-slate-500">
              Conectado como <strong className="text-slate-800">{currentSession.user.name}</strong> ({currentSession.user.role})
            </div>
            <div className="flex items-center gap-3">
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="text-rose-600 hover:text-rose-700 font-medium cursor-pointer"
                >
                  Sair
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToAdmin}
                className="text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Ir para o Painel</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
