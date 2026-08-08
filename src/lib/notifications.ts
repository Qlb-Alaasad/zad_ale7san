import { supabase } from './supabase';
import type { NotificationType } from './types';

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: NotificationType = 'general'
): Promise<void> {
  await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
  });
}
