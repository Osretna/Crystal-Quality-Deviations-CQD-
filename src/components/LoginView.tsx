import { useEffect, useState, type FormEvent } from 'react';
import { Lock, ShieldAlert, ArrowRight, Eye, EyeOff, Globe, Building2 } from 'lucide-react';
import type { Language, UserAccount } from '../types';
import { getText } from '../i18n';
import { InspectionImage } from './InspectionImage';

interface LoginViewProps {
  lang: Language;
  onToggleLang: () => void;
  onAuthenticated: (user: UserAccount) => void;
}

export function LoginView({ lang, onToggleLang, onAuthenticated }: LoginViewProps) {
  const t = getText(lang);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [azureSsoEnabled, setAzureSsoEnabled] = useState(false);
  const [companyLogoUrl, setCompanyLogoUrl] = useState('');
  const [logoError, setLogoError] = useState(false);

  // Mandatory first-time password rotation state
  const [pendingRotationUser, setPendingRotationUser] = useState<UserAccount | null>(null);
  const [verifiedCurrentPassword, setVerifiedCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((d: { azureSsoEnabled?: boolean; companyLogoUrl?: string }) => {
        setAzureSsoEnabled(Boolean(d.azureSsoEnabled));
        if (d.companyLogoUrl) {
          setCompanyLogoUrl(d.companyLogoUrl);
          setLogoError(false);
        }
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const ssoToken = params.get('ssoToken');
    const ssoError = params.get('ssoError');
    if (ssoError) {
      setError(ssoError);
      window.history.replaceState({}, '', window.location.pathname);
    } else if (ssoToken) {
      setLoading(true);
      fetch(`/api/auth/session/${encodeURIComponent(ssoToken)}`)
        .then((r) => r.json())
        .then((data: { user?: UserAccount; error?: string }) => {
          window.history.replaceState({}, '', window.location.pathname);
          if (data.user) {
            onAuthenticated(data.user);
          } else {
            setError(data.error || 'SSO session failed.');
          }
        })
        .catch(() => setError('Failed to verify Microsoft AD SSO session.'))
        .finally(() => setLoading(false));
    }
  }, [onAuthenticated]);

  async function handleLoginSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const rawText = await res.text();
      let data: { user?: UserAccount; error?: string } = {};
      try {
        data = JSON.parse(rawText) as { user?: UserAccount; error?: string };
      } catch {
        // Non-JSON error response
      }
      if (!res.ok || !data.user) {
        setError(
          data.error ||
            (lang === 'ar'
              ? `فشل تسجيل الدخول (رمز الحالة ${res.status}).`
              : `Authentication failed (HTTP ${res.status}).`)
        );
        return;
      }

      if (data.user.mustChangePassword) {
        setPendingRotationUser(data.user);
        setVerifiedCurrentPassword(password);
        setNewPassword('');
        setConfirmPassword('');
        return;
      }

      onAuthenticated(data.user);
    } catch {
      setError(
        lang === 'ar'
          ? 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى.'
          : 'Unable to reach authentication service. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  async function handlePasswordRotation(e: FormEvent) {
    e.preventDefault();
    if (!pendingRotationUser) return;
    setError(null);

    if (newPassword.length < 8) {
      setError(
        lang === 'ar'
          ? 'يجب أن تكون كلمة المرور الجديدة 8 أحرف على الأقل.'
          : 'New password must be at least 8 characters long.'
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(lang === 'ar' ? 'كلمتا المرور غير متطابقتين.' : 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: pendingRotationUser.username,
          currentPassword: verifiedCurrentPassword,
          newPassword,
        }),
      });
      const data = (await res.json()) as { user?: UserAccount; error?: string };
      if (!res.ok || !data.user) {
        setError(data.error || 'Failed to update password.');
        return;
      }
      onAuthenticated(data.user);
    } catch {
      setError('Network error while updating administrator password.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      className="min-h-screen grid grid-cols-1 lg:grid-cols-12 items-stretch bg-[#F4F7FB]"
    >
      {/* Left Architectural Showcase Column */}
      <div className="lg:col-span-6 relative overflow-hidden bg-[#091326] min-h-[240px] lg:min-h-screen flex flex-col justify-between">
        <InspectionImage
          src="/src/assets/images/asfour_facility_hero_1794943872039.jpg"
          alt="Crystal Asfour International Quality Control Center"
          className="absolute inset-0 w-full h-full object-cover"
          fallbackLabel="Crystal Asfour International"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#091326] via-[#091326]/75 to-[#091326]/40" />

        <div className="relative z-10 p-6 sm:p-8 lg:p-12 flex items-center justify-between gap-4">
          <div className="text-white">
            <p className="text-xs font-semibold tracking-wider text-[#E0AC46] uppercase">
              {t.company}
            </p>
            <p className="text-base sm:text-lg font-bold tracking-tight mt-0.5">{t.brand}</p>
          </div>
          <button
            type="button"
            onClick={onToggleLang}
            className="inline-flex items-center gap-2 min-h-[40px] px-3.5 py-1.5 text-xs font-medium text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Globe className="w-3.5 h-3.5" />
            <span>{lang === 'en' ? 'العربية' : 'English'}</span>
          </button>
        </div>

        <div className="relative z-10 p-6 sm:p-8 lg:p-12 max-w-xl hidden sm:block">
          <p className="text-xs font-medium text-[#E0AC46] mb-2">{t.login.eyebrow}</p>
          <h1 className="text-2xl lg:text-4xl font-bold text-white leading-tight [text-wrap:balance]">
            {t.login.title}
          </h1>
          <p className="mt-3 text-sm lg:text-base text-slate-200 leading-relaxed">
            {t.login.subtitle}
          </p>
        </div>
      </div>

      {/* Right Simple & Executive Sign-In Column */}
      <div className="lg:col-span-6 flex items-center justify-center p-5 sm:p-10 lg:p-16">
        <div className="w-full max-w-[420px] bg-white border border-[#DCE4F0] rounded-2xl p-6 sm:p-9 shadow-[0_12px_32px_rgba(15,30,61,0.07)]">
          {!pendingRotationUser ? (
            <>
              {/* Dedicated Company Logo Slot */}
              <div className="mb-7 pb-6 border-b border-[#E2E8F0] flex flex-col items-center text-center">
                <div className="h-20 w-full max-w-[240px] rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center px-4 py-2 overflow-hidden">
                  {companyLogoUrl && !logoError ? (
                    <img
                      src={companyLogoUrl}
                      alt={t.company}
                      referrerPolicy="no-referrer"
                      onError={() => setLogoError(true)}
                      className="max-h-14 max-w-full object-contain"
                    />
                  ) : (
                    <div className="flex items-center gap-3">
                      <svg
                        viewBox="0 0 40 40"
                        className="w-9 h-9 shrink-0"
                        aria-hidden="true"
                      >
                        <polygon
                          points="20,3 35,14 29,36 11,36 5,14"
                          fill="#0F1E3D"
                          stroke="#C8922B"
                          strokeWidth="2"
                        />
                        <polygon points="20,9 28,16 24,30 16,30 12,16" fill="#C8922B" fillOpacity="0.25" />
                        <line x1="20" y1="3" x2="20" y2="36" stroke="#C8922B" strokeWidth="1.2" />
                      </svg>
                      <div className="text-start">
                        <p className="text-xs font-bold tracking-tight text-[#0F1E3D]">
                          CRYSTAL ASFOUR
                        </p>
                        <p className="text-[10px] font-medium text-[#64748B]">
                          {lang === 'ar' ? 'شعار الشركة' : 'Company Logo'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <h2 className="mt-5 text-xl font-bold text-[#0F1E3D]">{t.login.adHeading}</h2>
                <p className="mt-1 text-xs sm:text-sm text-[#64748B]">{t.login.adSub}</p>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="cqd-username"
                    className="block text-xs font-semibold text-[#1E293B] mb-1.5"
                  >
                    {t.login.usernameLabel}
                  </label>
                  <input
                    id="cqd-username"
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      lang === 'ar' ? 'أدخل اسم المستخدم' : 'Enter your corporate username'
                    }
                    className="w-full min-h-[46px] px-3.5 text-base sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F1E3D] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0066CC] focus:ring-2 focus:ring-[#0066CC]/15 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cqd-password"
                    className="block text-xs font-semibold text-[#1E293B] mb-1.5"
                  >
                    {t.login.passwordLabel}
                  </label>
                  <div className="relative">
                    <input
                      id="cqd-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[46px] px-3.5 pe-11 text-base sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F1E3D] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#0066CC] focus:ring-2 focus:ring-[#0066CC]/15 focus:bg-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute inset-y-0 end-0 px-3.5 flex items-center text-[#64748B] hover:text-[#0F1E3D]"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#0F1E3D] hover:bg-[#162B54] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 mt-2"
                >
                  <Lock className="w-4 h-4 text-[#DFA941]" />
                  <span>{loading ? t.login.signingIn : t.login.signInBtn}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                {azureSsoEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = '/api/auth/azure/login';
                    }}
                    className="w-full min-h-[46px] px-4 rounded-xl border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-[#0F1E3D] text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <Building2 className="w-4 h-4 text-[#0066CC]" />
                    <span>
                      {lang === 'ar'
                        ? 'الدخول بحساب Microsoft Active Directory'
                        : 'Sign in with Microsoft Active Directory'}
                    </span>
                  </button>
                )}
              </form>
            </>
          ) : (
            <form onSubmit={handlePasswordRotation} className="space-y-4">
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[#FCF8EE] border border-[#E5C98B]">
                <ShieldAlert className="w-5 h-5 text-[#A36D0E] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0F1E3D]">{t.login.rotateTitle}</h2>
                  <p className="mt-1 text-xs text-[#475569] leading-relaxed">
                    {t.login.rotateDesc}
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="cqd-new-pass"
                  className="block text-xs font-semibold text-[#1E293B] mb-1.5"
                >
                  {t.login.newPasswordLabel}
                </label>
                <input
                  id="cqd-new-pass"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 text-base sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F1E3D] focus:outline-none focus:border-[#0066CC]"
                />
              </div>

              <div>
                <label
                  htmlFor="cqd-confirm-pass"
                  className="block text-xs font-semibold text-[#1E293B] mb-1.5"
                >
                  {t.login.confirmPasswordLabel}
                </label>
                <input
                  id="cqd-confirm-pass"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 text-base sm:text-sm bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl text-[#0F1E3D] focus:outline-none focus:border-[#0066CC]"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setPendingRotationUser(null);
                    setError(null);
                  }}
                  className="min-h-[44px] px-4 rounded-xl border border-[#CBD5E1] text-xs font-semibold text-[#475569] hover:bg-[#F8FAFC]"
                >
                  {lang === 'ar' ? 'رجوع' : 'Back'}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#0F1E3D] hover:bg-[#162B54] text-white text-sm font-semibold transition-colors disabled:opacity-60"
                >
                  {t.login.updatePasswordBtn}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
