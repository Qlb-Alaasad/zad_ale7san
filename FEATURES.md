# Features Documentation — Zad Al-Ihsan Academy (زاد الإحسان)

> منصة تعليمية متكاملة للشباب — Qur'an, ethics, and sports academy management platform

---

## Core Features

### Authentication & User Management
- Email/password registration and login via Supabase Auth
- **Google OAuth** via centralized `signInWithGoogle()` helper with dynamic redirect URLs
- OAuth callback route (`/auth/callback`) waits for session exchange, syncs profile to DB + `localStorage`, refreshes auth context, then routes
- Redirect URL resolution: `VITE_SITE_URL` (Netlify `URL` env at build) or runtime `window.location.origin` (local dev)
- OAuth callback errors from Supabase query params surfaced with graceful redirect to login
- Automatic profile creation on signup (database trigger) with client-side fallback for OAuth race conditions
- First-user auto-promotion to admin (bootstrap logic — no hardcoded admin account)
- Account approval workflow: new students start as `pending`, admin approves/rejects
- Pending page auto-refreshes profile every 15s and redirects when approved
- Guest routes prevent authenticated users from looping on `/login` after OAuth
- Password change in admin settings
- Protected route guards: redirects by role (admin → dashboard, student → portal) and status (pending/rejected → pending page)
- Session persistence with `localStorage` profile cache and auto-refresh tokens
- Global `ErrorBoundary` for graceful UI recovery on unexpected render errors

### Admin Dashboard (Sheikh's Panel)

#### Overview
- Live stats: pending students, approved students, course count, unpaid dues total
- Performance leaderboard ranked by lowest points deducted + highest attendance

#### Approvals
- Review pending student registrations with one-click approve/reject
- Approval sends a welcome notification to the student

#### Students
- Full user management — view all profiles, change roles (student ↔ admin), change account status
- Manage course enrollments per student
- View/edit supervisor & auto-absence notes
- **Historical archive viewer**: inspect any archived academy week (evaluations, notes, attendance, Quran progress snapshot)

#### Groups (الشُعب والقروبات) — **NEW**
- Create custom student groups/classes (e.g. "شعبة الشيخ أحمد")
- Mark groups as **Hifz / قرآn** to enable Quran tracking modules for members
- **Bulk actions** on multi-selected students:
  - Assign to a group/class
  - Enroll in multiple courses at once
  - Mass-approve accounts
- Default seeded group: **الحفظ / القرآن**

#### Weekly Evaluation Cycle (Friday Reset) — **NEW**
- Academy week runs **Friday 00:00 → Thursday 23:59**
- On each Friday, when admin opens the dashboard, the system automatically:
  1. Archives the ending week's evaluations, notes, attendance, and Quran progress into `student_evaluation_history`
  2. Clears live `evaluations` rows for that week (fresh start)
- Tracked via `settings.last_weekly_reset_at` to prevent duplicate runs
- Admin **Evaluations** tab displays current academy week date range

#### Attendance
- Start a session from any course with a live countdown timer
- Dynamic QR code regenerating every 60 seconds
- Live attendance roster with manual override (present/late/absent)
- Pause/resume timer; auto-absence marking when timer ends

#### Evaluations
- Weekly per-student evaluation across configurable categories
- Slider-based points deduction with live star rating preview
- Per-category notes that notify the student
- **Hifz categories** (`categories.is_hifz`) only shown for students in a Hifz group

#### Tasks (المهام) — **NEW**
- Dedicated **Tasks tab** for academy-wide assignment management
- Create, edit, and delete tasks with title, description, due date, and optional category
- **Bulk assignment**: assign the same task to multiple students at once
- **Delivery states**: `assigned` → `in_progress` → `submitted` → `completed`
- Filter by status or student; stats cards for assigned/in-progress/submitted/completed/overdue
- View student submissions inline; admin can change task status manually
- Notifications sent to students when new tasks are assigned
- Per-category task management also available inside **Categories → Manage**

#### Financial (الذمم المالية) — **ENHANCED**
- Per-student financial dashboard with summary cards (unpaid, paid, ledger total)
- Add dues with description, amount, due date, category, and admin notes
- Mark dues paid/unpaid with automatic **payment ledger** entry on settlement
- Manual payment recording (amount, method, linked due, notes)
- Full **payment history** timeline per student
- Notifications on new dues and payment updates

#### Categories
- Create, edit, and delete evaluation categories with custom names, descriptions, and max points
- **Hifz flag** (`is_hifz`) marks Quran/memorization categories — hidden from non-Hifz students
- Per-category student enrollment via `student_categories`
- Per-student task and due management within each category

#### Settings
- Change admin account password

### Student Portal — **OVERHAULED**

The student portal now uses a **tabbed interface** with four sections:

#### 1. Home (الرئيسية)
- Personalized welcome header with quick stats (grade average, pending tasks, outstanding dues)
- One-tap QR attendance scanner
- Quick-action cards linking to tasks and finances
- Urgent tasks preview and latest supervisor notes

#### 2. Tasks (المهام)
- Full task list with status badges and overdue indicators
- Filter by delivery state
- Progress bar showing completion percentage
- **Interactive workflow**:
  - `assigned` → **بدء العمل** (start work)
  - `in_progress` → **تسليم** (submit text) or **إكمال** (mark done)
  - `submitted` → awaiting Sheikh review
  - `completed` → done
- View submission text and submission date
- Real-time sync when admin assigns or updates tasks

#### 3. Finances (المالية)
- Summary cards: amount owed, amount paid, total billed
- Payment instructions (manual settlement with Sheikh)
- Detailed dues list with paid/unpaid badges and due dates
- **Payment ledger** showing all recorded payments with method and date

#### 4. Progress (التقدم)
- Enrolled courses with per-course point bars
- Weekly star ratings by evaluation category (**Hifz categories excluded** if not in Hifz group)
- **Quran memorization tracker** — visible **only** for students in a Hifz group
- Upcoming matches/events
- Attendance history
- Historical evaluation archive (live week + archived weeks via admin)

### Conditional Hifz UI — **NEW**

| Student in Hifz group? | Quran progress UI | Hifz star categories | Hifz evals affect GPA |
|---|---|---|---|
| Yes | Shown | Shown | Yes |
| No | Hidden | Hidden | No — excluded from `computeStudentScore` |

Group membership is determined via `group_enrollments` → `student_groups.is_hifz`.

#### QR Attendance (available from Home)
- Camera-based QR scanner with success overlay and cooldown
- Late detection (15-minute grace period)

### QR Attendance System
- Time-based QR token generation using SHA-256 hashing
- QR payload verified on scan with 120-second tolerance
- Anti-cheat: time-windowed tokens prevent screenshot reuse
- Success state with 5-second overlay and auto-resume

### Evaluation & Scoring System
- 5-star rating with exact partial fills using SVG linear gradients
- Points-per-star computed dynamically from each category's max points
- Evaluations scoped per week (ISO week number + year)
- Leaderboard ranking: lowest total deductions wins; present-count as tiebreaker

### Notifications
- Real-time delivery via Supabase Postgres Changes
- 5 notification types: general, note, schedule, financial, attendance
- Unread count badge; mark all as read / delete individual notifications
- Arabic relative time formatting
- Auto-generated on: approval, evaluation notes, attendance, financial dues/payments, task assignments, auto-absence

### Automated Absence System
- When session timer ends, absent students get attendance record, absence note, and notification

---

## Database Schema

### Tables (17 total)

| Table | Purpose |
|---|---|
| `profiles` | User profiles — role, status, Quran progress, current module |
| `courses` | Academy courses with structured scheduling |
| `student_courses` | Join table linking students to courses |
| `student_categories` | Links students to evaluation categories |
| `student_groups` | **NEW** — custom classes/sections with optional Hifz flag |
| `group_enrollments` | **NEW** — many-to-many student ↔ group |
| `student_evaluation_history` | **NEW** — archived weekly snapshots (Friday reset) |
| `categories` | Evaluation categories with `is_hifz` flag and max points |
| `evaluations` | Per-student, per-category, per-week evaluation records |
| `sessions` | Class/match/event sessions with active flag |
| `attendance` | Student attendance per session |
| `financial_dues` | Student obligations — amount, status, due date, notes |
| `financial_payments` | **NEW** — payment ledger with method, amount, linked due |
| `tasks` | Student tasks with delivery states, submissions, due dates |
| `notifications` | User notifications with type classification |
| `qr_tokens` | Attendance QR token records |
| `student_notes` | Supervisor notes and automated absence flags |
| `settings` | App-wide config (base_points, absence_deduction) |

### Task Delivery States

| Status | Arabic | Who sets it |
|---|---|---|
| `assigned` | مُسندة | Admin (on create) |
| `in_progress` | قيد التنفيذ | Student (starts work) |
| `submitted` | مُسلّمة | Student (submits text) |
| `completed` | مكتملة | Student or Admin |

### Key TypeScript Interfaces

```typescript
type TaskStatus = 'assigned' | 'in_progress' | 'submitted' | 'completed';

interface Task {
  id, student_id, category_id, title, description, due_date,
  status, completed, submission_text, submitted_at, updated_at, created_at
}

interface FinancialDue {
  id, student_id, category_id, description, amount, status,
  due_date, notes, created_at
}

interface FinancialPayment {
  id, student_id, due_id, amount, payment_method, notes,
  recorded_by, created_at
}
```

### Security (Row Level Security)
- RLS enabled on all tables
- `is_admin()` SECURITY DEFINER helper for admin CRUD
- Students: read own rows; update own task progress/submissions via whitelisted client API (`updateStudentTask`) with status transition validation
- DB trigger `enforce_student_task_update` blocks students from changing task metadata (title, due date, reassignment)
- Students: read own financial dues and payment ledger (no write access)
- Admins: full CRUD on all tables
- Signup trigger auto-creates profile; first signup becomes admin
- OAuth profile sync with retry + safe fallback upsert

### OAuth Setup (Supabase Dashboard)
Add these **Redirect URLs** under Authentication → URL Configuration:
- `http://localhost:5173/auth/callback` (local Vite dev)
- `https://<your-netlify-domain>/auth/callback` (production)

Optional env var for production builds (Netlify sets `URL` automatically via `netlify.toml`):
```bash
VITE_SITE_URL=https://<your-netlify-domain>
```

---

## UI/UX Design

### Design Language
- Islamic academy aesthetic — forest green primary, gold accents, cream backgrounds
- Arabic-first RTL layout throughout
- Consistent 8px-based spacing; responsive mobile-first breakpoints

### New Components

| Component | Purpose |
|---|---|
| `TasksTab` | Admin task/assignment management with bulk assign and status tracking |
| `FinancialTabPanel` | Admin financial module with dues, payments, and ledger |
| Student portal tabs | Home, Tasks, Finances, Progress — internal tab navigation |

### Reusable Components
| Component | Purpose |
|---|---|
| `AuthLayout` | Split-screen login/register layout |
| `DashboardLayout` | Sidebar navigation + notification bell |
| `Modal` | Centered modal with backdrop blur |
| `NotificationBell` | Realtime notification dropdown |
| `StarRating` | 5-star display with partial fills |
| `Loading` / `EmptyState` / `Badge` | Standard UI primitives |

### Pages
| Page | Route | Access |
|---|---|---|
| Landing page | `/` | Public |
| Login | `/login` | Public (guest-only) |
| Register | `/register` | Public (guest-only) |
| OAuth callback | `/auth/callback` | Public (post-Google redirect) |
| Pending | `/pending` | Authenticated (pending/rejected) |
| Admin Dashboard | `/admin` | Admin only |
| Student Portal | `/portal` | Students only |

---

## Technical Stack

### Frontend
- React 18 + TypeScript + Vite 5
- React Router 7, Tailwind CSS 3.4, Lucide React
- html5-qrcode (scanning), qrcode (generation)

### Backend
- Supabase — PostgreSQL, Auth, Realtime
- Row Level Security with admin-aware policies
- Database triggers for profile creation

### Utility Modules
| Module | Purpose |
|---|---|
| `src/lib/academy-week.ts` | **NEW** — Friday-based academy week bounds and numbering |
| `src/lib/evaluation-history.ts` | **NEW** — weekly archive + Friday auto-reset |
| `src/lib/groups.ts` | **NEW** — group CRUD, bulk assign, Hifz checks |
| `src/lib/auth-helpers.ts` | OAuth redirect URLs, Google sign-in, profile ensure/sync |
| `src/lib/profile-cache.ts` | localStorage profile cache helpers |
| `src/lib/auth.tsx` | Auth context with session/profile cache |
| `src/lib/supabase.ts` | Supabase client with localStorage persistence |
| `src/lib/types.ts` | TypeScript definitions for all tables |
| `src/lib/tasks.ts` | **NEW** — task status labels, overdue check, progress |
| `src/lib/finances.ts` | **NEW** — finance summary, payment method labels |
| `src/lib/scoring.ts` | Star fills, week/year helpers, course points |
| `src/lib/qr.ts` | QR generation and verification (SHA-256) |
| `src/lib/notifications.ts` | Notification creation helper |
| `src/lib/date.ts` | Arabic date/time formatting |

### Migrations
- `20260811080000_tasks_finances_portal_enhancements.sql` — task status, payment ledger, student_categories
- `20260815120000_security_task_update_guard.sql` — student task update column guard trigger
- `20260811120000_complete_schema_and_storage.sql` — consolidated schema + storage buckets

### Build & Deploy
- `npm run build` — Vite production build
- `npm run typecheck` — TypeScript strict check
- Netlify deployment (`netlify.toml`, `_redirects`, `_headers`)

---

## Data Flow: Admin → Student Sync

```
Admin creates task ──→ tasks table ──→ Realtime subscription ──→ Student portal updates
Admin marks due paid ──→ financial_dues + financial_payments ──→ Student finances tab
Student submits task ──→ tasks.status = 'submitted' ──→ Admin Tasks tab shows submission
Student starts task ──→ tasks.status = 'in_progress' ──→ Admin sees status change
```

All changes propagate in real time via Supabase Postgres Changes subscriptions on both admin and student views.
