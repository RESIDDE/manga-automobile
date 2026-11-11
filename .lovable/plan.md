

# Implementation Plan: Auth, Analytics Dashboard, and Customer Engagement

## Feature 1: User Authentication & Role-Based Access Control

### Database changes
- Create `app_role` enum: `admin`, `sales`, `mechanic`
- Create `user_roles` table with `user_id` + `role` (unique constraint)
- Add RLS policies using a `has_role()` security definer function
- Create a trigger on `auth.users` to auto-create a profile row on signup
- Tighten RLS on all existing tables (vehicles, customers, sales, repairs, invoices, inspections, inquiries) so only authenticated users can access them

### New pages and components
- **Login page** (`src/pages/Auth.tsx`) — email/password login and signup with Supabase Auth, clean branded UI
- **Role management** — first user to sign up becomes admin; admin can assign roles to other users from a simple settings page (`src/pages/Settings.tsx`)
- **Auth guard** — wrap `AppLayout` with an auth check; redirect unauthenticated users to `/auth`
- **Profile display** — show logged-in user name/avatar in the sidebar header with a logout button
- Update `AppLayout.tsx` and `App.tsx` to handle auth state via `onAuthStateChange`

### Files affected
- New: `src/pages/Auth.tsx`, `src/pages/Settings.tsx`, `src/hooks/useAuth.tsx`
- Modified: `src/App.tsx`, `src/components/AppLayout.tsx`, `src/components/AppSidebar.tsx`
- New migration for `user_roles`, `has_role()` function, profile trigger, and tightened RLS

---

## Feature 2: Advanced Analytics Dashboard

Upgrade the existing Dashboard with richer interactive charts and KPIs.

### New charts and metrics
- **Monthly sales revenue trend** — line/area chart showing ₦ revenue per month (last 12 months)
- **Profit margin per vehicle** — bar chart comparing cost price vs sale price for sold vehicles
- **Repair turnaround time** — average days from repair creation to completion, shown as a stat + trend
- **Inventory aging** — horizontal bar chart showing how long unsold vehicles have been in stock (0-30, 30-60, 60-90, 90+ days)
- **Sales vs Repairs revenue split** — donut chart comparing the two revenue streams
- **Top selling makes** — small ranked list of best-selling vehicle brands

### Implementation
- Expand data fetching in `Dashboard.tsx` to pull cost_price from vehicles and join sales with vehicles
- Add new `useMemo` calculations for each metric
- Use existing Recharts (already installed) with `AreaChart`, `LineChart`, `BarChart`, `PieChart`
- Responsive bento grid layout, consistent with current design language

### Files affected
- Modified: `src/pages/Dashboard.tsx` (major expansion)

---

## Feature 3: Customer Engagement — Public Customer Portal

Since WhatsApp/SMS integration requires external API keys and services, I will focus on the **Customer Portal** — a read-only public page where customers can check their repair status and view invoice history using their phone number. No login required.

### How it works
- New public route `/portal` (outside `AppLayout`, no auth required)
- Customer enters their phone number
- System looks up the customer by phone, then shows:
  - Active repairs and their status
  - Invoice history with amounts and status
  - Vehicle details associated with their records
- Clean, mobile-first branded interface

### Files affected
- New: `src/pages/CustomerPortal.tsx`
- Modified: `src/App.tsx` (add `/portal` route outside AppLayout)

---

## Technical notes
- The `profiles` table already exists with `user_id`, `display_name`, `avatar_url`, `phone` columns — will reuse it
- All existing tables currently have open RLS (`true` for all operations) — the auth migration will tighten these to `authenticated` only
- The customer portal will use the `anon` key with targeted RLS policies so customers can look up only their own data by phone number
- No external API keys or third-party services are needed for any of these three features

