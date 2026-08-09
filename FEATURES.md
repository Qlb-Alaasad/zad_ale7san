# Features Documentation — Zad Al-Ihsan Academy (زاد الإحسان)

> منصة تعليمية متكاملة للشباب — Qur'an, ethics, and sports academy management platform

---

## Core Features

### Authentication & User Management
- Email/password registration and login via Supabase Auth
- Google OAuth login option (provider-dependent)
- Automatic profile creation on signup (database trigger)
- First-user auto-promotion to admin (bootstrap logic — no hardcoded admin account)
- Account approval workflow: new students start as `pending`, admin approves/rejects
- Pending and rejected account pages with clear status messaging
- Password change in admin settings
- Protected route guards: redirects by role (admin → dashboard, student → portal) and status (pending/rejected → pending page)
- Session persistence with auto-refresh tokens

### Admin Dashboard (Sheikh's Panel)
- **Overview tab**: live stats (pending students, approved students, course count, unpaid dues total) and a performance leaderboard ranked by lowest points deducted + highest attendance
- **Approvals tab**: review pending student registrations with one-click approve/reject; approval sends a welcome notification to the student
- **Students tab**: full user management — view all profiles, change roles (student ↔ admin), change account status (pending/approved/rejected), manage course enrollments per student, and view/edit supervisor & auto-absence notes
- **Courses tab**: create, edit, and delete courses with structured weekly scheduling (day-of-week picker, start/end times, session duration, total session count, time notes, supervisor notes); create and manage sessions (classes, matches, events) with date/time/location
- **Attendance tab**: start a session from any course with a live countdown timer; displays a dynamic QR code that regenerates every 60 seconds; live attendance roster with manual override (present/late/absent); pause/resume timer; auto-absence marking when the timer ends (absent students get an attendance record, an absence note, and a notification)
- **Evaluations tab**: weekly per-student evaluation across configurable categories; slider-based points deduction with live star rating preview; per-category notes that notify the student
- **Categories tab**: create, edit, and delete evaluation categories with custom names, descriptions, and max points
- **Financial tab**: per-student financial dues management — add dues, toggle paid/unpaid, delete dues; outstanding balance summary card; payment notifications sent to students
- **Settings tab**: change admin account password

### Student Portal
- **Overview**: personal profile summary with Quran progress percentage, current module, and weekly star ratings across all evaluation categories
- **Attendance**: QR code scanner using the device camera (html5-qrcode) to scan the Sheikh's dynamic QR; success overlay with green checkmark and "تم تسجيل الحضور بنجاح" message for 5 seconds with cooldown to prevent duplicate scans; late detection (15-minute grace period); attendance history list with status badges
- **Evaluations**: view weekly evaluation results with partial-fill star ratings per category and supervisor notes
- **Tasks**: view assigned tasks with due dates and completion status
- **Financial**: view personal financial dues with paid/unpaid status
- **Notes**: view supervisor notes and automated absence flags
- **Notifications**: real-time notification bell with unread count badge, mark-all-read, and delete

### QR Attendance System
- Time-based QR token generation using SHA-256 hashing (session ID + 60-second time window + per-session secret)
- QR payload verified on scan with 120-second tolerance for scan latency
- QR code displayed on admin screen and regenerated every 60 seconds with a "live" indicator badge
- Anti-cheat: tokens are time-windowed and hash-verified, preventing screenshot reuse
- Success state after scan: camera stays open, green checkmark overlay displayed for 5 seconds with progress bar countdown, scanning paused to prevent duplicate records, then auto-resumes
- Error states shown inline (invalid token, expired, already attended, inactive session) without closing the scanner

### Evaluation & Scoring System
- 5-star rating with exact partial fills using SVG linear gradients (no rounding)
- Points-per-star computed dynamically from each category's max points
- Evaluations scoped per week (ISO week number + year)
- Star fills computed client-side from `points_deducted` values
- Leaderboard ranking: lowest total deductions wins; present-count as tiebreaker

### Notifications
- Real-time delivery via Supabase Postgres Changes (realtime subscriptions)
- 5 notification types: general, note, schedule, financial, attendance
- Unread count badge on bell icon
- Mark all as read / delete individual notifications
- Arabic relative time formatting ("قبل 5 دقائق", "قبل ساعتين", etc.)
- Notifications auto-generated on: approval, evaluation notes, attendance updates, financial dues, auto-absence marking

### Automated Absence System
- When an admin session timer ends (or is ended early), all approved students without an attendance record are marked absent
- Each absent student receives: an `absent` attendance record (7 points deducted), an automated absence note in `student_notes`, and a notification
- Prevents manual follow-up for tracking no-shows

---

## Database Schema

### Tables (12 total)
| Table | Purpose |
|---|---|
| `profiles` | User profiles linked to `auth.users` — role (admin/student), status (pending/approved/rejected), Quran progress, current module |
| `courses` | Academy courses with structured scheduling (days array, start/end times, duration, session count, notes) |
| `student_courses` | Join table linking students to courses |
| `categories` | Evaluation categories with configurable max points |
| `evaluations` | Per-student, per-category, per-week evaluation records with points deducted and notes |
| `sessions` | Class/match/event sessions with start/end times, active flag, location, and course link |
| `attendance` | Student attendance per session (present/late/absent) with points deducted |
| `financial_dues` | Student financial obligations (unpaid/paid) with amount and description |
| `tasks` | Student tasks with due dates and completion status |
| `notifications` | User notifications with type classification and read status |
| `qr_tokens` | Attendance QR token records linked to sessions with validity windows |
| `student_notes` | Supervisor notes and automated absence flags on student profiles |

### Security (Row Level Security)
- RLS enabled on all tables
- `is_admin()` SECURITY DEFINER helper function checks `profiles` for `role='admin'` AND `status='approved'`
- Admins: full CRUD on all tables via `is_admin()` policy checks
- Students: read-only access to own rows; read access to shared reference data (courses, categories, sessions, QR tokens)
- Students can insert own attendance (QR scan) and notifications
- Signup trigger (`handle_new_user`): auto-creates profile row; first-ever signup becomes admin, all subsequent signups default to student/pending
- 4 separate policies per table (SELECT, INSERT, UPDATE, DELETE) — no `FOR ALL` shortcuts

---

## UI/UX Design

### Design Language
- **Theme**: Islamic academy aesthetic — deep forest green primary, warm gold accents, cream/neutral backgrounds
- **Color system**: 6+ color ramps (forest green, gold, cream, charcoal, plus standard red/green/blue for status)
- **Typography**: Arabic-first RTL layout throughout; clear hierarchy with bold headings and readable body text
- **Spacing**: Consistent 8px-based spacing system
- **Line height**: 150% body, 120% headings

### Animations & Micro-interactions
- `fade-in` — modal and overlay entrance
- `slide-up` — modal card and dropdown entrance
- `pulse-gold` — pulsing glow ring on pending state
- `scale-in` — card and badge entrance
- `overlay-in` — QR scanner success overlay with blur backdrop
- `check-pop` — spring-bounce entrance for success checkmark
- `shrinkBar` — 5-second countdown progress bar in QR scanner
- Hover states on all interactive cards (shadow lift, color transitions)
- Active tab indicator with bold text and background swap
- Mobile sidebar slide-in with overlay backdrop

### Responsive Design
- Mobile-first with breakpoints at `sm` (640px), `md` (768px), `lg` (1024px)
- Sidebar collapses to hamburger menu on mobile with slide-in drawer + overlay
- Tab bar horizontally scrollable on mobile
- Grid layouts adapt: 1 column (mobile) → 2 columns (tablet) → 3-4 columns (desktop)
- QR scanner viewport fills container width on all devices

### Reusable Components
| Component | Purpose |
|---|---|
| `AuthLayout` | Split-screen layout for login/register — branded left panel + form right panel |
| `DashboardLayout` | Sidebar navigation + sticky header with notification bell and avatar |
| `Modal` | Centered modal with backdrop blur, 4 size variants (sm/md/lg/xl), close button |
| `NotificationBell` | Dropdown notification panel with realtime updates, unread badge, mark-all-read |
| `StarRating` | 5-star display with exact partial fills via SVG gradients; inline variant available |
| `Loading` | Spinner with Arabic label |
| `EmptyState` | Icon + title + subtitle for empty lists |
| `Badge` | Colored status pill (forest/gold/red/green/gray) |

### Pages
| Page | Route | Access |
|---|---|---|
| Landing page | `/` | Public |
| Login | `/login` | Public |
| Register | `/register` | Public |
| Pending | `/pending` | Authenticated (pending/rejected users) |
| Admin Dashboard | `/admin` | Admin only |
| Student Portal | `/portal` | Students only |

---

## Technical Stack

### Frontend
- **React 18** with TypeScript
- **Vite 5** as build tool and dev server
- **React Router 7** for client-side routing
- **Tailwind CSS 3.4** for styling (custom color palette, animations, RTL support)
- **Lucide React** for icons
- **html5-qrcode** for camera-based QR scanning
- **qrcode** (Node) for QR code generation on the admin side

### Backend & Database
- **Supabase** — PostgreSQL database, Auth, Realtime subscriptions
- **Row Level Security** on all tables with admin-aware policies
- **Database triggers** — auto-profile creation on signup with first-admin bootstrap
- **SECURITY DEFINER functions** — `is_admin()` helper and `handle_new_user()` trigger
- **Supabase Realtime** — live notification delivery via Postgres Changes

### Utilities
- `src/lib/auth.tsx` — Auth context provider with session/profile state, `onAuthStateChange` listener, deadlock-safe loading
- `src/lib/supabase.ts` — Supabase client initialization with session persistence
- `src/lib/types.ts` — Full TypeScript type definitions for all 12 database tables
- `src/lib/scoring.ts` — Star fill computation, week/year helpers, evaluation indexing
- `src/lib/qr.ts` — QR payload generation and verification using Web Crypto API (SHA-256)
- `src/lib/notifications.ts` — Notification creation helper
- `src/lib/date.ts` — Arabic date/time formatting utilities (relative time, full date, time, datetime)

### Build & Deploy
- **Vite** production build
- **TypeScript** strict mode with project references
- **ESLint** with React Hooks and React Refresh plugins
- **Netlify** deployment configuration (`netlify.toml`, `_redirects`, `_headers`)

### Language & Localization
- Fully Arabic (RTL) interface — `dir="rtl"` throughout
- Arabic day names for course scheduling (السبت through الجمعة)
- Arabic date formatting via `toLocaleDateString('ar-EG', ...)`
- English used only for technical identifiers and code
