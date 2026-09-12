Run `npm run test:permissions` from the repository root.

The runner uses an isolated in-memory PostgreSQL database (PGlite), minimal Supabase auth/storage fixtures, and the prerequisite schema. It applies the admin-controls migration unchanged, then runs the assertions in `clinic_admin_controls.sql`. It never connects to production. Legacy migrations are loaded in dependency order because the inventory migration references treatment tables introduced by a later migration.

Coverage includes explicit deny over role defaults, atomic rollback, self-escalation, cross-clinic access, protected admin accounts, suspension, clinic settings, doctor colours, linking verified accounts, clinical versus demographic edits, photo metadata and storage deletion, finance read-only access, half-day booking conflicts, treatment price overrides, discounts, computed totals and price-history writes.

`clinic_admin_controls.sql` uses PostgreSQL assertions rather than pgTAP. Do not run it against a live clinic: it creates synthetic fixture users inside a rollback transaction. UI verification uses separate disposable browser fixtures; those are excluded from source control.

Deployment order: apply `20260912094928_clinic_admin_controls.sql` to Supabase first, then deploy the application. Existing practitioners are not automatically linked to logins; the administrator chooses the matching profile under Schedule identity. Existing browser-only clinic hours should be saved once in Clinic setup to share them across the team.
