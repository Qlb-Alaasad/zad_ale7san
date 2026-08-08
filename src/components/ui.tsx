import { type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Loading({ label = 'جارٍ التحميل...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <Loader2 className="w-8 h-8 text-forest-600 animate-spin" />
      <p className="text-charcoal-500 text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-full bg-cream-100 flex items-center justify-center mb-4 text-forest-400">
        {icon}
      </div>
      <p className="text-charcoal-700 font-medium">{title}</p>
      {subtitle && <p className="text-charcoal-400 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

export function Badge({ children, color = 'forest' }: { children: ReactNode; color?: 'forest' | 'gold' | 'red' | 'green' | 'gray' }) {
  const colors = {
    forest: 'bg-forest-100 text-forest-800',
    gold: 'bg-gold-100 text-gold-700',
    red: 'bg-red-100 text-red-700',
    green: 'bg-green-100 text-green-700',
    gray: 'bg-cream-200 text-charcoal-600',
  };
  return <span className={`badge ${colors[color]}`}>{children}</span>;
}
