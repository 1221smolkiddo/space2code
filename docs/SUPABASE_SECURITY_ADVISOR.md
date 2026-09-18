# Supabase Security Advisor follow-up — 2026-09-18

Project: Space2Code (`hkizheeymciikfvgrkvj`).

## Applied: internal membership helper

Migration `202609180001_private_membership_helper.sql` moves the existing
`space2code_is_current_user_participant(uuid)` function from `public` to `private`.
Moving it preserves its object identity and all nine RLS policy dependencies.
It retains SECURITY DEFINER to avoid recursive membership policies, binds the
lookup to `auth.uid()`, and uses an empty search path with qualified references.
Anonymous execution and schema creation by signed-in users are denied.
Authenticated users retain the execution privilege needed by RLS.

Keep `private` out of the exposed API schemas. The verified live exposure was
`public,graphql_public`; no API configuration changes were needed.

The migration was tested in a rolled-back transaction, then applied with the
same assertions and its migration-history entry in one transaction. Older live
migration timestamps differ from this repository, so a blanket `db push` was
not used and old migrations were not replayed or marked repaired.

Verification:

- Security Advisor no longer reports the exposed SECURITY DEFINER helper.
- All nine RLS dependencies retained; RLS remains enabled.
- Member reads succeed; outsider and anonymous reads reveal no session data.
- Membership insert/update/delete remain denied to signed-in users.
- Anonymous helper execution denied; service-role helper access retained.
- Backend: 81 tests passed.

Rerun the SQL assertions against a database with an existing session participant:

```powershell
supabase db query --linked --file supabase/tests/private_membership_helper.sql --output json
supabase db advisors --linked --type security --level warn --output json
```

The SQL assertions use existing rows and roll back their transaction.

## Remaining: leaked-password protection

Attempted the narrowly scoped Auth configuration update
`{"password_hibp_enabled":true}`. Supabase rejected it with:

> Configuring leaked password protection via HaveIBeenPwned.org is available on Pro Plans and up.

The built-in setting remains disabled. Supabase will therefore continue to show
this Advisor warning unless the project moves to Pro.

As a Free-plan compensating control, Space2Code checks email-signup passwords
against HIBP's free range API before calling Supabase Auth. The browser sends
only the first five characters of a SHA-1 hash, requests response padding, and
compares the remaining hash locally. The check runs only on form submission and
fails closed when HIBP is unavailable. The password and complete hash are never
sent to HIBP. Supabase Auth also enforces a 12-character minimum with lowercase,
uppercase, and numeric characters, including for requests that bypass the UI.

This protects Space2Code's current email-signup flow. It cannot provide the same
platform-wide enforcement as Supabase's paid setting because a caller can still
invoke the public Supabase signup endpoint directly with a password that meets
the server's strength rules. Any future password reset/change UI must call the
same `assertPasswordIsSafe` helper before `updateUser`.

Reference: https://supabase.com/docs/guides/auth/password-security
