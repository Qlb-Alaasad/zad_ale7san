import { useNavigate } from 'react-router-dom';
import { Clock, LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';

export default function PendingPage() {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-cream-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="w-20 h-20 rounded-full bg-gold-100 flex items-center justify-center mx-auto mb-6 animate-pulse-gold">
          <Clock className="w-10 h-10 text-gold-600" />
        </div>
        <h1 className="text-2xl font-bold text-forest-900 mb-3">حسابك قيد المراجعة</h1>
        <p className="text-charcoal-500 leading-relaxed mb-8">
          تم تسجيل حسابك بنجاح. سيقوم الشيخ بمراجعة طلبك والموافقة عليه قريباً.
          <br />
          ستتمكن من الدخول إلى المنصة فور الموافقة على حسابك.
        </p>
        <button onClick={handleSignOut} className="btn btn-outline">
          <LogOut className="w-4 h-4" />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
