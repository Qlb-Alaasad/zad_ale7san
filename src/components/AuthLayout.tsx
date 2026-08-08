import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Trophy } from 'lucide-react';

export function AuthLayout({ children, title, subtitle }: { children: ReactNode; title: string; subtitle: string }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left: Brand panel */}
      <div className="lg:w-1/2 bg-forest-900 text-cream-50 p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-64 h-64 rounded-full bg-gold-400 blur-3xl" />
          <div className="absolute bottom-10 left-10 w-48 h-48 rounded-full bg-forest-400 blur-3xl" />
        </div>
        <div className="relative z-10">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gold-400 flex items-center justify-center">
              <span className="text-forest-900 font-bold text-xl">ز</span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-cream-50">زاد الإحسان</h1>
              <p className="text-cream-300 text-sm">أكاديمية الجيل الصاعد</p>
            </div>
          </Link>
        </div>
        <div className="relative z-10 my-12">
          <h2 className="text-3xl lg:text-4xl font-bold leading-tight mb-4">
            نُهِنّ بُنُوك الشباب <span className="text-gold-400">إيمانًا وعلمًا ورياضة</span>
          </h2>
          <p className="text-cream-200 text-lg leading-relaxed">
            منصة تعليمية متكاملة لمتابعة الحضور والتقييم الأسبوعي والمهام والأنشطة الرياضية في الأكاديمية.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-4">
          <div className="bg-forest-800/60 rounded-xl p-4 border border-forest-700">
            <BookOpen className="w-6 h-6 text-gold-400 mb-2" />
            <p className="text-cream-100 font-medium text-sm">تعليم قرآني وأخلاقي</p>
          </div>
          <div className="bg-forest-800/60 rounded-xl p-4 border border-forest-700">
            <Trophy className="w-6 h-6 text-gold-400 mb-2" />
            <p className="text-cream-100 font-medium text-sm">أنشطة رياضية متنوعة</p>
          </div>
        </div>
      </div>

      {/* Right: Form panel */}
      <div className="lg:w-1/2 bg-cream-50 flex items-center justify-center p-8 lg:p-12">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold text-forest-900 mb-1">{title}</h2>
          <p className="text-charcoal-500 mb-8">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function useAuthFormState() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return { loading, setLoading, error, setError };
}
