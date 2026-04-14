# Master Codebase (Reusable Frontend Starter)

This folder is a **frontend starter/template pack** extracted from the UI/UX patterns in the Sociomate reference app.

It’s meant to give you ~50% of typical CRUD-heavy admin portal work out of the box (HRMS, task systems, student systems, attendance apps, etc.).

## What’s included

- **Theme system (token-driven)**: centralized, editable tokens in `src/config/themeConfig.ts`, applied as CSS variables via `src/components/common/ThemeProvider.tsx`.
- **Layout templates**:
  - `SidebarTemplate` (collapsible, persisted state, role/permission-aware via config)
  - `TopbarTemplate` (sticky header feel)
  - `AvatarMenu` (profile dropdown + logout, Sociomate-like)
  - `NotificationMenuTemplate` (bell + dropdown)
  - `AppShell` (sidebar + responsive content margin)
- **Auth screen family (config-driven UI)**:
  - `AuthLayout`
  - `LoginTemplate`
  - `SignupTemplate`
  - `ForgotPasswordTemplate`
  - `OtpVerificationTemplate`
  - `ResetPasswordTemplate`
- **Profile shell**:
  - `ProfileTemplate`
  - `ProfileEditDialog`
  - `ProfileSection`, `ProfileFieldRow`
- **CRUD shells**:
  - `GenericDataTable` (search/sort/actions)
  - `GenericEntityDialog` (schema-driven fields, role-aware visibility/editability)
  - `GenericSearchBar`, `FilterBar`
  - `ConfirmDialog`, `EmptyState`, `LoadingState`

## What you customize for a new app

- **Branding**: `src/config/appConfig.ts`
  - `appName`, `appShortName`, `supportEmail`, optional `logoText`/`logoUrl`
- **Theme colors / radius / shadows**: `src/config/themeConfig.ts`
  - Components use CSS variables like `--primary`, `--primary-soft`, `--border`, `--bg`.
- **Auth methods + endpoint placeholders**: `src/config/authConfig.ts`
  - Toggle `methods.*` (Google/Facebook/email/password/OTP/forgot/reset)
  - Update `endpoints.*` to match your backend routes
- **Roles + permissions**: `src/config/roleConfig.ts`
  - Add roles, define permissions for each role
- **Sidebar nav items**: `src/config/sidebarConfig.ts`
  - Items are visibility-controlled by `requiresAnyRole` / `requiresAnyPermission`

## How to connect real APIs/Supabase later

This starter intentionally **does not** implement business logic or hardcode tables.

Recommended pattern:

- Keep the UI templates as-is.
- Create a thin `src/lib/api/*` client or adapter layer later (fetch/axios/supabase client).
- Pass data + callbacks into:
  - `GenericDataTable` (rows, search config, row actions callbacks)
  - `GenericEntityDialog` (field schema + `onSubmit`)
  - `ProfileTemplate` / `ProfileEditDialog` (`onSave`)
  - `NotificationMenuTemplate` (`onOpen`, `onItemClick`, `onMarkAllRead`)

## Local development

1. Copy env file:
   - `cp .env.example .env.local` (or create `.env.local` on Windows)
2. Install deps:
   - `npm install`
3. Run:
   - `npm run dev`
4. Visit:
   - Home: `/`
   - Auth: `/auth/login` and `/auth/signup`
   - App demo: `/app/demo`
   - Profile: `/app/profile`

## File map (key locations)

- `src/config/*` — all editable defaults
- `src/components/layout/*` — sidebar/topbar/avatar/notifications/app shell
- `src/components/auth/*` — auth screen templates
- `src/components/profile/*` — profile templates + edit dialog
- `src/components/crud/*` — table/dialog/search shells
- `src/components/common/*` — dialogs + states + role guard

## Guarantee

- Sociomate folder was treated as **read-only reference**.
- This starter is **frontend-only** and **backend-agnostic** by design.

