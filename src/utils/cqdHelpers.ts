import type { DeviationStatus, Language, RpnThresholds } from '../types';

export function getRpnRiskLevel(rpn: number, thresholds: RpnThresholds) {
  if (rpn >= thresholds.criticalEscalationThreshold) {
    return {
      level: 'Critical',
      labelEn: 'Critical Escalation',
      labelAr: 'حرج — تصعيد فوري',
      textClass: 'text-[#B91C1C]',
      bgSubtleClass: 'bg-[#FEF2F2]',
      barClass: 'bg-[#DC2626]',
    };
  }
  if (rpn > thresholds.lowMax) {
    return {
      level: 'Elevated',
      labelEn: 'Elevated Review',
      labelAr: 'متوسط — مراجعة إشرافية',
      textClass: 'text-[#A36D0E]',
      bgSubtleClass: 'bg-[#FCF8EE]',
      barClass: 'bg-[#C8922B]',
    };
  }
  return {
    level: 'Low',
    labelEn: 'Standard Tolerance',
    labelAr: 'منخفض — ضمن المعايير',
    textClass: 'text-[#0F5132]',
    bgSubtleClass: 'bg-[#F0FDF4]',
    barClass: 'bg-[#16A34A]',
  };
}

export function getStatusVisual(status: DeviationStatus) {
  switch (status) {
    case 'Approved':
      return {
        textClass: 'text-[#15803D]',
        indicatorClass: 'bg-[#16A34A]',
      };
    case 'Rejected':
      return {
        textClass: 'text-[#B91C1C]',
        indicatorClass: 'bg-[#DC2626]',
      };
    case 'Pending':
    default:
      return {
        textClass: 'text-[#A36D0E]',
        indicatorClass: 'bg-[#C8922B]',
      };
  }
}

export function formatShortDate(iso: string, lang: Language): string {
  const date = new Date(iso);
  return date.toLocaleString(lang === 'ar' ? 'ar-EG' : 'en-GB', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function compressInspectionImage(file: File): Promise<{
  dataUrl: string;
  meta: string;
}> {
  const originalKb = Math.max(1, Math.round(file.size / 1024));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image format.'));
      img.onload = () => {
        const maxWidth = 1024;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const targetWidth = Math.round(img.width * scale);
        const targetHeight = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable.'));
          return;
        }
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        const compressedKb = Math.max(1, Math.round((dataUrl.length * 0.75) / 1024));
        resolve({
          dataUrl,
          meta: `Compressed ${targetWidth}×${targetHeight} · ${compressedKb} KB (from ${originalKb} KB)`,
        });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
