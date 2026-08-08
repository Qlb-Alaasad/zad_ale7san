import { type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  if (!open) return null;

  const sizeClass = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }[size];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-forest-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative bg-white rounded-2xl shadow-2xl w-full ${sizeClass} max-h-[90vh] overflow-hidden flex flex-col animate-slide-up`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200">
          <h3 className="text-lg font-bold text-forest-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream-100 transition-colors">
            <X className="w-5 h-5 text-charcoal-600" />
          </button>
        </div>
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
