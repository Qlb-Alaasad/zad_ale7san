import { Link } from 'react-router-dom';
import { BookOpen, Trophy, Users, Star, QrCode, GraduationCap, ArrowLeft, Sparkles } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-cream-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-cream-50/90 backdrop-blur-sm border-b border-cream-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-forest-900 flex items-center justify-center">
              <span className="text-gold-400 font-bold text-xl">ز</span>
            </div>
            <div>
              <h1 className="font-bold text-forest-900 text-lg">زاد الإحسان</h1>
              <p className="text-charcoal-400 text-xs">أكاديمية الجيل الصاعد</p>
            </div>
          </div>
          <Link to="/login" className="btn btn-primary text-sm">
            تسجيل الدخول
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-forest-900" />
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 right-20 w-96 h-96 rounded-full bg-gold-400 blur-3xl" />
          <div className="absolute bottom-10 left-20 w-72 h-72 rounded-full bg-forest-400 blur-3xl" />
        </div>
        <div className="relative z-10 max-w-6xl mx-auto px-4 py-20 lg:py-28 text-center text-cream-50">
          <div className="inline-flex items-center gap-2 bg-forest-800/60 rounded-full px-4 py-2 mb-6 border border-forest-700">
            <Sparkles className="w-4 h-4 text-gold-400" />
            <span className="text-sm text-cream-200">منصة تعليمية متكاملة للشباب</span>
          </div>
          <h1 className="text-4xl lg:text-6xl font-bold mb-4 leading-tight">
            نُهِنّ بُنُوك الشباب
            <br />
            <span className="text-gold-400">إيمانًا وعلمًا ورياضة</span>
          </h1>
          <p className="text-cream-200 text-lg lg:text-xl max-w-2xl mx-auto mb-8 leading-relaxed">
            أكاديمية متكاملة تجمع بين التعليم القرآني والأخلاقي والأنشطة الرياضية، مع نظام متقدم للحضور والتقييم والمتابعة.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/register" className="btn btn-gold text-base px-8 py-3.5">
              ابدأ التسجيل الآن
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <Link to="/login" className="btn btn-outline text-base px-8 py-3.5 border-cream-300 text-cream-50 hover:bg-forest-800">
              لديّ حساب
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-16 lg:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-forest-900 mb-2">مميزات المنصة</h2>
          <p className="text-charcoal-500">كل ما يحتاجه الطالب والشيخ في مكان واحد</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { icon: <QrCode className="w-7 h-7" />, title: 'حضور ذكي بالرمز الديناميكي', desc: 'رمز QR يتجدد كل دقيقة لضمان دقة الحضور ومنع الغش' },
            { icon: <Star className="w-7 h-7" />, title: 'تقييم بالنجوم الأسبوعي', desc: 'نظام تقييم مرئي بفئات متنوعة يُحدّث أسبوعياً مع أرشيف كامل' },
            { icon: <BookOpen className="w-7 h-7" />, title: 'تتبع الحفظ', desc: 'متابعة تقدم القرآن الكريم والوحدات الحالية' },
            { icon: <Trophy className="w-7 h-7" />, title: 'إدارة المباريات', desc: 'جدولة الحصص والمباريات والفعاليات مع تذكيرات تلقائية' },
            { icon: <Users className="w-7 h-7" />, title: 'إدارة الطلاب', desc: 'موافقة على التسجيل وإدارة الدورات والمتابعة الكاملة' },
            { icon: <GraduationCap className="w-7 h-7" />, title: 'بوابة شخصية', desc: 'كل طالب يرى تقييماته وحضوره ومهامه ورسومه في مكان واحد' },
          ].map((f) => (
            <div key={f.title} className="card hover:shadow-lg transition-shadow group">
              <div className="w-14 h-14 rounded-2xl bg-forest-100 text-forest-700 flex items-center justify-center mb-4 group-hover:bg-gold-100 group-hover:text-gold-700 transition-colors">
                {f.icon}
              </div>
              <h3 className="font-bold text-forest-900 mb-2">{f.title}</h3>
              <p className="text-charcoal-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-forest-900 text-cream-50 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-3">انضم إلى أكاديمية زاد الإحسان</h2>
          <p className="text-cream-200 mb-8">سجّل الآن وانتظر موافقة الشيخ للبدء في رحلتك التعليمية</p>
          <Link to="/register" className="btn btn-gold text-base px-8 py-3.5">
            إنشاء حساب طالب
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-forest-950 text-cream-300 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm">
          <p>أكاديمية زاد الإحسان — تعليم إسلامي ورياضي للشباب</p>
        </div>
      </footer>
    </div>
  );
}
