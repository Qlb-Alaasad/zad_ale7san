export function formatDistanceToArabic(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin} دقيقة`;
  if (diffHr < 24) return `قبل ${diffHr} ساعة`;
  if (diffDay < 7) return `قبل ${diffDay} يوم`;
  return date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
}

export function formatDateArabic(dateStr: string | null | undefined): string {
  if (!dateStr) return 'غير محدد';
  return new Date(dateStr).toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatTimeArabic(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('ar-EG', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateTimeArabic(dateStr: string): string {
  return `${formatDateArabic(dateStr)} - ${formatTimeArabic(dateStr)}`;
}
