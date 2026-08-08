import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Notification } from '@/lib/types';
import { formatDistanceToArabic } from '@/lib/date';

export function NotificationBell() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifications = async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) {
      setNotifications(data as Notification[]);
      setUnreadCount(data.filter((n) => !n.is_read).length);
    }
  };

  useEffect(() => {
    loadNotifications();
    if (!session?.user) return;
    const channel = supabase
      .channel('notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${session.user.id}` }, () => {
        loadNotifications();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user]);

  const markAllRead = async () => {
    if (!session?.user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', session.user.id).eq('is_read', false);
    loadNotifications();
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    loadNotifications();
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-cream-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-forest-800" />
        {unreadCount > 0 && (
          <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-cream-200 z-40 overflow-hidden animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200">
              <h3 className="font-bold text-forest-900">الإشعارات</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-forest-600 hover:underline flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" />
                  تعليم الكل كمقروء
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-center text-charcoal-400 text-sm py-8">لا توجد إشعارات</p>
              ) : (
                notifications.map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-cream-100 hover:bg-cream-50 transition-colors ${!n.is_read ? 'bg-gold-50/50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="font-medium text-sm text-forest-900">{n.title}</p>
                        <p className="text-xs text-charcoal-500 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-charcoal-400 mt-1">{formatDistanceToArabic(n.created_at)}</p>
                      </div>
                      <button onClick={() => deleteNotification(n.id)} className="p-1 rounded hover:bg-red-50 text-charcoal-400 hover:text-red-500">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
