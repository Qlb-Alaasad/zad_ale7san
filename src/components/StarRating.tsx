import { Star } from 'lucide-react';

interface StarRatingProps {
  fills: number[];
  size?: number;
}

/**
 * Renders 5 stars with exact partial fills using SVG gradients.
 * Each star's fill percentage is precise (no rounding).
 */
export function StarRating({ fills, size = 28 }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1" dir="ltr">
      {fills.map((fill, i) => (
        <PartialStar key={i} fill={fill} size={size} id={`star-${i}-${Math.random().toString(36).slice(2, 8)}`} />
      ))}
    </div>
  );
}

function PartialStar({ fill, size, id }: { fill: number; size: number; id: string }) {
  const pct = Math.round(fill * 100);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="100%" y2="0">
          <stop offset={`${pct}%`} stopColor="#D4AF37" />
          <stop offset={`${pct}%`} stopColor="#E0D5C8" />
        </linearGradient>
      </defs>
      <path
        d="M12 2L14.95 8.63L22 9.62L17 14.56L18.18 21.62L12 18.05L5.82 21.62L7 14.56L2 9.62L9.05 8.63L12 2Z"
        fill={`url(#grad-${id})`}
        stroke="#C59B27"
        strokeWidth="0.5"
      />
    </svg>
  );
}

/**
 * Compact version for inline display.
 */
export function StarRatingInline({ fills }: { fills: number[] }) {
  return <StarRating fills={fills} size={18} />;
}
