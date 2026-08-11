import { useCallback, useEffect, useState } from 'react';
import { Users, Plus, Trash2, Save, BookOpen, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getAllGroups, createGroup, deleteGroup, bulkAssignToGroup,
  bulkEnrollCourses, bulkUpdateStudentStatus,
} from '@/lib/groups';
import { Loading, EmptyState, Badge } from '@/components/ui';
import { Modal } from '@/components/Modal';
import type { Profile, Course, StudentGroup } from '@/lib/types';

export function GroupsTab() {
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isHifz, setIsHifz] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState<'group' | 'course' | 'approve' | null>(null);
  const [bulkGroupId, setBulkGroupId] = useState('');
  const [bulkCourseIds, setBulkCourseIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: studentData }, { data: courseData }, groupList] = await Promise.all([
      supabase.from('profiles').select('*').eq('role', 'student').order('full_name'),
      supabase.from('courses').select('*').order('title'),
      getAllGroups(),
    ]);
    setStudents(studentData as Profile[] || []);
    setCourses(courseData as Course[] || []);
    setGroups(groupList);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    const ok = await createGroup(name.trim(), description.trim(), isHifz);
    if (ok) {
      setShowForm(false);
      setName('');
      setDescription('');
      setIsHifz(false);
      load();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === students.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(students.map((s) => s.id)));
  };

  const runBulkGroup = async () => {
    if (!bulkGroupId || selectedIds.size === 0) return;
    await bulkAssignToGroup([...selectedIds], bulkGroupId);
    setBulkModal(null);
    setSelectedIds(new Set());
    load();
  };

  const runBulkCourses = async () => {
    if (bulkCourseIds.length === 0 || selectedIds.size === 0) return;
    await bulkEnrollCourses([...selectedIds], bulkCourseIds);
    setBulkModal(null);
    setBulkCourseIds([]);
    setSelectedIds(new Set());
    load();
  };

  const runBulkApprove = async () => {
    if (selectedIds.size === 0) return;
    await bulkUpdateStudentStatus([...selectedIds], 'approved');
    setBulkModal(null);
    setSelectedIds(new Set());
    load();
  };

  if (loading) return <Loading />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-forest-900">الشُعب والقروبات</h3>
          <p className="text-sm text-charcoal-500">إنشاء مجموعات وتعيين الطلاب وإجراء عمليات جماعية</p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-gold text-sm">
          <Plus className="w-4 h-4" />
          مجموعة جديدة
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map((g) => (
          <div key={g.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold text-forest-900">{g.name}</p>
                <p className="text-xs text-charcoal-500 mt-1">{g.description || '—'}</p>
                {g.is_hifz && <Badge color="gold">حفظ / قرآن</Badge>}
              </div>
              <button onClick={() => deleteGroup(g.id).then(load)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {groups.length === 0 && (
        <EmptyState icon={<Users className="w-8 h-8" />} title="لا توجد مجموعات" subtitle="أنشئ شعبة أو مجموعة حفظ" />
      )}

      <div className="border-t border-cream-200 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h4 className="font-bold text-forest-900">عمليات جماعية على الطلاب</h4>
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setBulkModal('group')} className="btn btn-primary text-sm">
                <Users className="w-4 h-4" />
                تعيين لمجموعة ({selectedIds.size})
              </button>
              <button onClick={() => setBulkModal('course')} className="btn btn-outline text-sm">
                <BookOpen className="w-4 h-4" />
                تسجيل دورات
              </button>
              <button onClick={() => setBulkModal('approve')} className="btn btn-outline text-sm">
                <CheckSquare className="w-4 h-4" />
                اعتماد الكل
              </button>
            </div>
          )}
        </div>

        <button onClick={selectAll} className="text-sm text-forest-700 hover:underline mb-3">
          {selectedIds.size === students.length ? 'إلغاء تحديد الكل' : 'تحديد كل الطلاب'}
        </button>

        <div className="space-y-2 max-h-96 overflow-y-auto">
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleSelect(s.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-colors ${selectedIds.has(s.id) ? 'border-forest-400 bg-forest-50' : 'border-cream-200 hover:bg-cream-50'}`}
            >
              {selectedIds.has(s.id) ? <CheckSquare className="w-5 h-5 text-forest-700" /> : <Square className="w-5 h-5 text-charcoal-300" />}
              <span className="font-medium text-forest-900">{s.full_name}</span>
              <Badge color={s.status === 'approved' ? 'green' : 'gold'}>{s.status}</Badge>
            </button>
          ))}
        </div>
      </div>

      {showForm && (
        <Modal open onClose={() => setShowForm(false)} title="مجموعة / شعبة جديدة">
          <div className="space-y-4">
            <div>
              <label className="label">الاسم</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="شعبة الشيخ أحمد" />
            </div>
            <div>
              <label className="label">الوصف</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="input" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isHifz} onChange={(e) => setIsHifz(e.target.checked)} />
              مجموعة حفظ / قرآن (تفعّل تتبع الحفظ والتقييمات القرآنية)
            </label>
            <button onClick={handleCreate} disabled={!name.trim()} className="btn btn-primary w-full">
              <Save className="w-4 h-4" />
              إنشاء
            </button>
          </div>
        </Modal>
      )}

      {bulkModal === 'group' && (
        <Modal open onClose={() => setBulkModal(null)} title={`تعيين ${selectedIds.size} طالب لمجموعة`}>
          <select value={bulkGroupId} onChange={(e) => setBulkGroupId(e.target.value)} className="input mb-4">
            <option value="">— اختر المجموعة —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}{g.is_hifz ? ' (حفظ)' : ''}</option>
            ))}
          </select>
          <button onClick={runBulkGroup} disabled={!bulkGroupId} className="btn btn-primary w-full">تعيين</button>
        </Modal>
      )}

      {bulkModal === 'course' && (
        <Modal open onClose={() => setBulkModal(null)} title={`تسجيل ${selectedIds.size} طالب في دورات`}>
          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-cream-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkCourseIds.includes(c.id)}
                  onChange={(e) => setBulkCourseIds((prev) => e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id))}
                />
                <span className="text-sm">{c.title}</span>
              </label>
            ))}
          </div>
          <button onClick={runBulkCourses} disabled={bulkCourseIds.length === 0} className="btn btn-primary w-full">تسجيل</button>
        </Modal>
      )}

      {bulkModal === 'approve' && (
        <Modal open onClose={() => setBulkModal(null)} title={`اعتماد ${selectedIds.size} طالب؟`}>
          <button onClick={runBulkApprove} className="btn btn-primary w-full">تأكيد الاعتماد</button>
        </Modal>
      )}
    </div>
  );
}
