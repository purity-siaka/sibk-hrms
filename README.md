# SIBK Management System

Full-stack HR system for Salaam Investment Bank Kenya: employee records and personal portals, document collection and verification, recruitment, onboarding and exit, profile change requests, announcements, policies, reports and an audit trail. **Leave management, overtime and salary advances are not included** (leave is delivered separately in Power Apps).

| Layer | Stack |
|---|---|
| Backend | Go 1.22, standard `net/http`, GORM + PostgreSQL, bcrypt, HS256 JWT |
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| Contract | [`docs/API.md`](docs/API.md) |

## Run it

```bash
docker compose up --build        # web :3000, api :8080, postgres
```

Sign in at http://localhost:3000 as `carol.mathai@salaaminvestments.com` with `ADMIN_PASSWORD` (default `ChangeMe-2026`). The demo seed (`SEED_DEMO=true`) loads the 16 SIBK staff and sample data into an empty database. Other staff get random passwords; in `APP_ENV=development` they are printed in the API log. HR can reset any password under Administration > Users.

Without Docker:

```bash
cd backend && cp .env.example .env && go mod tidy && go test ./... && go run ./cmd/server
cd frontend && npm install && npm run dev
```

UI only (no Go or Postgres): `node frontend/dev/mock-api.mjs` then `npm run dev`; sign in with any password as one of the mock users, for example `carol.mathai@salaaminvestments.com`.

## Roles

`hr_admin` (everything, users, audit), `hr_officer` (all HR data), `manager` (own team and onboarding tasks), `employee` (own portal only). Sensitive fields (ID, KRA, NSSF, SHA, bank, date of birth) are visible to HR and the employee only. Viewing sensitive data, document downloads, report exports and every change are written to the audit log.

## Policy rules built in (HR Policy v1.0)

3-month probation, extendable once by 3 months; exit tasks must be complete before marking exited; 60-day look-ahead for expiring documents, probation and contracts; recruitment records never auto-deleted; nobody can decide their own profile change request.

## Production checklist

Set a random `JWT_SECRET` (32+ characters), `APP_ENV=production`, `SEED_DEMO=false`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`; serve both apps over HTTPS; mount a persistent volume at `UPLOAD_DIR`; back up Postgres and the uploads volume; set `CORS_ORIGIN` to the web address.


## Leave management

Leave is built in (apply, approve, balances, public holidays, HR reports, sick-note attachment). See "Leave" in docs/API.md.
Demo data loads the real balances and the 8 leave requests recorded so far. After upgrading an existing demo database, run
`docker compose down -v` and start again so the new tables and data load.

### Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (and optionally `MAIL_FROM_NAME`, `HR_MAILBOX`, `SMTP_AUTH=login`)
in `.env` next to `docker-compose.yml`. Without them the system works normally and emails are only written to the API log.
