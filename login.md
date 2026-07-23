# Auth Integration

Auth is already implemented by the scaffold. Do not create login, logout, OAuth, cookie, token, middleware/proxy, or session logic.

## Quick start

1. Import `UserMenu` from `@/components/auth/user-menu`.
2. Place `<UserMenu />` in the app's natural navigation area (header, sidebar, settings menu, or game pause/menu screen).
3. Keep the placement visually consistent with the app. Do not add a floating global bar unless the app design calls for one.

```tsx
import { UserMenu } from "@/components/auth/user-menu";

export default function Header() {
  return (
    <header className="flex items-center justify-between">
      <div>App name</div>
      <UserMenu />
    </header>
  );
}
```

## Rules

- `UserMenu` already shows the current user and includes logout.
- MUST import exactly `@/components/auth/user-menu`; do not create a second user menu component.
- MUST place `UserMenu` from a Server Component such as a page, layout, or server-rendered header.
- Routes are protected by `proxy.ts`; pages usually do not need extra auth code.
- If server code needs the current user, import `requireAuth` from `@/lib/auth`.
- If the user asks for nickname, avatar, role, profile page, last login time, or other profile data, extend the existing user table and app UI. Do not create a separate users table or rebuild auth.
- If editing the login page, MUST keep copy in the user's language and align its visual style with the app.
- Do not edit `lib/auth.ts`, `proxy.ts`, login routes, or OAuth callback routes unless explicitly asked.

## File map (auth contract)

Do not read these files just to confirm they exist; import/use them directly unless you need to edit one.

| File | Purpose | AI action |
|------|---------|-----------|
| `components/auth/user-menu.tsx` | User entry UI with logout | Import and place only |
| `lib/auth.ts` | `requireAuth()`, `getSession()` | Do not edit unless asked |
| `lib/public-url.ts` | Public origin for redirects (proxy-aware) | Do not edit |
| `proxy.ts` | Route protection | Do not edit unless asked |
| `app/login/page.tsx` | Built-in login page | Style only if asked |
| `app/login/actions.ts` | Login server actions | Do not edit unless asked |
| `app/auth/*/callback/route.ts` | OAuth callback plumbing | Do not edit |

## User table

| Key | Value |
|-----|-------|
| User table id | `tblloGrXBZuKkRrmzbd` |
| Email field id | `fld1Ksx6oehEUrvgu7h` |
| Schema file | `schema/table-tblloGrXBZuKkRrmzbd.json` |

- Email is the only built-in unique identifier for login. All other user data (name, avatar, role, last login, etc.) lives as additional fields on this same table — do not create a separate users table.
- The email field is managed by auth — do not overwrite it.

## Current user

`requireAuth()` from `@/lib/auth` returns `AuthUser`:

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Record ID in the user table. Use with `sqlQuery` / `updateRecord` to read or write user fields (see `teable.md`). |
| `email` | `string` | The user's email address (login identity). |
| `profile` | `{ name?, avatar?, provider }` \| `undefined` | Data from the OAuth provider (Google or Teable). Not available for email-OTP logins. |

### Using `profile` to populate user fields

When a user signs in via Google or Teable, `profile` contains their display name and/or avatar URL from the provider. Use this data to fill the corresponding fields in the user table so the app can display richer user info:

1. Read the user table schema (`schema/table-tblloGrXBZuKkRrmzbd.json`) to find the target field IDs.
2. Use `updateRecord` to write `profile.name` / `profile.avatar` to the matching fields.
3. Only write when the field exists in the schema and the value is not already set, to avoid overwriting user edits.
