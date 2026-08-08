import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Mail, Lock, Phone, Calendar, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthLayout } from '@/components/AuthLayout';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 6) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'كلمة المرور يجب أن تحتوي على أحرف وأرقام';
    return null;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (signUpError) {
      console.error('[Register] signUp failed:', {
        message: signUpError.message,
        name: signUpError.name,
        status: (signUpError as any).status,
      });
      setError(signUpError.message === 'User already registered'
        ? 'هذا البريد الإلكتروني مسجل بالفعل'
        : signUpError.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      await supabase
        .from('profiles')
        .update({
          full_name: fullName,
          age: age ? parseInt(age) : null,
          parent_phone: parentPhone,
        })
        .eq('id', data.user.id);
    }
    setLoading(false);
    navigate('/pending');
  };

  return (
    <AuthLayout title="إنشاء حساب جديد" subtitle="سجل كطالب في أكاديمية زاد الإحسان">
      <div className="mb-5 flex items-start gap-2 bg-gold-50 border border-gold-200 rounded-xl p-3 text-sm text-gold-800">
        <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>بعد التسجيل، سيتم مراجعة حسابك من قبل الشيخ قبل التمكن من الدخول.</span>
      </div>
      <form onSubmit={handleRegister} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-xl p-3 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div>
          <label className="label">الاسم الكامل</label>
          <div className="relative">
            <User className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400" />
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input pr-11" placeholder="الاسم الثلاثي" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">العمر</label>
            <div className="relative">
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400" />
              <input type="number" min="5" max="25" value={age} onChange={(e) => setAge(e.target.value)} className="input pr-11" placeholder="12" />
            </div>
          </div>
          <div>
            <label className="label">هاتف ولي الأمر</label>
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400" />
              <input type="tel" value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className="input pr-11" placeholder="01XXXXXXXXX" />
            </div>
          </div>
        </div>
        <div>
          <label className="label">البريد الإلكتروني</label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input pr-11" placeholder="example@gmail.com" />
          </div>
        </div>
        <div>
          <label className="label">كلمة المرور</label>
          <div className="relative">
            <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-charcoal-400" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input pr-11" placeholder="6+ أحرف وأرقام" />
          </div>
        </div>
        <button type="submit" disabled={loading} className="btn btn-primary w-full">
          {loading ? 'جارٍ التسجيل...' : 'تسجيل الحساب'}
        </button>
      </form>
      <p className="text-center text-charcoal-500 text-sm mt-6">
        لديك حساب؟{' '}
        <Link to="/login" className="text-forest-700 font-bold hover:underline">
          تسجيل الدخول
        </Link>
      </p>
    </AuthLayout>
  );
}
