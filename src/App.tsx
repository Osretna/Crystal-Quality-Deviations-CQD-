import { useEffect, useState } from 'react';
import {
  ClipboardPlus,
  LayoutGrid,
  MailCheck,
  ShieldCheck,
  FileCode2,
  Globe,
  LogOut,
  Plus,
} from 'lucide-react';
import type {
  BootstrapPayload,
  DeviationRecord,
  EmailMessage,
  Language,
  SystemConfig,
  UserAccount,
  WorkspaceTab,
} from './types';
import { getText } from './i18n';
import { LoginView } from './components/LoginView';
import { FieldLoggerView } from './components/FieldLoggerView';
import { DashboardView } from './components/DashboardView';
import { OutlookApprovalView } from './components/OutlookApprovalView';
import { AdminPanelView } from './components/AdminPanelView';
import { ArchitectureView } from './components/ArchitectureView';

export default function App() {
  const [lang, setLang] = useState<Language>('en');
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('dashboard');
  const [focusedDeviationId, setFocusedDeviationId] = useState<string | undefined>(undefined);
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  const t = getText(lang);

  useEffect(() => {
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    if (window.location.hash === '#admin' || window.location.pathname === '/admin') {
      setActiveTab('admin-panel');
    }
  }, []);

  async function fetchBootstrap() {
    setLoadingData(true);
    try {
      const res = await fetch('/api/bootstrap');
      if (res.ok) {
        const payload = (await res.json()) as BootstrapPayload;
        setData(payload);
      }
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (currentUser) {
      fetchBootstrap();
    }
  }, [currentUser]);

  function handleNavigate(tab: WorkspaceTab, deviationId?: string) {
    setActiveTab(tab);
    setFocusedDeviationId(deviationId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleDeviationCreated(record: DeviationRecord) {
    fetchBootstrap();
    setFocusedDeviationId(record.id);
  }

  function handleDecisionCompleted(updated: DeviationRecord, feedbackEmail: EmailMessage) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        deviations: prev.deviations.map((d) => (d.id === updated.id ? updated : d)),
        emails: [
          feedbackEmail,
          ...prev.emails.map((e) =>
            e.deviationId === updated.id && e.type === 'ApprovalRequest'
              ? { ...e, read: true, actionTaken: updated.status as 'Approved' | 'Rejected' }
              : e
          ),
        ],
      };
    });
    fetchBootstrap();
  }

  function handleConfigSaved(updated: SystemConfig) {
    setData((prev) => (prev ? { ...prev, config: updated } : prev));
    fetchBootstrap();
  }

  function handleUserUpdated(updated: UserAccount) {
    setData((prev) =>
      prev
        ? { ...prev, users: prev.users.map((u) => (u.id === updated.id ? updated : u)) }
        : prev
    );
  }

  function handleUserCreated(created: UserAccount) {
    setData((prev) => (prev ? { ...prev, users: [...prev.users, created] } : prev));
    fetchBootstrap();
  }

  function handleUserDeleted(deletedId: string) {
    setData((prev) =>
      prev ? { ...prev, users: prev.users.filter((u) => u.id !== deletedId) } : prev
    );
    fetchBootstrap();
  }

  function handleManualAdSync(lastSyncAt: string) {
    setData((prev) =>
      prev
        ? {
            ...prev,
            config: {
              ...prev.config,
              adSync: { ...prev.config.adSync, lastSyncAt },
            },
          }
        : prev
    );
    fetchBootstrap();
  }

  if (!currentUser) {
    return (
      <LoginView
        lang={lang}
        onToggleLang={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))}
        onAuthenticated={(user) => {
          setCurrentUser(user);
          if (user.role === 'Operator') {
            setActiveTab('field-log');
          } else if (user.role === 'System Admin') {
            setActiveTab('admin-panel');
          } else if (user.role === 'Production Manager') {
            setActiveTab('outlook-approvals');
          } else {
            setActiveTab('dashboard');
          }
        }}
      />
    );
  }

  const navItems: { key: WorkspaceTab; label: string; icon: typeof LayoutGrid }[] = [
    { key: 'field-log', label: t.nav.fieldLog, icon: ClipboardPlus },
    { key: 'dashboard', label: t.nav.dashboard, icon: LayoutGrid },
    { key: 'outlook-approvals', label: t.nav.outlook, icon: MailCheck },
    { key: 'admin-panel', label: t.nav.admin, icon: ShieldCheck },
    { key: 'architecture', label: t.nav.architecture, icon: FileCode2 },
  ];

  return (
    <div dir={lang === 'ar' ? 'rtl' : 'ltr'} className="min-h-screen bg-[#F4F7FB] text-[#0F1E3D]">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 bg-white border-b border-[#DCE4F0]">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line Brand Title + Optional Company Logo */}
          <button
            type="button"
            onClick={() => handleNavigate('dashboard')}
            className="inline-flex items-center gap-2.5 text-base sm:text-lg font-bold tracking-tight text-[#0F1E3D] whitespace-nowrap shrink-0"
          >
            {data?.config?.companyLogoUrl && (
              <img
                src={data.config.companyLogoUrl}
                alt={t.company}
                referrerPolicy="no-referrer"
                className="h-8 w-auto max-w-[110px] object-contain shrink-0"
              />
            )}
            <span>{t.brand}</span>
          </button>

          {/* Zone 2: 5 Single-line Nav Links */}
          <nav className="hidden lg:flex items-center gap-6">
            {navItems.map((item) => {
              const active = activeTab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => handleNavigate(item.key)}
                  className={`py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-[#C8922B] text-[#0F1E3D] font-semibold'
                      : 'border-transparent text-[#475569] hover:text-[#0F1E3D]'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => handleNavigate('field-log')}
              className="h-10 px-4 rounded-lg bg-[#0F1E3D] hover:bg-[#162B54] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5 text-[#DFA941]" />
              <span>{t.primaryCta}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Utility Strip (User AD Identity, Language Switcher, Sign Out) */}
      <div className="bg-[#0F1E3D] text-white">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-200 min-w-0">
            <span className="font-semibold text-[#DFA941] whitespace-nowrap">{t.company}</span>
            <span aria-hidden="true">·</span>
            <span className="truncate">
              {lang === 'ar' ? currentUser.displayNameAr : currentUser.displayName} (
              {currentUser.role})
            </span>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={() => setLang((prev) => (prev === 'en' ? 'ar' : 'en'))}
              className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white transition-colors whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 text-[#DFA941]" />
              <span>{lang === 'en' ? 'العربية' : 'English'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setCurrentUser(null);
                setData(null);
              }}
              className="inline-flex items-center gap-1.5 text-slate-200 hover:text-white transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>{t.signOut}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-12">
        {loadingData && !data ? (
          <div className="space-y-4">
            <div className="h-10 w-64 bg-[#E2E8F0] rounded-lg animate-pulse" />
            <div className="h-72 bg-white border border-[#DCE4F0] rounded-xl animate-pulse" />
          </div>
        ) : data ? (
          <>
            {activeTab === 'field-log' && (
              <FieldLoggerView
                lang={lang}
                config={data.config}
                currentUser={currentUser}
                onDeviationCreated={handleDeviationCreated}
                onNavigate={handleNavigate}
              />
            )}

            {activeTab === 'dashboard' && (
              <DashboardView
                lang={lang}
                deviations={data.deviations}
                config={data.config}
                initialSelectedId={focusedDeviationId}
                onNavigate={handleNavigate}
              />
            )}

            {activeTab === 'outlook-approvals' && (
              <OutlookApprovalView
                lang={lang}
                emails={data.emails}
                deviations={data.deviations}
                config={data.config}
                currentUser={currentUser}
                initialDeviationId={focusedDeviationId}
                onDecisionCompleted={handleDecisionCompleted}
              />
            )}

            {activeTab === 'admin-panel' && (
              <AdminPanelView
                lang={lang}
                currentUser={currentUser}
                config={data.config}
                users={data.users}
                auditLogs={data.auditLogs}
                onConfigSaved={handleConfigSaved}
                onUserUpdated={handleUserUpdated}
                onUserCreated={handleUserCreated}
                onUserDeleted={handleUserDeleted}
                onEscalationChanged={fetchBootstrap}
                onManualAdSync={handleManualAdSync}
              />
            )}

            {activeTab === 'architecture' && <ArchitectureView lang={lang} />}
          </>
        ) : null}
      </main>

      {/* Mobile Bottom Tab Bar (<= 15% viewport height, 44px+ hitboxes) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#DCE4F0]"
      >
        <div className="grid grid-cols-5 h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavigate(item.key)}
                className={`flex flex-col items-center justify-center gap-1 min-h-[44px] px-1 transition-colors ${
                  active ? 'text-[#0F1E3D] font-bold' : 'text-[#64748B]'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-[#C8922B]' : ''}`} />
                <span className="text-[10px] leading-none truncate max-w-full">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
