import { useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Plus,
  X,
  Check,
  Loader2,
  ScanBarcode,
  ArrowRight,
  Gem,
  ZoomIn,
} from 'lucide-react';
import type {
  DeviationRecord,
  Language,
  SystemConfig,
  UserAccount,
  WorkspaceTab,
} from '../types';
import { compressInspectionImage } from '../utils/cqdHelpers';
import { InspectionImage } from './InspectionImage';

interface FieldLoggerViewProps {
  lang: Language;
  config: SystemConfig;
  currentUser: UserAccount;
  onDeviationCreated: (record: DeviationRecord) => void;
  onNavigate: (tab: WorkspaceTab, deviationId?: string) => void;
}

const SAMPLE_PHOTOS = [
  {
    label: 'خدش الفريم',
    url: '/src/assets/images/crystal_chandelier_defect_1794943872423.jpg',
  },
  {
    label: 'منشور كريستال',
    url: '/src/assets/images/crystal_prism_defect_1794943872478.jpg',
  },
  {
    label: 'ضفيرة كهرباء',
    url: '/src/assets/images/crystal_wiring_assembly_1794943874304.jpg',
  },
];

function computeDefaultValidUntil(days: number): string {
  const target = new Date(Date.now() + Math.max(1, days) * 86400_000);
  return target.toISOString().slice(0, 10);
}

export function FieldLoggerView({
  lang,
  config,
  currentUser,
  onDeviationCreated,
  onNavigate,
}: FieldLoggerViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeStages = useMemo(() => config.stages.filter((s) => s.active), [config.stages]);
  const activeModels = useMemo(() => config.models.filter((m) => m.active), [config.models]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [modelCode, setModelCode] = useState(activeModels[0]?.code || 'CH-2041');
  const [showModelLookup, setShowModelLookup] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [stageId, setStageId] = useState(
    activeStages.find((s) => s.nameEn.toLowerCase().includes('paint'))?.id ||
      activeStages[0]?.id ||
      ''
  );
  const [quantity, setQuantity] = useState<number>(40);
  const [validUntil, setValidUntil] = useState<string>(
    computeDefaultValidUntil(config.formRules?.defaultValidDays ?? 14)
  );
  const [severity, setSeverity] = useState<number>(3);
  const [occurrence, setOccurrence] = useState<number>(4);
  const [detection, setDetection] = useState<number>(2);

  const [images, setImages] = useState<string[]>([]);
  const [imageMeta, setImageMeta] = useState<string | undefined>(undefined);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [compressing, setCompressing] = useState(false);

  const [submitState, setSubmitState] = useState<'idle' | 'submitting' | 'success'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [createdRecord, setCreatedRecord] = useState<DeviationRecord | null>(null);

  const rpn = severity * occurrence * detection;
  const isHighRpn = rpn >= 100;

  const selectedStage = activeStages.find((s) => s.id === stageId) ?? activeStages[0];
  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return activeModels;
    return activeModels.filter(
      (m) =>
        m.code.toLowerCase().includes(q) ||
        m.nameEn.toLowerCase().includes(q) ||
        m.nameAr.includes(q)
    );
  }, [activeModels, modelSearch]);

  const triggeredEscalations = useMemo(
    () =>
      (config.escalationRecipients || []).filter(
        (esc) => esc.active && rpn >= esc.minRpnTrigger
      ),
    [config.escalationRecipients, rpn]
  );

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    setCompressing(true);
    try {
      const results = await Promise.all(files.map((file) => compressInspectionImage(file)));
      setImages((prev) => [...prev, ...results.map((r) => r.dataUrl)]);
      setImageMeta(results[results.length - 1]?.meta);
    } catch {
      setError('تعذر ضغط الصورة المرفقة.');
    } finally {
      setCompressing(false);
      e.target.value = '';
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !description.trim()) {
      setError('يرجى إدخال العنوان والوصف التفصيلي للاستثناء.');
      return;
    }

    if (config.formRules?.requirePhotoOnSubmit && images.length === 0) {
      setError('سياسة المصنع تتطلب إرفاق صورة فحص واحدة على الأقل.');
      return;
    }

    if (config.formRules?.requireValidUntilDate && !validUntil) {
      setError('يرجى تحديد تاريخ الصلاحية (صالح حتى).');
      return;
    }

    setSubmitState('submitting');
    try {
      const res = await fetch('/api/deviations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          modelCode,
          stageId,
          quantity,
          validUntil,
          severity,
          occurrence,
          detection,
          images,
          imageUrl: images[0],
          imageMeta,
          requesterUsername: currentUser.username,
        }),
      });
      const data = (await res.json()) as { deviation?: DeviationRecord; error?: string };
      if (!res.ok || !data.deviation) {
        setError(data.error || 'تعذر حفظ الاستثناء.');
        setSubmitState('idle');
        return;
      }

      setSubmitState('success');
      setCreatedRecord(data.deviation);
      onDeviationCreated(data.deviation);

      setTimeout(() => {
        setSubmitState('idle');
        setTitle('');
        setDescription('');
        setImages([]);
        setImageMeta(undefined);
      }, 2400);
    } catch {
      setError('تعذر الاتصال بالخادم أثناء إرسال الاستثناء.');
      setSubmitState('idle');
    }
  }

  return (
    <div className="bg-[#F1F5F9] rounded-2xl p-2 sm:p-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Mobile-First "طلب استثناء جديد" Container (max-w-[420px]) */}
        <div className="lg:col-span-6 flex justify-center">
          <div
            dir="rtl"
            className="w-full max-w-[420px] bg-white rounded-[32px] border border-[#DCE4F0] shadow-[0_20px_50px_-15px_rgba(15,23,42,0.16)] overflow-hidden"
          >
            {/* A. Mobile Header Bar (Royal Blue #0056B3 -> #0066CC) */}
            <div className="relative bg-gradient-to-l from-[#0056B3] to-[#0066CC] px-5 pt-5 pb-7 text-white overflow-hidden">
              <div
                aria-hidden="true"
                className="absolute -end-6 -top-6 w-28 h-28 rotate-45 border border-white/15 rounded-2xl pointer-events-none"
              />
              <div className="relative z-10 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard')}
                  className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/85 hover:text-white transition-colors"
                >
                  <ArrowRight className="w-3.5 h-3.5" />
                  <span>Deviations · قائمة الاستثناءات</span>
                </button>
                <Gem className="w-4 h-4 text-white/80 shrink-0" />
              </div>

              <h1 className="relative z-10 mt-2.5 text-[19px] font-bold tracking-tight text-white">
                طلب استثناء جديد
              </h1>
            </div>

            {/* B. Scrollable White Form Body */}
            <form
              onSubmit={handleSubmit}
              className="relative z-10 -mt-3 bg-white rounded-t-[20px] p-4 space-y-3"
            >
              {/* Row 1 — Title (العنوان) */}
              <div>
                <label
                  htmlFor="cqd-mobile-title"
                  className="block text-[12px] font-semibold text-[#64748B] mb-1 text-start"
                >
                  العنوان
                </label>
                <div className="relative">
                  <input
                    id="cqd-mobile-title"
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="خدش في دهان الفريم"
                    className="w-full min-h-[44px] px-3 pe-9 text-base sm:text-[14px] font-semibold text-[#0F172A] placeholder:font-normal placeholder:text-[#94A3B8] bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC] focus:shadow-[0_0_0_3px_rgba(0,102,204,0.15)] transition-all"
                  />
                  {title && (
                    <button
                      type="button"
                      onClick={() => setTitle('')}
                      aria-label="مسح العنوان"
                      className="absolute inset-y-0 end-2 flex items-center justify-center w-7 text-[#94A3B8] hover:text-[#0F172A]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2 — Description (الوصف) */}
              <div>
                <label
                  htmlFor="cqd-mobile-desc"
                  className="block text-[12px] font-semibold text-[#64748B] mb-1 text-start"
                >
                  الوصف
                </label>
                <textarea
                  id="cqd-mobile-desc"
                  rows={2}
                  required
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="خدش 2 سم في الجهة الخلفية للفريم، مش ظاهر بعد التركيب."
                  className="w-full p-3 text-base sm:text-[14px] font-semibold text-[#0F172A] placeholder:font-normal placeholder:text-[#94A3B8] bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC] focus:shadow-[0_0_0_3px_rgba(0,102,204,0.15)] transition-all resize-none"
                />
              </div>

              {/* Row 3 — 2-Column Grid: رقم الموديل | المرحلة */}
              <div className="grid grid-cols-2 gap-[10px]">
                <div>
                  <label
                    htmlFor="cqd-mobile-model"
                    className="block text-[12px] font-semibold text-[#64748B] mb-1 text-start"
                  >
                    رقم الموديل
                  </label>
                  <div className="relative">
                    <input
                      id="cqd-mobile-model"
                      type="text"
                      dir="ltr"
                      value={modelCode}
                      onChange={(e) => setModelCode(e.target.value.toUpperCase())}
                      onFocus={() => setShowModelLookup(true)}
                      placeholder="CH-2041"
                      className="w-full min-h-[44px] px-3 ps-9 text-base sm:text-[14px] font-semibold text-[#0F172A] text-center bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC] focus:shadow-[0_0_0_3px_rgba(0,102,204,0.15)]"
                    />
                    {config.formRules?.enableBarcodeScanner !== false && (
                      <button
                        type="button"
                        onClick={() => setShowModelLookup((prev) => !prev)}
                        title="بحث أو مسح باركود الموديل"
                        aria-label="بحث أو مسح باركود الموديل"
                        className="absolute inset-y-0 start-1.5 px-1.5 flex items-center text-[#0066CC] hover:text-[#0056B3]"
                      >
                        <ScanBarcode className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="cqd-mobile-stage"
                    className="block text-[12px] font-semibold text-[#64748B] mb-1 text-start"
                  >
                    المرحلة
                  </label>
                  <select
                    id="cqd-mobile-stage"
                    value={stageId}
                    onChange={(e) => setStageId(e.target.value)}
                    className="w-full min-h-[44px] px-2.5 text-base sm:text-[14px] font-semibold text-[#0F172A] bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC] focus:shadow-[0_0_0_3px_rgba(0,102,204,0.15)]"
                  >
                    {activeStages.map((stg) => (
                      <option key={stg.id} value={stg.id}>
                        {stg.nameEn.split(' ')[0]} ({stg.nameAr})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Searchable Model Lookup Drawer when tapped or Barcode clicked */}
              {showModelLookup && (
                <div className="p-2.5 rounded-[10px] bg-[#F8FAFC] border border-[#CBD5E1] space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      type="text"
                      value={modelSearch}
                      onChange={(e) => setModelSearch(e.target.value)}
                      placeholder="ابحث بكود أو اسم الموديل..."
                      className="flex-1 min-h-[36px] px-2.5 text-xs bg-white border border-[#E2E8F0] rounded-md"
                    />
                    <button
                      type="button"
                      onClick={() => setShowModelLookup(false)}
                      className="text-xs font-semibold text-[#64748B] px-1.5"
                    >
                      إغلاق
                    </button>
                  </div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-[#E2E8F0]">
                    {filteredModels.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setModelCode(m.code);
                          setShowModelLookup(false);
                        }}
                        className="w-full text-start py-1.5 px-2 hover:bg-white rounded text-xs flex items-center justify-between gap-2"
                      >
                        <span className="text-[#0F172A] truncate">{m.nameAr}</span>
                        <span dir="ltr" className="font-mono font-bold text-[#0066CC] shrink-0">
                          {m.code}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Row 4 — 2-Column Grid: الكمية | صالح حتى */}
              <div className="grid grid-cols-2 gap-[10px]">
                <div>
                  <label
                    htmlFor="cqd-mobile-qty"
                    className="block text-[12px] font-semibold text-[#64748B] mb-1 text-start"
                  >
                    الكمية
                  </label>
                  <input
                    id="cqd-mobile-qty"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    dir="ltr"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full min-h-[44px] px-3 text-base sm:text-[14px] font-semibold tabular-nums text-[#0F172A] text-center bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC] focus:shadow-[0_0_0_3px_rgba(0,102,204,0.15)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="cqd-mobile-valid"
                    className="block text-[12px] font-semibold text-[#64748B] mb-1 text-start"
                  >
                    صالح حتى
                  </label>
                  <input
                    id="cqd-mobile-valid"
                    type="date"
                    dir="ltr"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="w-full min-h-[44px] px-2.5 text-base sm:text-[13px] font-semibold tabular-nums text-[#0F172A] bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC] focus:shadow-[0_0_0_3px_rgba(0,102,204,0.15)]"
                  />
                </div>
              </div>

              {/* Row 5 — 4-Column Risk Matrix & Auto-RPN Calculator (Right to Left: Severity | Occurrence | Detection | RPN) */}
              <div className="grid grid-cols-[1fr_1fr_1fr_1.2fr] gap-[8px] pt-0.5">
                <div>
                  <label
                    htmlFor="cqd-sev"
                    className="block text-[11px] font-semibold text-[#64748B] mb-1 text-center"
                  >
                    Severity
                  </label>
                  <select
                    id="cqd-sev"
                    dir="ltr"
                    value={severity}
                    onChange={(e) => setSeverity(Number(e.target.value))}
                    className="w-full min-h-[44px] px-1 text-base sm:text-[14px] font-bold tabular-nums text-center text-[#0F172A] bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cqd-occ"
                    className="block text-[11px] font-semibold text-[#64748B] mb-1 text-center"
                  >
                    Occurrence
                  </label>
                  <select
                    id="cqd-occ"
                    dir="ltr"
                    value={occurrence}
                    onChange={(e) => setOccurrence(Number(e.target.value))}
                    className="w-full min-h-[44px] px-1 text-base sm:text-[14px] font-bold tabular-nums text-center text-[#0F172A] bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="cqd-det"
                    className="block text-[11px] font-semibold text-[#64748B] mb-1 text-center"
                  >
                    Detection
                  </label>
                  <select
                    id="cqd-det"
                    dir="ltr"
                    value={detection}
                    onChange={(e) => setDetection(Number(e.target.value))}
                    className="w-full min-h-[44px] px-1 text-base sm:text-[14px] font-bold tabular-nums text-center text-[#0F172A] bg-white border-[1.5px] border-[#E2E8F0] rounded-[10px] focus:outline-none focus:border-[#0066CC]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-[#64748B] mb-1 text-center">
                    RPN
                  </span>
                  <div
                    aria-live="polite"
                    className={`min-h-[44px] rounded-[10px] border-[1.5px] flex items-center justify-center font-extrabold text-[16px] tabular-nums transition-colors ${
                      isHighRpn
                        ? 'bg-[#FEF2F2] border-[#DC2626] text-[#B91C1C]'
                        : 'bg-[#EFF6FF] border-[#0066CC] text-[#0056B3]'
                    }`}
                  >
                    {rpn}
                  </div>
                </div>
              </div>

              {/* Row 6 — Photo Evidence Uploader (الصور) */}
              <div className="pt-0.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[12px] font-semibold text-[#64748B]">الصور</span>
                  <div className="flex items-center gap-2">
                    {SAMPLE_PHOTOS.map((s) => (
                      <button
                        key={s.url}
                        type="button"
                        onClick={() => setImages((prev) => [...prev, s.url])}
                        className="text-[10px] font-semibold text-[#0066CC] hover:underline"
                      >
                        + {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />

                <div className="flex items-center gap-[10px] flex-wrap">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="إضافة صورة فحص"
                    className="w-[56px] h-[56px] rounded-[10px] border-[1.5px] border-dashed border-[#94A3B8] hover:border-[#0066CC] bg-[#F8FAFC] flex items-center justify-center text-[#64748B] hover:text-[#0066CC] transition-colors shrink-0"
                  >
                    {compressing ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                  </button>

                  {images.map((imgSrc, idx) => (
                    <div key={`${idx}-${imgSrc.slice(0, 24)}`} className="relative w-[56px] h-[56px] shrink-0">
                      <button
                        type="button"
                        onClick={() => setLightboxImage(imgSrc)}
                        className="w-full h-full rounded-[10px] overflow-hidden border border-[#E2E8F0] block group relative"
                      >
                        <InspectionImage
                          src={imgSrc}
                          alt={`صورة فحص ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <ZoomIn className="w-3.5 h-3.5 text-white" />
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                        aria-label="حذف الصورة"
                        className="absolute -top-1.5 -start-1.5 w-5 h-5 rounded-full bg-[#0F172A] text-white flex items-center justify-center shadow"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-2.5 rounded-[10px] bg-[#FEF2F2] border border-[#FECACA] text-xs font-medium text-[#B91C1C]">
                  {error}
                </div>
              )}

              {/* Row 7 — Primary Submit CTA Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitState === 'submitting'}
                  className={`w-full h-[48px] rounded-[12px] text-white font-bold text-[15px] inline-flex items-center justify-center gap-2 transition-colors ${
                    submitState === 'success'
                      ? 'bg-[#15803D]'
                      : 'bg-[#0066CC] hover:bg-[#0056B3]'
                  } disabled:opacity-75`}
                >
                  {submitState === 'submitting' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>جاري الإرسال...</span>
                    </>
                  ) : submitState === 'success' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>✓ تم الحفظ</span>
                    </>
                  ) : (
                    <span>حفظ وإرسال</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: Auto-ID Receipt Toast, AD Metadata & Live Routing Context */}
        <div className="lg:col-span-6 space-y-5">
          {createdRecord && (
            <div className="bg-white border-[1.5px] border-[#15803D] rounded-xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-[#15803D]">
                    {lang === 'ar'
                      ? 'تم تسجيل الاستثناء وإرسال إشعار Outlook بنجاح'
                      : 'Deviation Registered & Outlook Card Dispatched'}
                  </p>
                  <p className="font-mono text-xl font-extrabold text-[#0F1E3D] tabular-nums mt-1">
                    {createdRecord.id}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold text-[#0056B3] tabular-nums">
                  RPN {createdRecord.rpn}
                </span>
              </div>
              <p className="text-xs text-[#475569]">
                {lang === 'ar'
                  ? `تم التوجيه إلى ${createdRecord.assignedManagerName} (${createdRecord.assignedManagerEmail})`
                  : `Routed to ${createdRecord.assignedManagerName} (${createdRecord.assignedManagerEmail})`}
                {createdRecord.escalatedToEmails && createdRecord.escalatedToEmails.length > 0
                  ? lang === 'ar'
                    ? ` + تصعيد فوري إلى: ${createdRecord.escalatedToEmails.join('، ')}`
                    : ` + Escalated to: ${createdRecord.escalatedToEmails.join(', ')}`
                  : ''}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate('dashboard', createdRecord.id)}
                  className="min-h-[40px] px-4 rounded-lg bg-[#0F1E3D] text-white text-xs font-semibold"
                >
                  {lang === 'ar' ? 'عرض في القائمة المركزية' : 'Open in Deviations Grid'}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('outlook-approvals', createdRecord.id)}
                  className="min-h-[40px] px-4 rounded-lg border border-[#CBD5E1] bg-white text-[#0F1E3D] text-xs font-semibold"
                >
                  {lang === 'ar' ? 'معاينة بطاقة Outlook' : 'Open Outlook Approval Card'}
                </button>
              </div>
            </div>
          )}

          {/* Hidden Auto-Filled Active Directory Metadata */}
          <div className="bg-white border border-[#DCE4F0] rounded-xl p-6 space-y-4">
            <h2 className="text-sm font-bold text-[#0F1E3D]">
              {lang === 'ar'
                ? 'البيانات التلقائية من Active Directory والتوجيه الذكي'
                : 'Auto-Attached Active Directory Metadata & Routing'}
            </h2>
            <dl className="space-y-3 text-xs border-t border-[#E2E8F0] pt-4">
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">
                  {lang === 'ar' ? 'مقدم الطلب (AD User)' : 'Submitted By (AD)'}
                </dt>
                <dd className="font-semibold text-[#0F1E3D]">
                  {lang === 'ar' ? currentUser.displayNameAr : currentUser.displayName} (
                  {currentUser.username})
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">{lang === 'ar' ? 'الإدارة / القسم' : 'Department'}</dt>
                <dd className="text-[#0F1E3D]">{currentUser.department}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">
                  {lang === 'ar' ? 'مدير المرحلة المستهدف' : 'Stage Approver'}
                </dt>
                <dd className="font-semibold text-[#0056B3]">
                  {selectedStage?.assignedManagerName} ({selectedStage?.assignedManagerEmail})
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">
                  {lang === 'ar' ? 'معادلة RPN الحية' : 'Live RPN Formula'}
                </dt>
                <dd className="font-mono font-bold tabular-nums text-[#0F1E3D]">
                  D({detection}) × O({occurrence}) × S({severity}) = {rpn}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[#64748B]">
                  {lang === 'ar' ? 'تصعيد جهة الجودة المختصة' : 'Quality Escalation List'}
                </dt>
                <dd className="font-semibold text-end text-[#0F1E3D]">
                  {triggeredEscalations.length === 0
                    ? lang === 'ar'
                      ? 'لا يوجد تصعيد (RPN ضمن الحد)'
                      : 'Within normal limit'
                    : triggeredEscalations.map((e) => e.email).join(', ')}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Tap-to-Zoom Lightbox Modal */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full bg-white rounded-2xl overflow-hidden shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setLightboxImage(null)}
              aria-label="إغلاق المعاينة"
              className="absolute top-3 end-3 z-10 w-9 h-9 rounded-full bg-black/70 text-white flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <InspectionImage
              src={lightboxImage}
              alt="تكبير صورة الفحص"
              className="w-full max-h-[75vh] object-contain bg-[#091326]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
