import { useState } from 'react';
import { ImageOff } from 'lucide-react';

interface InspectionImageProps {
  src?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function InspectionImage({
  src,
  alt,
  className = 'w-full h-48 object-cover',
  fallbackLabel = 'No inspection image attached',
}: InspectionImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 bg-[#E9EFF7] text-[#475569] border border-[#CBD5E1] ${className}`}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="w-5 h-5 text-[#64748B]" />
        <span className="text-xs font-medium px-3 text-center">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
