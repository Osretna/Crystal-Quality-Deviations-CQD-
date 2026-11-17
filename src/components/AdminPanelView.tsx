import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  RefreshCw,
  Save,
  UserPlus,
  CheckCircle2,
  Search,
  Trash2,
  Pencil,
  Mail,
  ShieldAlert,
  Upload,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import type {
  AdDirectoryCandidate,
  AppPermissions,
  AuditLogEntry,
  EscalationRecipient,
  Language,
  SystemConfig,
  UserAccount,
  UserRole,
} from '../types';
import { getText } from '../i18n';
import { formatShortDate } from '../utils/cqdHelpers';

interface AdminPanelViewProps {
  lang: Language;
  currentUser: UserAccount;
  config: SystemConfig;
  users: UserAccount[];
  auditLogs: AuditLogEntry[];
  onConfigSaved: (updated: SystemConfig) => void;
  onUserUpdated: (updated: UserAccount) => void;
  onUserCreated: (created: UserAccount) => void;
  onUserDeleted: (deletedId: string) => void;
  onEscalationChanged: () => void;
  onManualAdSync: (lastSyncAt: string) => void;
}

type AdminTab = 'ad-rbac' | 'branding' | 'escalations' | 'parameters' | 'routing' | 'audit';

const ALL_ROLES: UserRole[] = [
  'Operator',
  'Quality Inspector',
  'Production Manager',
  'Quality Director',
  'System Admin',
];

function roleDefaults(role: UserRole): AppPermissions {
  switch (role) {
    case 'System Admin':
      return {
        canCreateDeviation: true,
        canViewAllDeviations: true,
        canApproveReject: true,
        canExportCsv: true,
        canManageAdmin: true,
      };
    case 'Quality Director':
    case 'Production Manager':
      return {
        canCreateDeviation: true,
        canViewAllDeviations: true,
        canApproveReject: true,
        canExportCsv: true,
        canManageAdmin: false,
      };
    case 'Quality Inspector':
      return {
        canCreateDeviation: true,
        canViewAllDeviations: true,
        canApproveReject: false,
        canExportCsv: true,
        canManageAdmin: false,
      };
    case 'Operator':
    default:
      return {
        canCreateDeviation: true,
        canViewAllDeviations: false,
        canApproveReject: false,
        canExportCsv: false,
        canManageAdmin: false,
      };
  }
}

export function AdminPanelView({
  lang,
  currentUser,
  config,
  users,
  auditLogs,
  onConfigSaved,
  onUserUpdated,
  onUserCreated,
  onUserDeleted,
  onEscalationChanged,
  onManualAdSync,
}: AdminPanelViewProps) {
  const t = getText(lang);
  const isAdmin = currentUser.role === 'System Admin' || currentUser.permissions?.canManageAdmin;

  const [tab, setTab] = useState<AdminTab>('ad-rbac');
  const [draftConfig, setDraftConfig] = useState<SystemConfig>(config);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraftConfig(config);
  }, [config]);

  // AD Search state
  const [adQuery, setAdQuery] = useState('');
  const [adCandidates, setAdCandidates] = useState<AdDirectoryCandidate[]>([]);
  const [adSource, setAdSource] = useState<string>('SyncedAdDirectory');
  const [searchingAd, setSearchingAd] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<AdDirectoryCandidate | null>(null);
  const [grantRole, setGrantRole] = useState<UserRole>('Quality Inspector');
  const [grantPerms, setGrantPerms] = useState<AppPermissions>(roleDefaults('Quality Inspector'));

  // Edit User modal/panel state
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);

  // Manual user add fallback
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDepartment, setNewDepartment] = useState('Quality Control');
  const [newRole, setNewRole] = useState<UserRole>('Quality Inspector');

  // Escalation recipients add form
  const [escName, setEscName] = useState('');
  const [escNameAr, setEscNameAr] = useState('');
  const [escEmail, setEscEmail] = useState('');
  const [escDept, setEscDept] = useState('Quality Assurance Authority');
  const [escMinRpn, setEscMinRpn] = useState(config.rpnThresholds.criticalEscalationThreshold);

  // Stages & Models add
  const [newStageEn, setNewStageEn] = useState('');
  const [newStageAr, setNewStageAr] = useState('');
  const [newModelCode, setNewModelCode] = useState('');
  const [newModelNameEn, setNewModelNameEn] = useState('');

  async function runAdSearch(queryValue: string) {
    setSearchingAd(true);
    try {
      const res = await fetch(`/api/admin/ad-search?q=${encodeURIComponent(queryValue)}`);
      if (res.ok) {
        const data = (await res.json()) as {
          candidates: AdDirectoryCandidate[];
          source: string;
        };
        setAdCandidates(data.candidates);
        setAdSource(data.source);
      }
    } finally {
      setSearchingAd(false);
    }
  }

  useEffect(() => {
    runAdSearch('');
  }, [users.length]);

  async function saveConfigToServer(nextConfig: SystemConfig) {
    if (!isAdmin) return;
    setSaving(true);
    setBannerMsg(null);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: nextConfig,
          actorUsername: currentUser.username,
        }),
      });
      const data = (await res.json()) as { config?: SystemConfig; error?: string };
      if (!res.ok || !data.config) {
        setErrorMsg(data.error || 'Failed to save configuration.');
        return;
      }
      setDraftConfig(data.config);
      onConfigSaved(data.config);
      setBannerMsg(
        lang === 'ar'
          ? 'تم حفظ الإعدادات وتوثيقها في سجل التدقيق.'
          : 'Configuration saved & logged in security audit trail.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncAdNow() {
    if (!isAdmin) return;
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sync-ad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorUsername: currentUser.username }),
      });
      const data = (await res.json()) as { lastSyncAt?: string };
      if (res.ok && data.lastSyncAt) {
        onManualAdSync(data.lastSyncAt);
        runAdSearch(adQuery);
        setBannerMsg(
          lang === 'ar'
            ? 'تمت مزامنة دليل Active Directory بنجاح.'
            : 'Active Directory delta sync completed.'
        );
      }
    } finally {
      setSyncing(false);
    }
  }

  async function handleGrantFromAd() {
    if (!isAdmin || !selectedCandidate) return;
    setErrorMsg(null);
    setBannerMsg(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: selectedCandidate.username,
        displayName: selectedCandidate.displayName,
        displayNameAr: selectedCandidate.displayNameAr,
        email: selectedCandidate.email,
        department: selectedCandidate.department,
        jobTitle: selectedCandidate.jobTitle,
        adGroup: selectedCandidate.adGroup,
        role: grantRole,
        permissions: grantPerms,
        actorUsername: currentUser.username,
      }),
    });
    const data = (await res.json()) as { user?: UserAccount; error?: string };
    if (!res.ok || !data.user) {
      setErrorMsg(data.error || 'Failed to grant AD access.');
      return;
    }
    onUserCreated(data.user);
    setSelectedCandidate(null);
    setBannerMsg(
      lang === 'ar'
        ? `تم منح الصلاحية لـ ${data.user.displayNameAr} وإرسال إيميل التفعيل تلقائياً إلى ${data.user.email}.`
        : `Granted ${data.user.role} access to ${data.user.displayName} and automatically sent welcome email to ${data.user.email}.`
    );
  }

  async function handleAddManualUser(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin || !newUsername.trim() || !newDisplayName.trim() || !newEmail.trim()) return;
    setErrorMsg(null);
    setBannerMsg(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: newUsername,
        displayName: newDisplayName,
        email: newEmail,
        department: newDepartment,
        role: newRole,
        permissions: roleDefaults(newRole),
        actorUsername: currentUser.username,
      }),
    });
    const data = (await res.json()) as { user?: UserAccount; error?: string };
    if (!res.ok || !data.user) {
      setErrorMsg(data.error || 'Failed to provision user.');
      return;
    }
    onUserCreated(data.user);
    setNewUsername('');
    setNewDisplayName('');
    setNewEmail('');
    setBannerMsg(
      lang === 'ar'
        ? `تمت إضافة ${data.user.displayName} وإرسال البريد الإلكتروني تلقائياً إلى ${data.user.email}.`
        : `Provisioned ${data.user.displayName} and automatically sent welcome email to ${data.user.email}.`
    );
  }

  async function handleSaveEditedUser(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin || !editingUser) return;
    const res = await fetch(`/api/admin/users/${editingUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: editingUser.displayName,
        displayNameAr: editingUser.displayNameAr,
        email: editingUser.email,
        department: editingUser.department,
        role: editingUser.role,
        permissions: editingUser.permissions,
        active: editingUser.active,
        actorUsername: currentUser.username,
      }),
    });
    const data = (await res.json()) as { user?: UserAccount; error?: string };
    if (res.ok && data.user) {
      onUserUpdated(data.user);
      setEditingUser(null);
      setBannerMsg(
        lang === 'ar'
          ? `تم تحديث بيانات وصلاحيات ${data.user.username}.`
          : `Updated profile and permissions for ${data.user.username}.`
      );
    }
  }

  async function handleDeleteUser(userId: string) {
    if (!isAdmin) return;
    const res = await fetch(
      `/api/admin/users/${userId}?actor=${encodeURIComponent(currentUser.username)}`,
      { method: 'DELETE' }
    );
    if (res.ok) {
      onUserDeleted(userId);
      setConfirmDeleteUserId(null);
      setBannerMsg(
        lang === 'ar'
          ? 'تم حذف المستخدم وإلغاء صلاحياته من التطبيق.'
          : 'User removed and application access revoked.'
      );
    }
  }

  async function handleAddEscalation(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin || !escName.trim() || !escEmail.trim()) return;
    setErrorMsg(null);
    const res = await fetch('/api/admin/escalations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: escName,
        nameAr: escNameAr || escName,
        email: escEmail,
        department: escDept,
        minRpnTrigger: escMinRpn,
        actorUsername: currentUser.username,
      }),
    });
    const data = (await res.json()) as { recipient?: EscalationRecipient; error?: string };
    if (!res.ok || !data.recipient) {
      setErrorMsg(data.error || 'Failed to add escalation recipient.');
      return;
    }
    setEscName('');
    setEscNameAr('');
    setEscEmail('');
    onEscalationChanged();
    setBannerMsg(
      lang === 'ar'
        ? `تمت إضافة ${data.recipient.nameAr} لقائمة تصعيد الجودة وإرسال إيميل الإشعار تلقائياً.`
        : `Added ${data.recipient.name} to Quality Escalation list & automatically sent confirmation email.`
    );
  }

  async function handleToggleEscalation(id: string, active: boolean) {
    if (!isAdmin) return;
    await fetch(`/api/admin/escalations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active, actorUsername: currentUser.username }),
    });
    onEscalationChanged();
  }

  async function handleDeleteEscalation(id: string) {
    if (!isAdmin) return;
    await fetch(
      `/api/admin/escalations/${id}?actor=${encodeURIComponent(currentUser.username)}`,
      { method: 'DELETE' }
    );
    onEscalationChanged();
  }

  function handleAddStage() {
    if (!newStageEn.trim()) return;
    setDraftConfig({
      ...draftConfig,
      stages: [
        ...draftConfig.stages,
        {
          id: `stg-${Date.now()}`,
          code: `STG-0${draftConfig.stages.length + 1}`,
          nameEn: newStageEn.trim(),
          nameAr: newStageAr.trim() || newStageEn.trim(),
          assignedManagerName: 'Eng. Karim Mansour',
          assignedManagerEmail: 'k.mansour@crystalasfour.com',
          active: true,
        },
      ],
    });
    setNewStageEn('');
    setNewStageAr('');
  }

  function handleAddModel() {
    if (!newModelCode.trim() || !newModelNameEn.trim()) return;
    setDraftConfig({
      ...draftConfig,
      models: [
        ...draftConfig.models,
        {
          id: `mod-${Date.now()}`,
          code: newModelCode.trim().toUpperCase(),
          nameEn: newModelNameEn.trim(),
          nameAr: newModelNameEn.trim(),
          collection: 'Custom Line',
          active: true,
        },
      ],
    });
    setNewModelCode('');
    setNewModelNameEn('');
  }

  async function handleLogoFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !isAdmin) return;
    setErrorMsg(null);
    setBannerMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = String(reader.result || '');
      let finalLogoUrl = rawDataUrl;

      if (!file.type.includes('svg')) {
        try {
          finalLogoUrl = await new Promise<string>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const maxW = 640;
              const maxH = 260;
              const scale = Math.min(1, maxW / img.width, maxH / img.height);
              const w = Math.max(1, Math.round(img.width * scale));
              const h = Math.max(1, Math.round(img.height * scale));
              const canvas = document.createElement('canvas');
              canvas.width = w;
              canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (!ctx) {
                resolve(rawDataUrl);
                return;
              }
              ctx.clearRect(0, 0, w, h);
              ctx.drawImage(img, 0, 0, w, h);
              resolve(canvas.toDataURL('image/png'));
            };
            img.onerror = () => resolve(rawDataUrl);
            img.src = rawDataUrl;
          });
        } catch {
          finalLogoUrl = rawDataUrl;
        }
      }

      const nextConfig: SystemConfig = { ...draftConfig, companyLogoUrl: finalLogoUrl };
      setDraftConfig(nextConfig);
      await saveConfigToServer(nextConfig);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const permissionLabels: { key: keyof AppPermissions; en: string; ar: string }[] = [
    { key: 'canCreateDeviation', en: 'Log Deviations', ar: 'تسجيل استثناء' },
    { key: 'canViewAllDeviations', en: 'View All Plant Rows', ar: 'رؤية كل السجلات' },
    { key: 'canApproveReject', en: 'Approve / Reject', ar: 'موافقة ورفض' },
    { key: 'canExportCsv', en: 'Export CSV', ar: 'تصدير CSV' },
    { key: 'canManageAdmin', en: 'Admin Control', ar: 'صلاحيات الأدمن' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1E3D]">{t.admin.heading}</h1>
          <p className="text-sm text-[#475569] mt-1">{t.admin.subheading}</p>
        </div>

        {isAdmin && (
          <button
            type="button"
            disabled={saving}
            onClick={() => saveConfigToServer(draftConfig)}
            className="min-h-[44px] px-4 rounded-lg bg-[#0F1E3D] hover:bg-[#162B54] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Save className="w-4 h-4 text-[#DFA941]" />
            <span>{saving ? 'Saving...' : t.admin.saveConfig}</span>
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="p-4 rounded-xl bg-[#FCF8EE] border border-[#E5C98B] text-xs font-medium text-[#7C4E08]">
          {t.admin.restrictedNotice}
        </div>
      )}

      {bannerMsg && (
        <div className="p-3.5 rounded-xl bg-[#F0FDF4] border border-[#BBF7D0] text-xs font-semibold text-[#15803D] flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{bannerMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-xs font-semibold text-[#B91C1C]">
          {errorMsg}
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#E9EFF7] rounded-lg">
        {(
          [
            {
              key: 'ad-rbac',
              label: lang === 'ar' ? 'المستخدمون وبحث AD' : 'AD Search & Users RBAC',
            },
            {
              key: 'branding',
              label: lang === 'ar' ? 'شعار الشركة' : 'Company Logo',
            },
            {
              key: 'escalations',
              label: lang === 'ar' ? 'تصعيد الجودة (RPN)' : 'Quality Escalation List',
            },
            { key: 'parameters', label: t.admin.tabs.parameters },
            { key: 'routing', label: t.admin.tabs.routing },
            { key: 'audit', label: t.admin.tabs.audit },
          ] as { key: AdminTab; label: string }[]
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`min-h-[40px] px-3.5 py-2 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              tab === item.key
                ? 'bg-white text-[#0F1E3D]'
                : 'text-[#475569] hover:text-[#0F1E3D]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'ad-rbac' && (
        <div className="space-y-6">
          {/* Live Active Directory User Search & Permission Assignment */}
          <div className="bg-white border border-[#DCE4F0] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
              <div>
                <h2 className="text-sm font-bold text-[#0F1E3D]">
                  {lang === 'ar'
                    ? 'البحث المباشر في Active Directory ومنح الصلاحيات'
                    : 'Active Directory People Search & App Access Grant'}
                </h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  {adSource === 'MicrosoftGraph'
                    ? 'Connected Live: Microsoft Entra ID Graph API'
                    : lang === 'ar'
                    ? 'ابحث عن أي موظف في دليل الشركة (corp.crystalasfour.com) لإضافته وإرسال الإيميل له فوراً'
                    : 'Search corporate Active Directory (corp.crystalasfour.com) to grant app permissions & auto-send welcome email.'}
                </p>
              </div>
              <button
                type="button"
                disabled={!isAdmin || syncing}
                onClick={handleSyncAdNow}
                className="min-h-[40px] px-3.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#0F1E3D] inline-flex items-center gap-2 disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{lang === 'ar' ? 'مزامنة AD الآن' : 'Sync AD Now'}</span>
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#64748B] absolute top-1/2 -translate-y-1/2 start-3.5 pointer-events-none" />
                <input
                  type="text"
                  value={adQuery}
                  onChange={(e) => {
                    setAdQuery(e.target.value);
                    runAdSearch(e.target.value);
                  }}
                  placeholder={
                    lang === 'ar'
                      ? 'ابحث بالاسم، البريد الإلكتروني، القسم، أو اسم المستخدم (مثال: Tarek أو QC)...'
                      : 'Search AD by name, username, email, or department (e.g. Tarek, Heba, QC)...'
                  }
                  className="w-full min-h-[44px] ps-10 pe-3.5 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F1E3D] focus:outline-none focus:border-[#1F3B73] focus:bg-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {searchingAd ? (
                <p className="text-xs text-[#64748B] col-span-full py-2">Searching Active Directory...</p>
              ) : adCandidates.length === 0 ? (
                <p className="text-xs text-[#64748B] col-span-full py-2">
                  {lang === 'ar' ? 'لا توجد نتائج مطابقة في الدليل.' : 'No matching AD accounts found.'}
                </p>
              ) : (
                adCandidates.map((cand) => {
                  const isPicked = selectedCandidate?.username === cand.username;
                  return (
                    <div
                      key={cand.username}
                      className={`p-3.5 rounded-lg border text-xs flex flex-col justify-between gap-2 ${
                        isPicked
                          ? 'border-[#0F1E3D] bg-[#F4F7FB]'
                          : 'border-[#E2E8F0] bg-white'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-[#0F1E3D] truncate">
                          {lang === 'ar' ? cand.displayNameAr : cand.displayName}
                        </p>
                        <p className="font-mono text-[11px] text-[#1F3B73] truncate mt-0.5">
                          {cand.email}
                        </p>
                        <p className="text-[11px] text-[#64748B] truncate mt-0.5">
                          {cand.jobTitle} · {cand.department}
                        </p>
                      </div>
                      {cand.alreadyProvisioned ? (
                        <span className="text-[11px] font-semibold text-[#15803D]">
                          {lang === 'ar' ? 'مُفعّل بالفعل في التطبيق' : 'Already Active in App'}
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => {
                            setSelectedCandidate(cand);
                            setGrantRole('Quality Inspector');
                            setGrantPerms(roleDefaults('Quality Inspector'));
                          }}
                          className="min-h-[36px] px-3 rounded-md bg-[#0F1E3D] hover:bg-[#162B54] text-white text-[11px] font-semibold transition-colors disabled:opacity-50"
                        >
                          {lang === 'ar' ? 'اختيار ومنح صلاحية' : 'Select & Grant Access'}
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {selectedCandidate && isAdmin && (
              <div className="p-4 rounded-xl bg-[#F4F7FB] border border-[#0F1E3D] space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-[#0F1E3D]">
                      {lang === 'ar' ? 'تحديد الصلاحيات للمستخدم:' : 'Configure Permissions for:'}{' '}
                      {selectedCandidate.displayName} ({selectedCandidate.email})
                    </p>
                    <p className="text-[11px] font-mono text-[#475569] mt-0.5">
                      {selectedCandidate.adGroup}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCandidate(null)}
                    className="p-1 text-[#64748B] hover:text-[#0F1E3D]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-4">
                    <label className="block text-[11px] font-semibold text-[#334155] mb-1">
                      {lang === 'ar' ? 'الدور الوظيفي (Role)' : 'Assigned Role'}
                    </label>
                    <select
                      value={grantRole}
                      onChange={(e) => {
                        const r = e.target.value as UserRole;
                        setGrantRole(r);
                        setGrantPerms(roleDefaults(r));
                      }}
                      className="w-full min-h-[40px] px-3 text-xs bg-white border border-[#CBD5E1] rounded-lg font-semibold"
                    >
                      {ALL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-8 flex flex-wrap gap-3 pt-2">
                    {permissionLabels.map((perm) => (
                      <label
                        key={perm.key}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F1E3D] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={grantPerms[perm.key]}
                          onChange={(e) =>
                            setGrantPerms({ ...grantPerms, [perm.key]: e.target.checked })
                          }
                          className="w-4 h-4 accent-[#0F1E3D]"
                        />
                        <span>{lang === 'ar' ? perm.ar : perm.en}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleGrantFromAd}
                    className="min-h-[42px] px-4 rounded-lg bg-[#0F1E3D] hover:bg-[#162B54] text-white text-xs font-semibold inline-flex items-center gap-2"
                  >
                    <Mail className="w-4 h-4 text-[#DFA941]" />
                    <span>
                      {lang === 'ar'
                        ? 'إضافة للتطبيق وإرسال الإيميل تلقائياً'
                        : 'Grant Access & Auto-Send Welcome Email'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Provisioned App Users Table with Full Edit, Permissions & Delete */}
          <div className="bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-[#E2E8F0] flex flex-col xl:flex-row xl:items-center justify-between gap-4">
              <h2 className="text-sm font-bold text-[#0F1E3D]">
                {lang === 'ar'
                  ? 'إدارة مستخدمي التطبيق (تعديل / صلاحيات / حذف)'
                  : 'Application Users & Granular Permissions (Edit / Delete)'}
              </h2>
              {isAdmin && (
                <form onSubmit={handleAddManualUser} className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    placeholder="username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="min-h-[40px] px-2.5 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg w-28"
                  />
                  <input
                    type="text"
                    placeholder="Full Name"
                    value={newDisplayName}
                    onChange={(e) => setNewDisplayName(e.target.value)}
                    className="min-h-[40px] px-2.5 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg w-36"
                  />
                  <input
                    type="email"
                    placeholder="user@crystalasfour.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="min-h-[40px] px-2.5 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg w-44"
                  />
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="min-h-[40px] px-2.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="min-h-[40px] px-3 rounded-lg bg-[#0F1E3D] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>{lang === 'ar' ? 'إضافة وإرسال إيميل' : 'Add & Email'}</span>
                  </button>
                </form>
              )}
            </div>

            {editingUser && isAdmin && (
              <form
                onSubmit={handleSaveEditedUser}
                className="p-5 bg-[#F4F7FB] border-b border-[#DCE4F0] space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#0F1E3D]">
                    {lang === 'ar' ? 'تعديل المستخدم:' : 'Editing User:'}{' '}
                    <span className="font-mono">{editingUser.username}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setEditingUser(null)}
                    className="text-xs text-[#64748B] hover:text-[#0F1E3D]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <input
                    type="text"
                    value={editingUser.displayName}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, displayName: e.target.value })
                    }
                    placeholder="Display Name (EN)"
                    className="min-h-[40px] px-3 text-xs bg-white border border-[#CBD5E1] rounded-lg"
                  />
                  <input
                    type="text"
                    value={editingUser.displayNameAr}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, displayNameAr: e.target.value })
                    }
                    placeholder="الاسم بالعربية"
                    className="min-h-[40px] px-3 text-xs bg-white border border-[#CBD5E1] rounded-lg"
                  />
                  <input
                    type="email"
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    placeholder="Email"
                    className="min-h-[40px] px-3 text-xs bg-white border border-[#CBD5E1] rounded-lg"
                  />
                  <select
                    value={editingUser.role}
                    onChange={(e) => {
                      const r = e.target.value as UserRole;
                      setEditingUser({
                        ...editingUser,
                        role: r,
                        permissions: roleDefaults(r),
                      });
                    }}
                    className="min-h-[40px] px-3 text-xs bg-white border border-[#CBD5E1] rounded-lg font-semibold"
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-3">
                    {permissionLabels.map((perm) => (
                      <label
                        key={perm.key}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0F1E3D]"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(editingUser.permissions?.[perm.key])}
                          onChange={(e) =>
                            setEditingUser({
                              ...editingUser,
                              permissions: {
                                ...editingUser.permissions,
                                [perm.key]: e.target.checked,
                              },
                            })
                          }
                          className="w-4 h-4 accent-[#0F1E3D]"
                        />
                        <span>{lang === 'ar' ? perm.ar : perm.en}</span>
                      </label>
                    ))}
                  </div>

                  <button
                    type="submit"
                    className="min-h-[40px] px-4 rounded-lg bg-[#0F1E3D] text-white text-xs font-semibold"
                  >
                    {lang === 'ar' ? 'حفظ التعديلات' : 'Save User Changes'}
                  </button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                    <th className="py-3 px-4 text-start">Username</th>
                    <th className="py-3 px-4 text-start">Name & Email</th>
                    <th className="py-3 px-4 text-start">Role</th>
                    <th className="py-3 px-4 text-start">Granular App Permissions</th>
                    <th className="py-3 px-4 text-start">State</th>
                    <th className="py-3 px-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4 font-mono font-semibold text-[#0F1E3D] whitespace-nowrap">
                        {u.username}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#0F1E3D]">
                          {lang === 'ar' ? u.displayNameAr : u.displayName}
                        </div>
                        <div className="text-[11px] text-[#64748B]">
                          {u.email} · {u.department}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#1F3B73] whitespace-nowrap">
                        {u.role}
                      </td>
                      <td className="py-3 px-4 text-[11px] text-[#475569]">
                        {[
                          u.permissions?.canCreateDeviation && 'Log',
                          u.permissions?.canViewAllDeviations && 'ViewAll',
                          u.permissions?.canApproveReject && 'Approve',
                          u.permissions?.canExportCsv && 'Export',
                          u.permissions?.canManageAdmin && 'Admin',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          disabled={!isAdmin || u.username === 'admin'}
                          onClick={async () => {
                            const res = await fetch(`/api/admin/users/${u.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                active: !u.active,
                                actorUsername: currentUser.username,
                              }),
                            });
                            const d = (await res.json()) as { user?: UserAccount };
                            if (d.user) onUserUpdated(d.user);
                          }}
                          className={`font-semibold ${
                            u.active ? 'text-[#15803D]' : 'text-[#B91C1C]'
                          } disabled:opacity-50`}
                        >
                          {u.active ? 'Active' : 'Disabled'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-end whitespace-nowrap">
                        {isAdmin && (
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingUser(u)}
                              className="p-1.5 rounded-md border border-[#CBD5E1] text-[#0F1E3D] hover:bg-white"
                              aria-label={`Edit ${u.username}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            {u.username !== 'admin' &&
                              (confirmDeleteUserId === u.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="px-2 py-1 rounded bg-[#B91C1C] text-white text-[11px] font-semibold"
                                  >
                                    {lang === 'ar' ? 'تأكيد الحذف' : 'Confirm'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserId(null)}
                                    className="px-2 py-1 rounded border border-[#CBD5E1] text-[11px]"
                                  >
                                    {lang === 'ar' ? 'إلغاء' : 'Cancel'}
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(u.id)}
                                  className="p-1.5 rounded-md border border-[#FECACA] text-[#B91C1C] hover:bg-[#FEF2F2]"
                                  aria-label={`Delete ${u.username}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Active Directory / Microsoft Entra ID + Vercel Connector Settings */}
          <div className="bg-white border border-[#DCE4F0] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
                <div>
                  <h2 className="text-sm font-bold text-[#0F1E3D]">
                    {lang === 'ar'
                      ? 'إعدادات ربط Active Directory (On-Premises LDAP & Microsoft Entra ID)'
                      : 'Active Directory Environment Configuration (LDAP & Entra ID)'}
                  </h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    {lang === 'ar'
                      ? 'يتم إدخال بيانات السيرفر و Base DN و Bind Credentials أو Azure AD هنا مباشرة بواسطة موظف IT/Admin دون تعديل أي ملفات.'
                      : 'Enter Domain Controller IP, Base DN, Bind Credentials, Security Groups & Azure AD keys directly here with your IT Admin.'}
                  </p>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={async () => {
                      await saveConfigToServer(draftConfig);
                      const res = await fetch('/api/admin/test-ad', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ actorUsername: currentUser.username }),
                      });
                      const d = (await res.json()) as { ok?: boolean; message?: string };
                      if (d.message) {
                        if (d.ok) setBannerMsg(d.message);
                        else setErrorMsg(d.message);
                      }
                    }}
                    className="min-h-[40px] px-3.5 rounded-lg border border-[#0F1E3D] bg-[#F4F7FB] hover:bg-[#E9EFF7] text-xs font-semibold text-[#0F1E3D] whitespace-nowrap shrink-0"
                  >
                    {lang === 'ar' ? 'حفظ واختبار الاتصال مع AD' : 'Save & Test AD Connection'}
                  </button>
                )}
              </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Corporate Domain
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draftConfig.adSync.tenantDomain}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, tenantDomain: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Domain Controller IP
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="10.42.1.10"
                  value={draftConfig.adSync.domainControllerIp || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, domainControllerIp: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  LDAP / LDAPS URL
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="ldaps://dc01.asfourcrystal.com:636"
                  value={draftConfig.adSync.ldapEndpoint || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, ldapEndpoint: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Base DN
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="DC=asfourcrystal,DC=com"
                  value={draftConfig.adSync.baseDn || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, baseDn: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Bind DN (Service Account)
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="CN=svc-cqd-ldap,OU=ServiceAccounts,DC=asfourcrystal,DC=com"
                  value={draftConfig.adSync.bindDn || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, bindDn: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Bind Password {draftConfig.adSync.hasBindPassword ? '(Saved)' : ''}
                </label>
                <input
                  type="password"
                  disabled={!isAdmin}
                  placeholder={
                    draftConfig.adSync.hasBindPassword ? '••••••••••••' : 'Service Account Password'
                  }
                  value={draftConfig.adSync.bindPasswordInput || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, bindPasswordInput: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  AD Group — Inspectors
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draftConfig.adSync.inspectorsGroupDn || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, inspectorsGroupDn: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  AD Group — Quality Managers
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draftConfig.adSync.managersGroupDn || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, managersGroupDn: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  AD Group — System Admins
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draftConfig.adSync.adminsGroupDn || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, adminsGroupDn: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Azure AD Tenant ID (Entra ID)
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  value={draftConfig.adSync.tenantId}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, tenantId: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Azure AD Client ID
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  placeholder="Application (client) ID"
                  value={draftConfig.adSync.clientId}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, clientId: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Azure Client Secret {draftConfig.adSync.hasClientSecret ? '(Configured)' : ''}
                </label>
                <input
                  type="password"
                  disabled={!isAdmin}
                  placeholder={
                    draftConfig.adSync.hasClientSecret ? '••••••••••••' : 'Paste Azure Client Secret'
                  }
                  value={draftConfig.adSync.clientSecretInput || ''}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, clientSecretInput: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Graph Sender Mailbox
                </label>
                <input
                  type="email"
                  disabled={!isAdmin}
                  value={draftConfig.adSync.graphSenderEmail}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: { ...draftConfig.adSync, graphSenderEmail: e.target.value },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Power Automate Webhook URL (Optional)
                </label>
                <input
                  type="url"
                  disabled={!isAdmin}
                  placeholder="https://prod-xx.logic.azure.com/..."
                  value={draftConfig.adSync.powerAutomateWebhookUrl}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      adSync: {
                        ...draftConfig.adSync,
                        powerAutomateWebhookUrl: e.target.value,
                      },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Company Logo & Identity */}
      {tab === 'branding' && (
        <div className="bg-white border border-[#DCE4F0] rounded-xl p-5 sm:p-6 space-y-6 max-w-4xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E2E8F0] pb-4">
            <div>
              <h2 className="text-sm font-bold text-[#0F1E3D]">
                {lang === 'ar'
                  ? 'شعار الشركة لشاشة تسجيل الدخول والنظام'
                  : 'Company Logo for Login Screen & Workspace Header'}
              </h2>
              <p className="text-xs text-[#64748B] mt-1">
                {lang === 'ar'
                  ? 'ارفع شعار الشركة (PNG شفاف أو SVG أو JPG) ليظهر تلقائياً في شاشة الدخول وشريط النظام العلوي.'
                  : 'Upload your official company logo (transparent PNG, SVG, JPG, or WebP) to display on the sign-in screen and workspace header.'}
              </p>
            </div>
            {isAdmin && draftConfig.companyLogoUrl && (
              <button
                type="button"
                onClick={async () => {
                  const next = { ...draftConfig, companyLogoUrl: '' };
                  setDraftConfig(next);
                  await saveConfigToServer(next);
                }}
                className="min-h-[40px] px-3.5 rounded-lg border border-[#FECACA] bg-[#FEF2F2] hover:bg-[#FEE2E2] text-xs font-semibold text-[#B91C1C] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{lang === 'ar' ? 'إزالة الشعار' : 'Remove Logo'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-6 space-y-4">
              <label
                className={`flex flex-col items-center justify-center gap-2.5 p-6 rounded-xl border-2 border-dashed transition-colors ${
                  isAdmin
                    ? 'border-[#CBD5E1] hover:border-[#0066CC] bg-[#F8FAFC] cursor-pointer'
                    : 'border-[#E2E8F0] bg-[#F8FAFC] opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-white border border-[#DCE4F0] flex items-center justify-center text-[#0F1E3D]">
                  <Upload className="w-5 h-5" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold text-[#0F1E3D]">
                    {lang === 'ar' ? 'اضغط لرفع شعار الشركة من جهازك' : 'Click to Upload Company Logo'}
                  </p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">
                    PNG (Transparent), SVG, JPG, WebP
                  </p>
                </div>
                <input
                  type="file"
                  disabled={!isAdmin}
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoFileSelected}
                  className="hidden"
                />
              </label>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                  {lang === 'ar' ? 'أو أدخل رابط الشعار مباشرة (URL)' : 'Or Paste Direct Logo Image URL'}
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    disabled={!isAdmin}
                    placeholder="https://example.com/crystal-asfour-logo.png"
                    value={draftConfig.companyLogoUrl || ''}
                    onChange={(e) =>
                      setDraftConfig({ ...draftConfig, companyLogoUrl: e.target.value })
                    }
                    className="flex-1 min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  />
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => saveConfigToServer(draftConfig)}
                      className="min-h-[40px] px-4 rounded-lg bg-[#0F1E3D] hover:bg-[#162B54] text-white text-xs font-semibold whitespace-nowrap shrink-0"
                    >
                      {lang === 'ar' ? 'حفظ الشعار' : 'Save Logo'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="md:col-span-6 space-y-3">
              <p className="text-xs font-bold text-[#0F1E3D]">
                {lang === 'ar' ? 'معاينة ظهور الشعار في شاشة الدخول' : 'Login Screen Logo Preview'}
              </p>
              <div className="p-6 rounded-xl bg-[#F4F7FB] border border-[#DCE4F0] flex flex-col items-center justify-center">
                <div className="w-full max-w-[260px] bg-white border border-[#E2E8F0] rounded-xl p-5 flex flex-col items-center text-center shadow-sm">
                  <div className="h-20 w-full rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center px-3 overflow-hidden">
                    {draftConfig.companyLogoUrl ? (
                      <img
                        src={draftConfig.companyLogoUrl}
                        alt="Company Logo Preview"
                        referrerPolicy="no-referrer"
                        className="max-h-14 max-w-full object-contain"
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-[#64748B]">
                        <ImageIcon className="w-5 h-5" />
                        <span className="text-xs font-medium">
                          {lang === 'ar' ? 'مكان شعار الشركة' : 'Company Logo Slot'}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-sm font-bold text-[#0F1E3D]">{t.login.adHeading}</p>
                  <p className="text-[11px] text-[#64748B] mt-0.5">{t.login.adSub}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Quality Escalation Authorities (Triggered when RPN exceeds threshold) */}
      {tab === 'escalations' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#DCE4F0] rounded-xl p-5 sm:p-6 space-y-5">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-[#A36D0E] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-[#0F1E3D]">
                  {lang === 'ar'
                    ? 'الجهة المختصة في الجودة — قائمة التصعيد التلقائي عند تجاوز نسبة RPN'
                    : 'Quality Escalation Authorities — Auto-Notified on High RPN'}
                </h2>
                <p className="text-xs text-[#64748B] mt-1">
                  {lang === 'ar'
                    ? 'أي استثناء يتجاوز مؤشر RPN المحدد هنا يتم إرسال أمر وتنبيه فوري تلقائياً لكل الأشخاص المضافين في هذه القائمة.'
                    : 'Whenever a logged deviation reaches or exceeds the RPN trigger below, CQD automatically dispatches an escalation command & alert email to every active recipient listed here.'}
                </p>
              </div>
            </div>

            {isAdmin && (
              <form
                onSubmit={handleAddEscalation}
                className="p-4 rounded-xl bg-[#F4F7FB] border border-[#DCE4F0] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 items-end"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">
                    {lang === 'ar' ? 'الاسم (EN)' : 'Full Name'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Eng. Salma Nabil"
                    value={escName}
                    onChange={(e) => setEscName(e.target.value)}
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs bg-white border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">
                    {lang === 'ar' ? 'الاسم (AR)' : 'Arabic Name'}
                  </label>
                  <input
                    type="text"
                    placeholder="م. سلمى نبيل"
                    value={escNameAr}
                    onChange={(e) => setEscNameAr(e.target.value)}
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs bg-white border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">
                    {lang === 'ar' ? 'البريد الإلكتروني' : 'Corporate Email'}
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="s.nabil@crystalasfour.com"
                    value={escEmail}
                    onChange={(e) => setEscEmail(e.target.value)}
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs bg-white border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">
                    {lang === 'ar' ? 'جهة الجودة' : 'Quality Unit'}
                  </label>
                  <input
                    type="text"
                    value={escDept}
                    onChange={(e) => setEscDept(e.target.value)}
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs bg-white border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#334155] mb-1">
                    {lang === 'ar' ? 'حد RPN للإرسال' : 'Trigger RPN ≥'}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={escMinRpn}
                    onChange={(e) => setEscMinRpn(Number(e.target.value) || 120)}
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono tabular-nums bg-white border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-lg bg-[#0F1E3D] hover:bg-[#162B54] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5 text-[#DFA941]" />
                  <span>{lang === 'ar' ? 'إضافة للقائمة' : 'Add Authority'}</span>
                </button>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                    <th className="py-3 px-4 text-start">Authority Name</th>
                    <th className="py-3 px-4 text-start">Email</th>
                    <th className="py-3 px-4 text-start">Quality Unit</th>
                    <th className="py-3 px-4 text-end">Trigger RPN</th>
                    <th className="py-3 px-4 text-start">State</th>
                    <th className="py-3 px-4 text-end">Remove</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {(config.escalationRecipients || []).map((esc) => (
                    <tr key={esc.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-3 px-4 font-semibold text-[#0F1E3D]">
                        {lang === 'ar' ? esc.nameAr : esc.name}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#1F3B73]">{esc.email}</td>
                      <td className="py-3 px-4 text-[#475569]">{esc.department}</td>
                      <td className="py-3 px-4 text-end font-mono font-bold text-[#B91C1C] tabular-nums">
                        ≥ {esc.minRpnTrigger}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          disabled={!isAdmin}
                          onClick={() => handleToggleEscalation(esc.id, !esc.active)}
                          className={`font-semibold ${
                            esc.active ? 'text-[#15803D]' : 'text-[#64748B]'
                          }`}
                        >
                          {esc.active ? 'Active' : 'Paused'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-end">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteEscalation(esc.id)}
                            className="p-1.5 rounded-md border border-[#FECACA] text-[#B91C1C] hover:bg-[#FEF2F2]"
                            aria-label={`Remove ${esc.email}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tab === 'parameters' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Production Stages */}
          <div className="lg:col-span-6 bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              {lang === 'ar' ? 'المراحل الإنتاجية ومسؤولو الاعتماد' : 'Production Stages & Approvers'}
            </h2>
            <div className="divide-y divide-[#F1F5F9]">
              {draftConfig.stages.map((stage) => (
                <div key={stage.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-semibold text-[#0F1E3D]">
                      {stage.code} · {lang === 'ar' ? stage.nameAr : stage.nameEn}
                    </p>
                    <p className="text-[11px] font-mono text-[#64748B] mt-0.5">
                      {stage.assignedManagerEmail}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() =>
                      setDraftConfig({
                        ...draftConfig,
                        stages: draftConfig.stages.map((s) =>
                          s.id === stage.id ? { ...s, active: !s.active } : s
                        ),
                      })
                    }
                    className={`font-semibold ${
                      stage.active ? 'text-[#15803D]' : 'text-[#64748B]'
                    }`}
                  >
                    {stage.active ? 'Enabled' : 'Hidden'}
                  </button>
                </div>
              ))}
            </div>

            {isAdmin && (
              <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  placeholder="Stage EN"
                  value={newStageEn}
                  onChange={(e) => setNewStageEn(e.target.value)}
                  className="min-h-[40px] px-3 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
                <input
                  type="text"
                  placeholder="المرحلة بالعربية"
                  value={newStageAr}
                  onChange={(e) => setNewStageAr(e.target.value)}
                  className="min-h-[40px] px-3 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleAddStage}
                  className="min-h-[40px] px-3 rounded-lg bg-[#0F1E3D] text-white text-xs font-semibold"
                >
                  {lang === 'ar' ? 'إضافة مرحلة' : 'Add Stage'}
                </button>
              </div>
            )}
          </div>

          {/* Chandelier Models & RPN Matrix */}
          <div className="lg:col-span-6 space-y-6">
            <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-bold text-[#0F1E3D]">
                {lang === 'ar' ? 'موديلات النجف والكريستال المعتمدة' : 'Chandelier Model Catalog'}
              </h2>
              <div className="divide-y divide-[#F1F5F9] max-h-64 overflow-y-auto">
                {draftConfig.models.map((m) => (
                  <div key={m.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <span className="font-mono font-bold text-[#0F1E3D]">{m.code}</span>
                      <span className="text-[#475569] ms-2">
                        {lang === 'ar' ? m.nameAr : m.nameEn}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={!isAdmin}
                      onClick={() =>
                        setDraftConfig({
                          ...draftConfig,
                          models: draftConfig.models.map((item) =>
                            item.id === m.id ? { ...item, active: !item.active } : item
                          ),
                        })
                      }
                      className={`font-semibold ${m.active ? 'text-[#15803D]' : 'text-[#64748B]'}`}
                    >
                      {m.active ? 'Active' : 'Archived'}
                    </button>
                  </div>
                ))}
              </div>
              {isAdmin && (
                <div className="pt-3 border-t border-[#E2E8F0] grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="Code (e.g. CH-4090)"
                    value={newModelCode}
                    onChange={(e) => setNewModelCode(e.target.value)}
                    className="min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Model Name"
                    value={newModelNameEn}
                    onChange={(e) => setNewModelNameEn(e.target.value)}
                    className="min-h-[40px] px-3 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleAddModel}
                    className="min-h-[40px] px-3 rounded-lg bg-[#0F1E3D] text-white text-xs font-semibold"
                  >
                    {lang === 'ar' ? 'إضافة موديل' : 'Add Model'}
                  </button>
                </div>
              )}
            </div>

            <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-bold text-[#0F1E3D]">
                {lang === 'ar' ? 'عتبات مصفوفة المخاطر (RPN)' : 'RPN Escalation Thresholds'}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                    Low Max
                  </label>
                  <input
                    type="number"
                    disabled={!isAdmin}
                    value={draftConfig.rpnThresholds.lowMax}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        rpnThresholds: {
                          ...draftConfig.rpnThresholds,
                          lowMax: Number(e.target.value) || 59,
                        },
                      })
                    }
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono tabular-nums bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                    Elevated Max
                  </label>
                  <input
                    type="number"
                    disabled={!isAdmin}
                    value={draftConfig.rpnThresholds.mediumMax}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        rpnThresholds: {
                          ...draftConfig.rpnThresholds,
                          mediumMax: Number(e.target.value) || 119,
                        },
                      })
                    }
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono tabular-nums bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#475569] mb-1">
                    Critical Cutoff
                  </label>
                  <input
                    type="number"
                    disabled={!isAdmin}
                    value={draftConfig.rpnThresholds.criticalEscalationThreshold}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        rpnThresholds: {
                          ...draftConfig.rpnThresholds,
                          criticalEscalationThreshold: Number(e.target.value) || 120,
                        },
                      })
                    }
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono tabular-nums bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
              <h2 className="text-sm font-bold text-[#0F1E3D]">
                {lang === 'ar'
                  ? 'قواعد النموذج الميداني الديناميكي (Dynamic Form Builder)'
                  : 'Dynamic Mobile Form Rules (No-Code Controls)'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <label className="inline-flex items-center gap-2 font-medium text-[#0F1E3D] cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={Boolean(draftConfig.formRules?.requirePhotoOnSubmit)}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        formRules: {
                          ...draftConfig.formRules,
                          requirePhotoOnSubmit: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-[#0F1E3D]"
                  />
                  <span>{lang === 'ar' ? 'إلزام إرفاق صورة فحص' : 'Require Inspection Photo'}</span>
                </label>

                <label className="inline-flex items-center gap-2 font-medium text-[#0F1E3D] cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={Boolean(draftConfig.formRules?.requireValidUntilDate)}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        formRules: {
                          ...draftConfig.formRules,
                          requireValidUntilDate: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-[#0F1E3D]"
                  />
                  <span>{lang === 'ar' ? 'إلزام تاريخ (صالح حتى)' : 'Require Valid Until Date'}</span>
                </label>

                <label className="inline-flex items-center gap-2 font-medium text-[#0F1E3D] cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={draftConfig.formRules?.enableBarcodeScanner !== false}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        formRules: {
                          ...draftConfig.formRules,
                          enableBarcodeScanner: e.target.checked,
                        },
                      })
                    }
                    className="w-4 h-4 accent-[#0F1E3D]"
                  />
                  <span>{lang === 'ar' ? 'تفعيل زر باركود الموديل' : 'Enable Barcode / QR Picker'}</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'routing' && (
        <div className="space-y-6">
          <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              {lang === 'ar'
                ? 'توجيه بطاقات موافقة Outlook حسب المرحلة الإنتاجية'
                : 'Per-Stage Outlook / Teams Approver Assignment'}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                    <th className="py-2.5 px-3 text-start">Stage</th>
                    <th className="py-2.5 px-3 text-start">Assigned Quality Manager</th>
                    <th className="py-2.5 px-3 text-start">Outlook Target Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {draftConfig.stages.map((stg) => (
                    <tr key={stg.id}>
                      <td className="py-2.5 px-3 font-semibold text-[#0F1E3D] whitespace-nowrap">
                        {stg.code} · {lang === 'ar' ? stg.nameAr : stg.nameEn}
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          disabled={!isAdmin}
                          value={stg.assignedManagerName}
                          onChange={(e) =>
                            setDraftConfig({
                              ...draftConfig,
                              stages: draftConfig.stages.map((item) =>
                                item.id === stg.id
                                  ? { ...item, assignedManagerName: e.target.value }
                                  : item
                              ),
                            })
                          }
                          className="w-full min-h-[36px] px-2.5 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-md"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="email"
                          disabled={!isAdmin}
                          value={stg.assignedManagerEmail}
                          onChange={(e) =>
                            setDraftConfig({
                              ...draftConfig,
                              stages: draftConfig.stages.map((item) =>
                                item.id === stg.id
                                  ? { ...item, assignedManagerEmail: e.target.value }
                                  : item
                              ),
                            })
                          }
                          className="w-full min-h-[36px] px-2.5 text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-md"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-5 max-w-3xl">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              {lang === 'ar'
                ? 'قوالب البريد الإلكتروني وقواعد تصعيد Power Automate'
                : 'Outlook Email Templates & Notification Rules'}
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Approval Request Subject Template
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draftConfig.emailTemplates.approvalSubjectTemplate}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      emailTemplates: {
                        ...draftConfig.emailTemplates,
                        approvalSubjectTemplate: e.target.value,
                      },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#334155] mb-1">
                  Requester Feedback Subject Template
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={draftConfig.emailTemplates.feedbackSubjectTemplate}
                  onChange={(e) =>
                    setDraftConfig({
                      ...draftConfig,
                      emailTemplates: {
                        ...draftConfig.emailTemplates,
                        feedbackSubjectTemplate: e.target.value,
                      },
                    })
                  }
                  className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Auto-CC Quality Director Above RPN
                  </label>
                  <input
                    type="number"
                    disabled={!isAdmin}
                    value={draftConfig.emailTemplates.ccQualityDirectorAboveRpn}
                    onChange={(e) =>
                      setDraftConfig({
                        ...draftConfig,
                        emailTemplates: {
                          ...draftConfig.emailTemplates,
                          ccQualityDirectorAboveRpn: Number(e.target.value) || 120,
                        },
                      })
                    }
                    className="w-full min-h-[40px] px-3 text-base sm:text-xs font-mono tabular-nums bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg"
                  />
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2.5 text-xs font-semibold text-[#0F1E3D] cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!isAdmin}
                      checked={draftConfig.emailTemplates.requireCommentOnReject}
                      onChange={(e) =>
                        setDraftConfig({
                          ...draftConfig,
                          emailTemplates: {
                            ...draftConfig.emailTemplates,
                            requireCommentOnReject: e.target.checked,
                          },
                        })
                      }
                      className="w-4 h-4 accent-[#0F1E3D]"
                    />
                    <span>Require Manager Comment on Rejection</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#E2E8F0]">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              {lang === 'ar'
                ? 'سجل التدقيق الأمني والعمليات'
                : 'Immutable Security & Action Audit Trail'}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-semibold text-[#475569]">
                  <th className="py-3 px-4 text-start">Timestamp</th>
                  <th className="py-3 px-4 text-start">Actor</th>
                  <th className="py-3 px-4 text-start">Action</th>
                  <th className="py-3 px-4 text-start">Target</th>
                  <th className="py-3 px-4 text-start">Details</th>
                  <th className="py-3 px-4 text-start">Plant IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F8FAFC]">
                    <td className="py-3 px-4 font-mono tabular-nums text-[#475569] whitespace-nowrap">
                      {formatShortDate(log.timestamp, lang)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className="font-mono font-semibold text-[#0F1E3D]">
                        {log.actorUsername}
                      </span>
                      <span className="text-[#64748B] ms-1.5">({log.actorRole})</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-[#1F3B73] whitespace-nowrap">
                      {log.action}
                    </td>
                    <td className="py-3 px-4 font-mono text-[#0F1E3D] whitespace-nowrap">
                      {log.target}
                    </td>
                    <td className="py-3 px-4 text-[#334155] max-w-md">{log.details}</td>
                    <td className="py-3 px-4 font-mono text-[#64748B] tabular-nums whitespace-nowrap">
                      {log.ipAddress}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
