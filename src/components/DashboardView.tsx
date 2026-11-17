import { useMemo, useState } from 'react';
import {
  Download,
  Search,
  ArrowUpDown,
  X,
  MailCheck,
  Plus,
} from 'lucide-react';
import type {
  DeviationRecord,
  DeviationStatus,
  Language,
  SystemConfig,
  WorkspaceTab,
} from '../types';
import { getText } from '../i18n';
import { formatShortDate, getRpnRiskLevel, getStatusVisual } from '../utils/cqdHelpers';
import { InspectionImage } from './InspectionImage';

interface DashboardViewProps {
  lang: Language;
  deviations: DeviationRecord[];
  config: SystemConfig;
  initialSelectedId?: string;
  onNavigate: (tab: WorkspaceTab, deviationId?: string) => void;
}

type StatusFilter = 'All' | DeviationStatus;
type SortKey = 'newest' | 'rpn-desc' | 'qty-desc';

export function DashboardView({
  lang,
  deviations,
  config,
  initialSelectedId,
  onNavigate,
}: DashboardViewProps) {
  const t = getText(lang);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [stageFilter, setStageFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<SortKey>('newest');
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId || deviations[0]?.id || null
  );
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const stats = useMemo(() => {
    const total = deviations.length;
    const pending = deviations.filter((d) => d.status === 'Pending').length;
    const critical = deviations.filter(
      (d) => d.rpn >= config.rpnThresholds.criticalEscalationThreshold
    ).length;
    const decided = deviations.filter((d) => d.status !== 'Pending');
    const approved = deviations.filter((d) => d.status === 'Approved').length;
    const approvalRate = decided.length > 0 ? Math.round((approved / decided.length) * 100) : 0;
    return { total, pending, critical, approvalRate };
  }, [deviations, config.rpnThresholds.criticalEscalationThreshold]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = deviations.filter((d) => {
      if (statusFilter !== 'All' && d.status !== statusFilter) return false;
      if (stageFilter !== 'All' && d.stageId !== stageFilter) return false;
      if (!q) return true;
      return (
        d.id.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        d.modelCode.toLowerCase().includes(q) ||
        d.requesterName.toLowerCase().includes(q) ||
        d.stageNameEn.toLowerCase().includes(q) ||
        d.stageNameAr.includes(q)
      );
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'rpn-desc') return b.rpn - a.rpn;
      if (sortBy === 'qty-desc') return b.quantity - a.quantity;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [deviations, searchQuery, statusFilter, stageFilter, sortBy]);

  const selectedRecord = useMemo(
    () => deviations.find((d) => d.id === selectedId) ?? filtered[0] ?? null,
    [deviations, filtered, selectedId]
  );

  function handleExportCsv() {
    const headers = [
      'Deviation_ID',
      'Title',
      'Model_Code',
      'Stage',
      'Quantity',
      'Valid_Until',
      'Severity',
      'Occurrence',
      'Detection',
      'RPN',
      'Status',
      'Requester',
      'Approver',
      'Manager_Comment',
      'Created_At',
    ];
    const rows = filtered.map((d) => [
      d.id,
      `"${d.title.replace(/"/g, '""')}"`,
      d.modelCode,
      `"${d.stageNameEn}"`,
      d.quantity,
      d.validUntil || '',
      d.severity,
      d.occurrence,
      d.detection,
      d.rpn,
      d.status,
      `"${d.requesterName}"`,
      `"${d.assignedManagerName}"`,
      `"${(d.managerComment || '').replace(/"/g, '""')}"`,
      d.createdAt,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `crystal-asfour-deviations-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0F1E3D]">{t.dashboard.heading}</h1>
          <p className="text-sm text-[#475569] mt-1">{t.dashboard.subheading}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleExportCsv}
            className="h-10 px-3.5 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-semibold text-[#0F1E3D] inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t.dashboard.exportCsv}</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('field-log')}
            className="h-10 px-4 rounded-lg bg-[#0F1E3D] hover:bg-[#162B54] text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 text-[#DFA941]" />
            <span>{t.primaryCta}</span>
          </button>
        </div>
      </div>

      {/* 4-Column Executive KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-[#DCE4F0] rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-[#E2E8F0]">
        <div className="p-5">
          <p className="text-xs font-medium text-[#64748B]">{t.dashboard.kpiTotal}</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#0F1E3D]">
            {stats.total}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-[#64748B]">{t.dashboard.kpiPending}</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#A36D0E]">
            {stats.pending}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-[#64748B]">{t.dashboard.kpiCritical}</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#B91C1C]">
            {stats.critical}
          </p>
        </div>
        <div className="p-5">
          <p className="text-xs font-medium text-[#64748B]">{t.dashboard.kpiApprovedRate}</p>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-[#15803D]">
            {stats.approvalRate}%
          </p>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white border border-[#DCE4F0] rounded-xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-[#64748B] absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.dashboard.searchPlaceholder}
              className="w-full h-10 ps-9 pe-3 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F1E3D] focus:outline-none focus:border-[#1F3B73] focus:bg-white"
            />
          </div>

          <select
            aria-label={t.dashboard.allStages}
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-10 px-3 text-xs bg-[#F8FAFC] border border-[#CBD5E1] rounded-lg text-[#0F1E3D] font-medium"
          >
            <option value="All">{t.dashboard.allStages}</option>
            {config.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {lang === 'ar' ? s.nameAr : s.nameEn}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Interactive Status Segmented Control */}
          <div className="inline-flex items-center p-1 bg-[#F1F5F9] rounded-lg">
            {(['All', 'Pending', 'Approved', 'Rejected'] as StatusFilter[]).map((st) => {
              const active = statusFilter === st;
              const label =
                st === 'All'
                  ? lang === 'ar'
                    ? 'الكل'
                    : 'All'
                  : t.status[st];
              return (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active ? 'bg-white text-[#0F1E3D]' : 'text-[#475569] hover:text-[#0F1E3D]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() =>
              setSortBy((prev) =>
                prev === 'newest' ? 'rpn-desc' : prev === 'rpn-desc' ? 'qty-desc' : 'newest'
              )
            }
            className="h-9 px-3 rounded-lg border border-[#CBD5E1] bg-white hover:bg-[#F8FAFC] text-xs font-medium text-[#334155] inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <ArrowUpDown className="w-3.5 h-3.5" />
            <span>
              {sortBy === 'newest'
                ? lang === 'ar'
                  ? 'الأحدث'
                  : 'Sort: Newest'
                : sortBy === 'rpn-desc'
                ? lang === 'ar'
                  ? 'الأعلى RPN'
                  : 'Sort: Highest RPN'
                : lang === 'ar'
                ? 'الأعلى كمية'
                : 'Sort: Quantity'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Master Grid + Detail Dossier Split */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div className="xl:col-span-8 bg-white border border-[#DCE4F0] rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <p className="text-sm font-bold text-[#0F1E3D]">{t.dashboard.emptyTitle}</p>
              <p className="text-xs text-[#64748B]">{t.dashboard.emptyDesc}</p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('All');
                  setStageFilter('All');
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0F1E3D] text-white"
              >
                {lang === 'ar' ? 'إعادة ضبط الفلاتر' : 'Reset Filters'}
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-semibold text-[#475569]">
                    <th className="py-3 px-4 text-start whitespace-nowrap">{t.dashboard.columns.id}</th>
                    <th className="py-3 px-4 text-start">{t.dashboard.columns.title}</th>
                    <th className="py-3 px-4 text-start whitespace-nowrap">{t.dashboard.columns.stage}</th>
                    <th className="py-3 px-4 text-end whitespace-nowrap">{t.dashboard.columns.qty}</th>
                    <th className="py-3 px-4 text-end whitespace-nowrap">{t.dashboard.columns.rpn}</th>
                    <th className="py-3 px-4 text-start whitespace-nowrap">{t.dashboard.columns.status}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9] text-xs">
                  {filtered.map((item) => {
                    const isSelected = selectedRecord?.id === item.id;
                    const risk = getRpnRiskLevel(item.rpn, config.rpnThresholds);
                    const statusStyle = getStatusVisual(item.status);
                    return (
                      <tr
                        key={item.id}
                        onClick={() => setSelectedId(item.id)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? 'bg-[#E9EFF7]/70' : 'hover:bg-[#F8FAFC]'
                        }`}
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-[#0F1E3D] tabular-nums whitespace-nowrap">
                          {item.id}
                        </td>
                        <td className="py-3 px-4 max-w-[260px]">
                          <div className="font-semibold text-[#0F1E3D] truncate">{item.title}</div>
                          <div className="text-[11px] text-[#64748B] font-mono mt-0.5 truncate">
                            {item.modelCode} · {formatShortDate(item.createdAt, lang)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-[#334155] whitespace-nowrap">
                          {lang === 'ar' ? item.stageNameAr : item.stageNameEn}
                        </td>
                        <td className="py-3 px-4 text-end font-mono tabular-nums text-[#0F1E3D]">
                          {item.quantity}
                        </td>
                        <td className={`py-3 px-4 text-end font-mono font-bold tabular-nums ${risk.textClass}`}>
                          {item.rpn}
                        </td>
                        <td className={`py-3 px-4 font-semibold whitespace-nowrap ${statusStyle.textClass}`}>
                          {t.status[item.status]}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Detail Dossier */}
        <div className="xl:col-span-4 bg-white border border-[#DCE4F0] rounded-xl p-5">
          {selectedRecord ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] pb-3">
                <div>
                  <p className="font-mono text-xs font-semibold text-[#A36D0E] tabular-nums">
                    {selectedRecord.id}
                  </p>
                  <h2 className="text-base font-bold text-[#0F1E3D] mt-0.5 leading-snug">
                    {selectedRecord.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close detail"
                  className="xl:hidden p-1.5 text-[#64748B] hover:text-[#0F1E3D]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const primary = selectedRecord.images?.[0] || selectedRecord.imageUrl;
                  if (primary) setLightboxUrl(primary);
                }}
                className="block w-full text-start focus:outline-none"
              >
                <InspectionImage
                  src={selectedRecord.images?.[0] || selectedRecord.imageUrl}
                  alt={`Inspection photo for ${selectedRecord.id}`}
                  className="w-full h-44 object-cover rounded-lg border border-[#E2E8F0] hover:opacity-95 transition-opacity"
                  fallbackLabel={
                    lang === 'ar' ? 'لا توجد صورة مرفقة لهذا السجل' : 'No inspection photo attached'
                  }
                />
              </button>

              {selectedRecord.images && selectedRecord.images.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {selectedRecord.images.map((imgSrc, idx) => (
                    <button
                      key={`${selectedRecord.id}-img-${idx}`}
                      type="button"
                      onClick={() => setLightboxUrl(imgSrc)}
                      className="w-12 h-12 rounded-lg overflow-hidden border border-[#CBD5E1] hover:border-[#0066CC] shrink-0 transition-colors"
                    >
                      <InspectionImage
                        src={imgSrc}
                        alt={`Thumbnail ${idx + 1} for ${selectedRecord.id}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              <p className="text-xs text-[#334155] leading-relaxed">{selectedRecord.description}</p>

              <dl className="space-y-2.5 text-xs pt-2 border-t border-[#E2E8F0]">
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">{t.dashboard.columns.model}</dt>
                  <dd className="font-mono font-semibold text-[#0F1E3D]">
                    {selectedRecord.modelCode}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">{t.dashboard.columns.stage}</dt>
                  <dd className="font-medium text-[#0F1E3D] text-end">
                    {lang === 'ar' ? selectedRecord.stageNameAr : selectedRecord.stageNameEn}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">{t.dashboard.columns.qty}</dt>
                  <dd className="font-mono font-semibold tabular-nums text-[#0F1E3D]">
                    {selectedRecord.quantity}
                  </dd>
                </div>
                {selectedRecord.validUntil && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#64748B]">
                      {lang === 'ar' ? 'صالح حتى' : 'Valid Until'}
                    </dt>
                    <dd className="font-mono font-semibold tabular-nums text-[#0F1E3D]">
                      {selectedRecord.validUntil}
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">S × O × D = RPN</dt>
                  <dd className="font-mono font-bold tabular-nums text-[#0F1E3D]">
                    {selectedRecord.severity} × {selectedRecord.occurrence} ×{' '}
                    {selectedRecord.detection} = {selectedRecord.rpn}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">{t.dashboard.requester}</dt>
                  <dd className="text-[#0F1E3D]">{selectedRecord.requesterName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">{t.dashboard.assignedApprover}</dt>
                  <dd className="text-[#0F1E3D]">{selectedRecord.assignedManagerName}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[#64748B]">{t.dashboard.columns.status}</dt>
                  <dd className={`font-bold ${getStatusVisual(selectedRecord.status).textClass}`}>
                    {t.status[selectedRecord.status]}
                  </dd>
                </div>
              </dl>

              {selectedRecord.managerComment && (
                <div className="p-3.5 rounded-lg bg-[#F4F7FB] border border-[#DCE4F0]">
                  <p className="text-[11px] font-semibold text-[#475569]">
                    {t.dashboard.managerNotes} · {selectedRecord.decisionBy}
                  </p>
                  <p className="text-xs text-[#0F1E3D] mt-1 leading-relaxed">
                    {selectedRecord.managerComment}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => onNavigate('outlook-approvals', selectedRecord.id)}
                className="w-full h-10 px-4 rounded-lg bg-[#0F1E3D] hover:bg-[#162B54] text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors"
              >
                <MailCheck className="w-4 h-4 text-[#DFA941]" />
                <span>{t.dashboard.openApprovalBtn}</span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-[#64748B] py-8 text-center">
              {lang === 'ar'
                ? 'اختر استثناءً من الجدول لعرض تفاصيله.'
                : 'Select a deviation row from the table to inspect full details.'}
            </p>
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
              aria-label="Close photo preview"
              className="absolute top-3 end-3 z-10 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxUrl}
              alt="Inspection photo zoom"
              referrerPolicy="no-referrer"
              className="w-full max-h-[80vh] object-contain bg-[#0F172A]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
