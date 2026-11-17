import { useEffect, useMemo, useState } from 'react';
import { Check, X, Mail, Send, MessageSquare, ShieldAlert, UserCheck } from 'lucide-react';
import type {
  DeviationRecord,
  EmailMessage,
  Language,
  SystemConfig,
  UserAccount,
} from '../types';
import { getText } from '../i18n';
import { formatShortDate, getRpnRiskLevel, getStatusVisual } from '../utils/cqdHelpers';
import { InspectionImage } from './InspectionImage';

interface OutlookApprovalViewProps {
  lang: Language;
  emails: EmailMessage[];
  deviations: DeviationRecord[];
  config: SystemConfig;
  currentUser: UserAccount;
  initialDeviationId?: string;
  onDecisionCompleted: (updatedDeviation: DeviationRecord, feedbackEmail: EmailMessage) => void;
}

type MailFilter = 'All' | 'ApprovalRequest' | 'QualityEscalation' | 'FinalFeedback' | 'WelcomeAccess';

export function OutlookApprovalView({
  lang,
  emails,
  deviations,
  config,
  currentUser,
  initialDeviationId,
  onDecisionCompleted,
}: OutlookApprovalViewProps) {
  const t = getText(lang);
  const [filter, setFilter] = useState<MailFilter>('All');
  const [selectedEmailId, setSelectedEmailId] = useState<string>(emails[0]?.id || '');
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  useEffect(() => {
    if (initialDeviationId) {
      const match = emails.find((e) => e.deviationId === initialDeviationId);
      if (match) {
        setSelectedEmailId(match.id);
      }
    }
  }, [initialDeviationId, emails]);

  const filteredEmails = useMemo(() => {
    if (filter === 'All') return emails;
    return emails.filter((e) => e.type === filter);
  }, [emails, filter]);

  const activeEmail = useMemo(
    () => emails.find((e) => e.id === selectedEmailId) ?? filteredEmails[0] ?? null,
    [emails, filteredEmails, selectedEmailId]
  );

  const activeDeviation = useMemo(
    () => deviations.find((d) => d.id === activeEmail?.deviationId) ?? null,
    [deviations, activeEmail]
  );

  const canApprove =
    currentUser.role === 'System Admin' ||
    currentUser.role === 'Production Manager' ||
    currentUser.role === 'Quality Director' ||
    currentUser.permissions?.canApproveReject;

  async function handleDecision(decision: 'Approved' | 'Rejected') {
    if (!activeDeviation) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/deviations/${activeDeviation.id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          comment,
          actorUsername: currentUser.username,
        }),
      });
      const data = (await res.json()) as {
        deviation?: DeviationRecord;
        feedbackEmail?: EmailMessage;
        error?: string;
      };
      if (!res.ok || !data.deviation || !data.feedbackEmail) {
        setError(data.error || 'Failed to record Outlook card decision.');
        return;
      }

      onDecisionCompleted(data.deviation, data.feedbackEmail);
      setComment('');
      setSelectedEmailId(data.feedbackEmail.id);
    } catch {
      setError('Network error while executing Power Automate webhook.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1E3D]">{t.outlook.heading}</h1>
          <p className="text-sm text-[#475569] mt-1">{t.outlook.subheading}</p>
        </div>

        <div className="inline-flex flex-wrap items-center p-1 bg-[#E9EFF7] rounded-lg shrink-0 self-start gap-1">
          {(
            [
              { key: 'All', label: t.outlook.filterAll },
              { key: 'ApprovalRequest', label: t.outlook.filterAction },
              {
                key: 'QualityEscalation',
                label: lang === 'ar' ? 'تصعيد الجودة' : 'RPN Escalations',
              },
              { key: 'FinalFeedback', label: t.outlook.filterFeedback },
              {
                key: 'WelcomeAccess',
                label: lang === 'ar' ? 'إيميلات التفعيل' : 'User Access Emails',
              },
            ] as { key: MailFilter; label: string }[]
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filter === item.key
                  ? 'bg-white text-[#0F1E3D]'
                  : 'text-[#475569] hover:text-[#0F1E3D]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane: Inbox Queue */}
        <div className="lg:col-span-5 bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#F8FAFC] flex items-center justify-between">
            <span className="text-xs font-bold text-[#0F1E3D]">{t.outlook.inboxTitle}</span>
            <span className="font-mono text-xs text-[#64748B] tabular-nums">
              {filteredEmails.length}
            </span>
          </div>

          <div className="divide-y divide-[#F1F5F9] max-h-[680px] overflow-y-auto">
            {filteredEmails.map((eml) => {
              const selected = activeEmail?.id === eml.id;
              const linkedDev = deviations.find((d) => d.id === eml.deviationId);
              const statusStyle = linkedDev ? getStatusVisual(linkedDev.status) : null;
              return (
                <button
                  key={eml.id}
                  type="button"
                  onClick={() => {
                    setSelectedEmailId(eml.id);
                    setError(null);
                  }}
                  className={`w-full text-start p-4 transition-colors ${
                    selected ? 'bg-[#E9EFF7]/75' : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#64748B]">
                    <span className="font-mono font-semibold text-[#1F3B73]">
                      {eml.channel} · {eml.deviationId}
                    </span>
                    <span className="tabular-nums">{formatShortDate(eml.sentAt, lang)}</span>
                  </div>
                  <p className="text-xs font-bold text-[#0F1E3D] mt-1.5 line-clamp-2">
                    {eml.subject}
                  </p>
                  <div className="flex items-center justify-between gap-2 mt-2 text-[11px]">
                    <span className="text-[#475569] truncate">
                      {lang === 'ar' ? 'إلى:' : 'To:'} {eml.recipientName} ({eml.recipientEmail})
                    </span>
                    {linkedDev && statusStyle ? (
                      <span className={`font-semibold shrink-0 ${statusStyle.textClass}`}>
                        {t.status[linkedDev.status]}
                      </span>
                    ) : (
                      <span className="font-semibold text-[#1F3B73] shrink-0">
                        {eml.type === 'WelcomeAccess'
                          ? lang === 'ar'
                            ? 'تفعيل'
                            : 'Access'
                          : 'Alert'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Rich HTML Outlook Card / Notification */}
        <div className="lg:col-span-7 bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
          {activeEmail ? (
            <div>
              <div className="px-5 sm:px-6 py-4 bg-[#F8FAFC] border-b border-[#E2E8F0] space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold text-[#1F3B73]">
                    {activeEmail.type === 'QualityEscalation' ? (
                      <ShieldAlert className="w-4 h-4 text-[#B91C1C]" />
                    ) : activeEmail.type === 'WelcomeAccess' ? (
                      <UserCheck className="w-4 h-4 text-[#15803D]" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                    <span>
                      {activeEmail.type === 'ApprovalRequest'
                        ? t.outlook.cardHeader
                        : activeEmail.type === 'QualityEscalation'
                        ? lang === 'ar'
                          ? 'إشعار تصعيد عاجل للجهة المختصة بالجودة'
                          : 'Critical RPN Quality Escalation Alert'
                        : activeEmail.type === 'WelcomeAccess'
                        ? lang === 'ar'
                          ? 'بريد الترحيب ومنح صلاحيات النظام تلقائياً'
                          : 'Automated System Access & Onboarding Email'
                        : t.outlook.feedbackTitle}
                    </span>
                  </span>
                  <span className="text-xs font-mono text-[#64748B] tabular-nums">
                    {formatShortDate(activeEmail.sentAt, lang)}
                  </span>
                </div>
                <p className="text-sm font-bold text-[#0F1E3D]">{activeEmail.subject}</p>
                <p className="text-xs text-[#475569]">
                  {lang === 'ar' ? 'المستلم:' : 'Recipient:'}{' '}
                  <span className="font-mono text-[#0F1E3D]">{activeEmail.recipientEmail}</span>
                  {activeEmail.deliveryMethod && (
                    <span className="text-[#64748B]"> · {activeEmail.deliveryMethod}</span>
                  )}
                </p>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                {activeDeviation ? (
                  <div className="rounded-xl border border-[#DCE4F0] overflow-hidden">
                    <div className="bg-[#0F1E3D] px-5 py-4 flex items-center justify-between gap-4 border-b-2 border-[#C8922B]">
                      <div>
                        <p className="text-[11px] font-medium text-[#E0AC46]">
                          Crystal Asfour International · CQD Power Automate
                        </p>
                        <p className="text-base font-bold text-white mt-0.5 font-mono tabular-nums">
                          {activeDeviation.id}
                        </p>
                      </div>
                      <div className="text-end">
                        <p className="text-[11px] text-slate-300">RPN Score</p>
                        <p className="text-xl font-bold font-mono text-[#E0AC46] tabular-nums">
                          {activeDeviation.rpn}
                        </p>
                      </div>
                    </div>

                    <div className="p-5 bg-white space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
                        <div className="md:col-span-7 space-y-3">
                          <h3 className="text-base font-bold text-[#0F1E3D]">
                            {activeDeviation.title}
                          </h3>
                          <p className="text-xs text-[#334155] leading-relaxed">
                            {activeDeviation.description}
                          </p>

                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 pt-2 text-xs border-t border-[#F1F5F9]">
                            <div>
                              <dt className="text-[#64748B]">
                                {lang === 'ar' ? 'رقم الموديل' : 'Model'}
                              </dt>
                              <dd className="font-mono font-semibold text-[#0F1E3D] mt-0.5">
                                {activeDeviation.modelCode}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[#64748B]">
                                {lang === 'ar' ? 'الكمية' : 'Quantity'}
                              </dt>
                              <dd className="font-mono font-semibold text-[#0F1E3D] tabular-nums mt-0.5">
                                {activeDeviation.quantity} pcs
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[#64748B]">
                                {lang === 'ar' ? 'المرحلة' : 'Stage'}
                              </dt>
                              <dd className="font-medium text-[#0F1E3D] mt-0.5">
                                {lang === 'ar'
                                  ? activeDeviation.stageNameAr
                                  : activeDeviation.stageNameEn}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-[#64748B]">
                                {lang === 'ar' ? 'تقييم المخاطر' : 'Risk Tier'}
                              </dt>
                              <dd
                                className={`font-semibold mt-0.5 ${
                                  getRpnRiskLevel(activeDeviation.rpn, config.rpnThresholds).textClass
                                }`}
                              >
                                {lang === 'ar'
                                  ? getRpnRiskLevel(activeDeviation.rpn, config.rpnThresholds).labelAr
                                  : getRpnRiskLevel(activeDeviation.rpn, config.rpnThresholds).labelEn}
                              </dd>
                            </div>
                            {activeDeviation.validUntil && (
                              <div>
                                <dt className="text-[#64748B]">
                                  {lang === 'ar' ? 'صالح حتى' : 'Valid Until'}
                                </dt>
                                <dd className="font-mono font-semibold text-[#0F1E3D] tabular-nums mt-0.5">
                                  {activeDeviation.validUntil}
                                </dd>
                              </div>
                            )}
                          </dl>
                        </div>

                        <div className="md:col-span-5 space-y-2">
                          <button
                            type="button"
                            onClick={() => {
                              const primary =
                                activeDeviation.images?.[0] || activeDeviation.imageUrl;
                              if (primary) setLightboxUrl(primary);
                            }}
                            className="block w-full text-start focus:outline-none"
                          >
                            <InspectionImage
                              src={activeDeviation.images?.[0] || activeDeviation.imageUrl}
                              alt={`Evidence for ${activeDeviation.id}`}
                              className="w-full h-44 object-cover rounded-lg border border-[#E2E8F0] hover:opacity-95 transition-opacity"
                              fallbackLabel={
                                lang === 'ar' ? 'لا توجد صورة مرفقة' : 'No attached photo'
                              }
                            />
                          </button>

                          {activeDeviation.images && activeDeviation.images.length > 1 && (
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                              {activeDeviation.images.map((imgSrc, idx) => (
                                <button
                                  key={`${activeDeviation.id}-thumb-${idx}`}
                                  type="button"
                                  onClick={() => setLightboxUrl(imgSrc)}
                                  className="w-11 h-11 rounded-md overflow-hidden border border-[#CBD5E1] hover:border-[#0066CC] shrink-0"
                                >
                                  <InspectionImage
                                    src={imgSrc}
                                    alt={`Evidence thumbnail ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {activeEmail.type === 'ApprovalRequest' &&
                      activeDeviation.status === 'Pending' ? (
                        <div className="pt-4 border-t border-[#E2E8F0] space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor="outlook-comment"
                              className="text-xs font-semibold text-[#0F1E3D] inline-flex items-center gap-1.5"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-[#1F3B73]" />
                              <span>{t.outlook.commentLabel}</span>
                            </label>
                            <button
                              type="button"
                              onClick={() => setComment('موافق، بشرط فحص 100% قبل التعليق')}
                              className="text-[11px] font-medium text-[#1F3B73] hover:underline"
                            >
                              {lang === 'ar'
                                ? 'إدراج ملاحظة قياسية'
                                : 'Prefill sample Arabic condition'}
                            </button>
                          </div>

                          <textarea
                            id="outlook-comment"
                            rows={2}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder={t.outlook.commentPlaceholder}
                            className="w-full p-3 text-base sm:text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F1E3D] focus:outline-none focus:border-[#1F3B73] focus:bg-white"
                          />

                          {error && (
                            <div className="p-2.5 rounded-lg bg-[#FEF2F2] border border-[#FECACA] text-xs text-[#B91C1C]">
                              {error}
                            </div>
                          )}

                          {canApprove ? (
                            <div className="flex flex-wrap items-center gap-3">
                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleDecision('Approved')}
                                className="min-h-[44px] px-5 py-2 rounded-lg bg-[#15803D] hover:bg-[#166534] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
                              >
                                <Check className="w-4 h-4" />
                                <span>{t.outlook.approveBtn}</span>
                              </button>

                              <button
                                type="button"
                                disabled={submitting}
                                onClick={() => handleDecision('Rejected')}
                                className="min-h-[44px] px-5 py-2 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors disabled:opacity-60"
                              >
                                <X className="w-4 h-4" />
                                <span>{t.outlook.rejectBtn}</span>
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-[#A36D0E] font-medium">
                              {lang === 'ar'
                                ? 'حسابك لا يملك صلاحية الاعتماد أو الرفض (Approve/Reject).'
                                : 'Your current account role does not have Approve/Reject permissions.'}
                            </p>
                          )}
                        </div>
                      ) : activeDeviation.status !== 'Pending' ? (
                        <div className="pt-4 border-t border-[#E2E8F0] space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-[#0F1E3D] inline-flex items-center gap-1.5">
                              <Send className="w-3.5 h-3.5 text-[#1F3B73]" />
                              <span>{t.outlook.decisionLocked}</span>
                            </span>
                            <span
                              className={`text-xs font-bold ${
                                getStatusVisual(activeDeviation.status).textClass
                              }`}
                            >
                              {t.status[activeDeviation.status]}
                            </span>
                          </div>
                          <div className="p-3.5 rounded-lg bg-[#F4F7FB] border border-[#DCE4F0] text-xs space-y-1">
                            <p className="text-[#475569]">
                              {activeDeviation.decisionBy || activeEmail.recipientName}
                              {activeDeviation.decisionAt
                                ? ` · ${formatShortDate(activeDeviation.decisionAt, lang)}`
                                : ''}
                            </p>
                            <p className="font-medium text-[#0F1E3D]">
                              {activeDeviation.managerComment || activeEmail.managerComment}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="pt-4 border-t border-[#E2E8F0] text-xs text-[#475569]">
                          {activeEmail.bodyPreview}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-[#DCE4F0] overflow-hidden">
                    <div className="bg-[#0F1E3D] px-5 py-4 border-b-2 border-[#C8922B]">
                      <p className="text-[11px] font-medium text-[#E0AC46]">
                        Crystal Asfour International · Automated Notification
                      </p>
                      <p className="text-base font-bold text-white mt-0.5">
                        {activeEmail.recipientName}
                      </p>
                    </div>
                    <div className="p-5 bg-white space-y-3 text-xs text-[#334155] leading-relaxed">
                      <p>{activeEmail.bodyPreview || activeEmail.subject}</p>
                      <p className="font-mono text-[11px] text-[#64748B]">
                        Recipient: {activeEmail.recipientEmail}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="p-12 text-center text-xs text-[#64748B]">
              {lang === 'ar'
                ? 'اختر رسالة لعرض بطاقة الموافقة.'
                : 'Select a Power Automate notification from the queue.'}
            </div>
          )}
        </div>
      </div>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              aria-label="Close evidence preview"
              className="absolute top-3 end-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxUrl}
              alt="Inspection evidence zoom"
              referrerPolicy="no-referrer"
              className="w-full max-h-[80vh] object-contain bg-[#0F172A]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
