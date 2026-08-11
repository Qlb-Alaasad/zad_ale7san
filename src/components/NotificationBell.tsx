import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Notification } from '@/lib/types';
import { formatDistanceToArabic } from '@/lib/date';

interface NotificationBellProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function NotificationBell({ open: controlledOpen, onOpenChange }: NotificationBellProps) {
  const { session } = useAuth();
  const [internalOpen, setInternalOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const setOpen = (value: boolean) => {
    if (isControlled) {
      onOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  };

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

  useEffect(() => {
    if (open) loadNotifications();
  }, [open]);

  const markAllRead = async () => {
    if (!session?.user) return;
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', session.user.id).eq('is_read', false);
    loadNotifications();
  };

  const deleteNotification = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    loadNotifications();
  };

  const panel = (
    <>
      <div
        className="fixed inset-0 z-[45] bg-forest-950/40 backdrop-blur-[1px] sm:bg-forest-950/10"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <div
        className="
          fixed z-50 inset-x-3 top-[4.25rem] max-h-[calc(100vh-5.5rem)]
          sm:absolute sm:inset-x-auto sm:top-full sm:mt-2 sm:right-0 sm:max-h-80
          w-auto sm:w-80 max-w-[min(20rem,calc(100vw-1.5rem))]
          bg-white rounded-2xl shadow-2xl border border-cream-200 overflow-hidden animate-slide-up
          flex flex-col
        "
        role="dialog"
        aria-label="الإشعارات"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 shrink-0">
          <h3 className="font-bold text-forest-900">الإشعارات</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-forest-600 hover:underline flex items-center gap-1">
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">تعليم الكل كمقروء</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-cream-100 text-charcoal-500 sm:hidden"
              aria-label="إغلاق"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 min-h-0">
          {notifications.length === 0 ? (
            <p className="text-center text-charcoal-400 text-sm py-8">لا توجد إشعارات</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className={`px-4 py-3 border-b border-cream-100 hover:bg-cream-50 transition-colors ${!n.is_read ? 'bg-gold-50/50' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-forest-900">{n.title}</p>
                    <p className="text-xs text-charcoal-500 mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-charcoal-400 mt-1">{formatDistanceToArabic(n.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteNotification(n.id)}
                    className="p-1 rounded hover:bg-red-50 text-charcoal-400 hover:text-red-500 shrink-0"
                    aria-label="حذف"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-xl hover:bg-cream-100 transition-colors"
        aria-expanded={open}
        aria-label="الإشعارات"
      >
        <Bell className="w-5 h-5 text-forest-800" />
        {unreadCount > 0 && (
          <span className="absolute top-1 left-1 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      {open && panel}
    </div>
  );
}
