import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, Plus, Trash2, Save, Users, Filter, Edit } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { createNotification } from '@/lib/notifications';
import { formatDateArabic } from '@/lib/date';
import { TASK_STATUS_LABELS, TASK_STATUS_COLORS, isTaskOverdue, normalizeTaskStatus, getAllTasks, insertTasksForStudents } from '@/lib/tasks';
import { verifyStudentProfileId } from '@/lib/student-id';
import { Loading, EmptyState, Badge } from '@/components/ui';
import { Modal } from '@/components/Modal';
import type { Profile, Category, Task, TaskStatus } from '@/lib/types';

export function TasksTab() {
  const [students, setStudents] = useState<Profile[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [studentFilter, setStudentFilter] = useState<string>('all');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [studentId, setStudentId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: profileData }, { data: catData }, taskList] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'student').eq('status', 'approved').order('full_name'),
      supabase.from('categories').select('*').order('name'),
      getAllTasks(),
    ]);
    const studentMap = Object.fromEntries((profileData as Profile[] || []).map((s) => [s.id, s]));
    setStudents(profileData as Profile[] || []);
    setCategories(catData as Category[] || []);
    setTasks(taskList.map((t) => ({ ...t, student: studentMap[t.student_id] })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setCategoryId('');
    setStudentId('');
    setEditing(null);
    setBulkMode(false);
    setSelectedStudentIds([]);
  };

  const openCreate = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (task: Task) => {
    setEditing(task);
    setTitle(task.title);
    setDescription(task.description);
    setDueDate(task.due_date || '');
    setCategoryId(task.category_id || '');
    setStudentId(task.student_id);
    setBulkMode(false);
    setShowForm(true);
  };

  const saveTask = async () => {
    if (!title.trim()) return;

    if (editing) {
      await supabase.from('tasks').update({
        title: title.trim(),
        description: description.trim(),
        due_date: dueDate || null,
        category_id: categoryId || null,
        student_id: studentId,
        updated_at: new Date().toISOString(),
      }).eq('id', editing.id);
    } else {
      const targets = bulkMode ? selectedStudentIds : studentId ? [studentId] : [];
      if (targets.length === 0) return;

      for (const sid of targets) {
        const valid = await verifyStudentProfileId(sid);
        if (!valid) {
          alert(`معرّف الطالب غير صالح: ${sid}. يجب أن يطابق profiles.id (نفس auth.users.id).`);
          return;
        }
      }

      const rows = targets.map((sid) => ({
        student_id: sid,
        category_id: categoryId || null,
        title: title.trim(),
        description: description.trim(),
        due_date: dueDate || null,
        status: 'assigned' as TaskStatus,
        completed: false,
      }));

      const { ok, error } = await insertTasksForStudents(rows);
      if (!ok) {
        alert(`فشل إنشاء المهمة: ${error}`);
        return;
      }
      for (const sid of targets) {
        await createNotification(sid, 'مهمة جديدة', title.trim(), 'general');
      }
    }

    setShowForm(false);
    resetForm();
    load();
  };

  const updateStatus = async (task: Task, status: TaskStatus) => {
    await supabase.from('tasks').update({
      status,
      completed: status === 'completed',
      updated_at: new Date().toISOString(),
    }).eq('id', task.id);
    load();
  };

  const deleteTask = async (id: string) => {
    if (!confirm('حذف هذه المهمة؟')) return;
    await supabase.from('tasks').delete().eq('id', id);
    load();
  };

  const toggleBulkStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (loading) return <Loading />;

  const filtered = tasks.filter((t) => {
    const status = normalizeTaskStatus(t);
    if (statusFilter !== 'all' && status !== statusFilter) return false;
    if (studentFilter !== 'all' && t.student_id !== studentFilter) return false;
    return true;
  });

  const stats = {
    assigned: tasks.filter((t) => normalizeTaskStatus(t) === 'assigned').length,
    in_progress: tasks.filter((t) => normalizeTaskStatus(t) === 'in_progress').length,
    submitted: tasks.filter((t) => normalizeTaskStatus(t) === 'submitted').length,
    completed: tasks.filter((t) => normalizeTaskStatus(t) === 'completed').length,
    overdue: tasks.filter((t) => isTaskOverdue(t)).length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-forest-900">إدارة المهام والواجبات</h3>
          <p className="text-sm text-charcoal-500">إنشاء وتتبع مهام الطلاب وحالات التسليم</p>
        </div>
        <button onClick={openCreate} className="btn btn-gold text-sm">
          <Plus className="w-4 h-4" />
          مهمة جديدة
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {([
          ['assigned', stats.assigned, 'مُسندة'],
          ['in_progress', stats.in_progress, 'قيد التنفيذ'],
          ['submitted', stats.submitted, 'مُسلّمة'],
          ['completed', stats.completed, 'مكتملة'],
          ['overdue', stats.overdue, 'متأخرة'],
        ] as const).map(([key, count, label]) => (
          <div key={key} className="card text-center py-3">
            <p className="text-2xl font-bold text-forest-900">{count}</p>
            <p className="text-xs text-charcoal-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Filter className="w-4 h-4 text-charcoal-400" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')} className="input w-auto text-sm">
          <option value="all">كل الحالات</option>
          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
            <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
          ))}
        </select>
        <select value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)} className="input w-auto text-sm">
          <option value="all">كل الطلاب</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList className="w-8 h-8" />} title="لا توجد مهام" subtitle="أنشئ مهمة جديدة للطلاب" />
      ) : (
        <div className="space-y-2">
          {filtered.map((task) => {
            const status = normalizeTaskStatus(task);
            const overdue = isTaskOverdue(task);
            return (
              <div key={task.id} className={`card flex flex-wrap items-start justify-between gap-3 ${overdue ? 'border-red-200 bg-red-50/30' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-bold text-forest-900">{task.title}</p>
                    <Badge color={TASK_STATUS_COLORS[status]}>{TASK_STATUS_LABELS[status]}</Badge>
                    {overdue && <Badge color="red">متأخرة</Badge>}
                  </div>
                  <p className="text-sm text-charcoal-500">{task.description || '—'}</p>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-charcoal-400">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />{task.student?.full_name || 'طالب'}</span>
                    {task.category?.name && <span>• {task.category.name}</span>}
                    {task.due_date && <span>• موعد: {formatDateArabic(task.due_date)}</span>}
                    {task.submission_text && <span>• تسليم: {task.submission_text.slice(0, 60)}{task.submission_text.length > 60 ? '…' : ''}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <select
                    value={status}
                    onChange={(e) => updateStatus(task, e.target.value as TaskStatus)}
                    className="input text-xs w-auto py-1"
                  >
                    {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => (
                      <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                  <button onClick={() => openEdit(task)} className="p-1.5 rounded-lg hover:bg-cream-100 text-charcoal-500" title="تعديل">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => deleteTask(task.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="حذف">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <Modal open onClose={() => { setShowForm(false); resetForm(); }} title={editing ? 'تعديل المهمة' : 'مهمة جديدة'} size="md">
          <div className="space-y-4">
            {!editing && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-forest-900 mb-2">
                  <input type="checkbox" checked={bulkMode} onChange={(e) => setBulkMode(e.target.checked)} />
                  تعيين لعدة طلاب
                </label>
                {bulkMode ? (
                  <div className="max-h-40 overflow-y-auto space-y-1 border border-cream-200 rounded-xl p-2">
                    {students.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-cream-50 cursor-pointer">
                        <input type="checkbox" checked={selectedStudentIds.includes(s.id)} onChange={() => toggleBulkStudent(s.id)} />
                        <span className="text-sm">{s.full_name}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <select value={studentId} onChange={(e) => setStudentId(e.target.value)} className="input">
                    <option value="">— اختر الطالب —</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}
            <div>
              <label className="label">عنوان المهمة</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" placeholder="مثال: حفظ سورة البقرة" />
            </div>
            <div>
              <label className="label">الوصف</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="input min-h-[80px]" placeholder="تفاصيل المهمة..." />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="label">موعد التسليم</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="input" />
              </div>
              <div>
                <label className="label">الفئة (اختياري)</label>
                <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="input">
                  <option value="">— عام —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={saveTask}
              disabled={!title.trim() || (!editing && !bulkMode && !studentId) || (!editing && bulkMode && selectedStudentIds.length === 0)}
              className="btn btn-primary w-full"
            >
              <Save className="w-4 h-4" />
              {editing ? 'حفظ التعديلات' : 'إنشاء المهمة'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
