# Theralert — Software Architecture Document

| Field | Value |
|---|---|
| Document | Theralert Software Architecture Document (SAD) |
| Version | 1.0 |
| Status | As-built baseline |
| Date | 2026-10-20 |
| Owner | Anitej Waghray |
| Code baseline | branch `final`, commit `dc955a6` ("added a 'new organization' page") |
| Repository | `github.com/aniwag2/theralert` |
| Production URL | https://theralert.aniwaghray.com |
| Template | arc42 (sections 1–12) with C4-model views, extended with a threat model, roadmap and runbook |

**Change history**

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-10-20 | Anitej Waghray | Initial as-built architecture document for the Go rewrite. |

**How to read this document.** Sections 1–4 explain *what* Theralert is and *why* it is shaped the way it is. Sections 5–7 describe the structure (static, dynamic, physical). Section 8 covers concepts that cut across the whole codebase. Section 9 records each significant decision. Sections 10–12 cover quality, security and risk. Section 13 is the operational runbook. Appendices are reference tables (routes, configuration, files, dependencies).

Diagrams follow the [C4 model](https://c4model.com): **Level 1 – System Context** (people and external systems), **Level 2 – Containers** (separately running/deployable things), **Level 3 – Components** (major building blocks inside one container).

---

## Table of contents

1. [Introduction and goals](#1-introduction-and-goals)
2. [Architecture constraints](#2-architecture-constraints)
3. [Context and scope](#3-context-and-scope)
4. [Solution strategy](#4-solution-strategy)
5. [Building block view](#5-building-block-view)
6. [Runtime view](#6-runtime-view)
7. [Deployment view](#7-deployment-view)
8. [Cross-cutting concepts](#8-cross-cutting-concepts)
9. [Architecture decisions](#9-architecture-decisions)
10. [Quality requirements](#10-quality-requirements)
11. [Security architecture and threat model](#11-security-architecture-and-threat-model)
12. [Risks, technical debt and roadmap](#12-risks-technical-debt-and-roadmap)
13. [Operations runbook](#13-operations-runbook)
14. [Glossary](#14-glossary)
- [Appendix A — HTTP route reference](#appendix-a--http-route-reference)
- [Appendix B — Configuration reference](#appendix-b--configuration-reference)
- [Appendix C — Source inventory](#appendix-c--source-inventory)
- [Appendix D — Third-party components](#appendix-d--third-party-components)

---

## 1. Introduction and goals

### 1.1 Purpose

Theralert is a notification web application for assisted-living facilities and nursing homes. Facility staff record what a resident (patient) is doing throughout the day and schedule upcoming activities, therapy sessions and doctor's appointments. The patient and their family members see those items on a shared calendar and are notified by email and live in-app alerts.

Theralert deliberately stores **no personal medical information**. A user account consists only of a name, an email address, a password hash and a role. Calendar items are scheduling information ("Physical therapy, Tue 9:00 AM"), not clinical records.

The system is **multi-tenant**: one deployment serves many facilities ("organizations"), each fully isolated from the others.

This document describes the Go rewrite of Theralert, which replaced an earlier Next.js/MySQL implementation.

### 1.2 Requirements overview

| ID | Requirement | Realized by |
|---|---|---|
| FR-01 | Facilities can create their own organization and first admin (self-serve), and a fresh install can be bootstrapped. | `/signup`, `/setup` (§6.4) |
| FR-02 | Admins create staff accounts for their organization. | `/admin/staff` |
| FR-03 | Admins promote staff to admin and demote admins; the last admin can never be removed. | `/admin/role`, last-admin guard (§6.9) |
| FR-04 | Admins can permanently delete their organization and all its data, behind a strong confirmation. | `/admin/org/delete` (§6.10) |
| FR-05 | All users sign in with email and password. | `/login` (§6.3) |
| FR-06 | Patients and family members self-register into a facility using its facility code. | `/register` (§6.5) |
| FR-07 | Patient/family registration can be restricted to approved networks (IP allowlist). | `ALLOWED_CIDRS` (§8.6, §11) |
| FR-08 | Staff and patient/family users get different views and capabilities. | Role-based routes and templates (§8.6) |
| FR-09 | Staff create groups containing one patient and any number of family members. | `/groups` |
| FR-10 | Staff log activities in real time; they appear on the calendar and notify the group. | `/events` with "Log now" (§6.6) |
| FR-11 | Staff schedule one-time future events, which notify the group. | `/events` with "Schedule for…" |
| FR-12 | Staff create weekly recurring events, which notify the group. | `recurrence = weekly` (§6.8) |
| FR-13 | Events are color-coded by category: therapy, activity, doctor's appointment. | `events.category`, Tailwind theme colors |
| FR-14 | A month calendar is available to all members of a group and can be printed. | `/calendar`, print stylesheet |
| FR-15 | A real-time clock is shown in the facility's timezone. | `/clock` polled by HTMX, `TZ` |
| FR-16 | Notifications are delivered by email and live in the browser, and are kept in an in-app feed. | `notifyGroup`, SSE hub, `/notifications` (§8.9) |
| FR-17 | Users can selectively mute notifications: everything, by category, or by group. | `mute_prefs`, `/notifications/mute` |
| FR-18 | Users can change their password and delete their own account. | `/profile/*` |
| FR-19 | Logging out redirects to `theralert.aniwaghray.com`. | `LOGOUT_URL` |
| NFR-01 | No personal medical information is stored. | Schema design (§8.17) |

### 1.3 Quality goals

The top quality goals, in priority order, that shaped the architecture:

| Priority | Quality goal | Motivation |
|---|---|---|
| 1 | **Privacy and tenant isolation** | Facilities must never see each other's people or schedules; no medical data is stored. |
| 2 | **Operational simplicity** | Run by a single developer on a self-hosted server: one binary, one database, one `docker compose up`. |
| 3 | **Timeliness** | Family members should see a logged activity within about a second when the app is open. |
| 4 | **Usability for non-technical users** | Residents and relatives of all ages: plain server-rendered pages, large clear forms, a printable calendar. |
| 5 | **Maintainability** | A small, readable Go codebase with few dependencies and no frontend build toolchain at runtime. |

### 1.4 Stakeholders

| Stakeholder | Role / interest | Expectations of the architecture |
|---|---|---|
| Facility admin | Manages a facility's organization and staff | Can onboard without help, cannot accidentally orphan or destroy the organization. |
| Staff (caregivers, therapists, activity coordinators) | Log and schedule activities | Fast, simple logging; reliable delivery to families. |
| Patient / resident | Sees their own schedule | Readable calendar, no clinical data exposure. |
| Family member | Follows a resident's day remotely | Timely notifications, ability to mute noise, privacy. |
| Operator / developer (Anitej Waghray) | Builds, deploys and maintains the system | Single-binary deploys, understandable code, low running cost. |
| Prospective facility (future customer) | Evaluates and signs up | Self-serve onboarding; later, paid plans. |

---

## 2. Architecture constraints

### 2.1 Technical constraints

| Constraint | Detail |
|---|---|
| Language/runtime | Go 1.25 (`go.mod`: `go 1.25.6`). Production binary is statically linked (`CGO_ENABLED=0`). |
| No Node.js at runtime | The Next.js stack was intentionally removed. CSS is compiled at build time with the standalone Tailwind CLI. |
| Database | PostgreSQL 16 (container image `postgres:16-alpine`). |
| UI technology | Server-rendered HTML (`html/template`), HTMX 1.9.12 (vendored), Tailwind CSS 3.4.17. No SPA framework. |
| Packaging | Single container image (multi-stage Docker build, Alpine 3.20 runtime). All templates, static files and SQL migrations are embedded in the binary. |
| Hosting | Self-hosted Linux server running Docker Compose, fronted by a TLS-terminating reverse proxy (e.g. Cloudflare Tunnel). |
| Target platform | `linux/amd64` (the Dockerfile downloads the `tailwindcss-linux-x64` CLI). |

### 2.2 Organizational constraints

| Constraint | Detail |
|---|---|
| Team | One developer. Favors conventional, low-ceremony solutions over frameworks. |
| Budget | No paid infrastructure services required (no managed queue, cache or email platform). |
| Billing | Organizations exist, but no payment processor is integrated yet; self-serve signup is controlled by a flag. |
| Domain | Production lives at `theralert.aniwaghray.com`; logout returns users there. |

### 2.3 Privacy and regulatory constraints

- No medical, diagnostic or treatment data fields exist in the schema. Accounts hold only name, email, password hash and role.
- Event titles and descriptions are free text written by staff. The *system* does not require medical data, but a user *could* type it. This is managed as a policy risk (see §11 and R-07 in §12).
- Passwords are never stored or logged in plain text (bcrypt).

### 2.4 Conventions

- Standard Go layout: `cmd/` for entrypoints, `internal/` for non-importable application packages.
- `gofmt` formatting, idiomatic error returns, no panics for control flow.
- All SQL lives in `internal/models`. Handlers never build SQL.
- All state-changing actions are HTTP `POST` and follow Post/Redirect/Get (§8.12).
- Times are stored as `TIMESTAMPTZ` and converted to the display timezone only when rendered (§8.7).

---

## 3. Context and scope

### 3.1 Business context (C4 Level 1 — System Context)

```mermaid
flowchart TB
    admin["Facility Admin<br/>[Person]<br/>Manages the organization,<br/>staff and admin roles"]
    staff["Staff Member<br/>[Person]<br/>Logs activities and<br/>schedules events"]
    patient["Patient / Resident<br/>[Person]<br/>Views own schedule"]
    family["Family Member<br/>[Person]<br/>Follows a resident and<br/>receives notifications"]
    prospect["Prospective Facility<br/>[Person]<br/>Signs up a new organization"]

    theralert["Theralert<br/>[Software System]<br/>Multi-tenant scheduling and<br/>notification web app"]

    smtp["SMTP Mail Service<br/>[External System]<br/>e.g. Gmail SMTP"]
    inbox["Recipients' Email Inboxes<br/>[External System]"]
    site["theralert.aniwaghray.com<br/>[External Website]<br/>Logout landing page"]

    admin -->|"Manages org, staff, roles (HTTPS)"| theralert
    staff -->|"Logs and schedules events (HTTPS)"| theralert
    patient -->|"Views calendar, notifications (HTTPS)"| theralert
    family -->|"Views calendar, mutes, gets live alerts (HTTPS + SSE)"| theralert
    prospect -->|"Creates organization (HTTPS)"| theralert
    theralert -->|"Sends notification emails (SMTP/STARTTLS)"| smtp
    smtp -->|"Delivers"| inbox
    inbox -.->|"Read by"| family
    inbox -.->|"Read by"| patient
    theralert -.->|"Redirects on logout"| site
```

| Actor / system | Interactions with Theralert |
|---|---|
| Facility Admin | Creates the organization (`/signup` or `/setup`), creates staff, promotes/demotes admins, deletes the organization. Also has every staff capability. |
| Staff Member | Creates and deletes groups, logs/schedules/deletes events, views all calendars in the organization. |
| Patient | Registers with a facility code, views calendars of groups they are the patient of, manages notifications and mute settings. |
| Family Member | Registers with a facility code, is added to groups by staff, views those calendars, receives notifications, mutes them selectively. |
| Prospective Facility | Uses `/signup` to create a new organization (when `SIGNUP_OPEN=true`). |
| SMTP Mail Service | Receives notification emails from Theralert for delivery. Optional — without it, in-app notifications still work. |

### 3.2 Technical context

| Interface | Peer | Protocol / format | Port | Direction | Notes |
|---|---|---|---|---|---|
| Web UI | Browser | HTTP/1.1; HTML pages, `application/x-www-form-urlencoded` form posts, HTMX fragment GETs | 3002 (TLS terminated at proxy) | Inbound | All mutations are `POST`. |
| Live notification stream | Browser `EventSource` | Server-Sent Events, `text/event-stream` | 3002 | Inbound, long-lived | Endpoint `/sse`; one stream per open tab. |
| Database | PostgreSQL 16 | Postgres wire protocol via `pgx/v5` connection pool | 5432 (container network) | Outbound | `sslmode=disable` on the private Compose network. |
| Mail | SMTP server | SMTP with STARTTLS (when advertised), `AUTH PLAIN` | 587 by default | Outbound | Go `net/smtp`; port 465 implicit TLS is not supported. |
| Logout | External site | HTTP `303` redirect | — | — | Target configured by `LOGOUT_URL`. |
| Static assets | Browser | `GET /static/*` served from the embedded file system | 3002 | Inbound | CSS URL carries a content hash for cache busting. |

### 3.3 Out of scope

- Clinical or medical records, medication administration, care plans.
- Payments and subscription billing (planned; see §12.4).
- Native mobile apps (the web UI is responsive).
- SMS/push notifications.
- Single sign-on and federated identity.

---

## 4. Solution strategy

| Goal / problem | Strategy | Detail |
|---|---|---|
| Simple operations | **Single static Go binary** with embedded assets and migrations; one Postgres container. | §7, ADR-001, ADR-011 |
| Avoid frontend complexity | **Server-side rendering** with `html/template`; **HTMX** for the clock and badge; a few lines of inline JS for live toasts. | §8.10, ADR-002 |
| Many facilities, one deployment | **Shared-schema multi-tenancy**: every tenant-owned row carries `org_id` and every query is scoped by it. | §8.4, ADR-004 |
| Live notifications | **Server-Sent Events** from an in-process hub, plus persisted notification rows as the source of truth. | §8.8, ADR-009 |
| Reliable, timely email | Email sent **asynchronously** so SMTP latency never blocks the staff member's request. | §8.9, ADR-010 |
| Recurring events | Store one row per series; **expand weekly occurrences at read time** for the visible month. | §6.8, ADR-013 |
| Correct times | Store **UTC (`TIMESTAMPTZ`)**, render in one configured **IANA timezone**. | §8.7, ADR-014 |
| Security baseline | bcrypt passwords, HMAC-signed `HttpOnly`/`SameSite=Lax` session cookie, parameterized SQL, context-aware HTML escaping, role-based middleware. | §8.5, §8.6, §11 |
| Safe destructive actions | Last-admin guard, password confirmation for account deletion, type-the-facility-code confirmation for organization deletion. | §6.9, §6.10, ADR-017 |
| No stale UI after deploys | **Content-hashed CSS URL** generated at startup. | §8.10, ADR-016 |

---

## 5. Building block view

### 5.1 Level 1 — Containers (C4 Level 2)

```mermaid
flowchart LR
    user(["User<br/>[Person]"])

    subgraph client["User's device"]
        browser["Web Browser<br/>[Container: HTML + HTMX 1.9.12 + Tailwind CSS]<br/>Renders server pages, polls clock and badge,<br/>holds an EventSource for live alerts"]
    end

    subgraph host["Theralert host (Docker Compose)"]
        app["Theralert Server<br/>[Container: Go 1.25 binary, Alpine 3.20]<br/>HTTP server, routing, auth, business logic,<br/>templates, SSE hub, SMTP client"]
        db[("PostgreSQL 16<br/>[Container: postgres:16-alpine]<br/>Organizations, users, groups, events,<br/>notifications, mute preferences")]
    end

    proxy["Reverse Proxy / Tunnel<br/>[External: e.g. Cloudflare Tunnel]<br/>TLS termination, public hostname"]
    smtp["SMTP Mail Service<br/>[External System]"]

    user --> browser
    browser -->|"HTTPS"| proxy
    proxy -->|"HTTP :3002"| app
    app -->|"SQL via pgx pool (TCP 5432)"| db
    app -->|"SMTP + STARTTLS (587)"| smtp
```

| Container | Technology | Responsibility | Persistence |
|---|---|---|---|
| Web Browser | HTML5, HTMX 1.9.12, Tailwind CSS, `EventSource` | Displays pages, submits forms, polls `/clock` (1 s) and `/notifications/count` (20 s), shows live toasts from `/sse`. | Session cookie only. |
| Theralert Server | Go 1.25, chi v5, pgx v5, gorilla/sessions, `html/template`, `net/smtp` | All application behavior. Stateless except for the in-memory SSE subscriber registry. | None on disk. |
| PostgreSQL | PostgreSQL 16 | System of record. | Docker volume `theralert_db_data`. |
| Reverse proxy | Operator's choice (Cloudflare Tunnel recommended in README) | Public TLS endpoint and hostname. | — |
| SMTP service | Any SMTP submission server | Email delivery. | — |

### 5.2 Level 2 — Components of the Theralert Server (C4 Level 3)

```mermaid
flowchart TB
    subgraph server["Theralert Server (Go binary)"]
        main["cmd/server — Composition root<br/>Loads config, connects DB, runs migrations,<br/>wires dependencies, defines routes, starts http.Server"]
        router["chi Router + Middleware<br/>Logger → Recoverer → LoadUser<br/>→ RequireAuth → RequireRole"]

        subgraph handlers["internal/handlers — HTTP handlers"]
            hOnb["Onboarding & Auth<br/>setup, signup, login,<br/>register, logout"]
            hAdm["Admin<br/>staff, roles, org delete"]
            hGrp["Groups<br/>create, list, delete"]
            hCal["Calendar & Events<br/>month grid, create/delete,<br/>recurrence expansion"]
            hNot["Notifications<br/>feed, badge, mute, fan-out"]
            hPro["Profile & Dashboard<br/>password, delete account"]
            hRt["Clock & SSE endpoints"]
        end

        auth["internal/auth<br/>Session Manager, bcrypt,<br/>user-in-context, RBAC middleware"]
        store["internal/models — Store (repository)<br/>All SQL, entity types, mute logic"]
        dbp["internal/db<br/>pgxpool + embedded migrations"]
        hub["internal/realtime — SSE Hub<br/>per-user channel registry"]
        mail["internal/email — SMTP Sender"]
        render["web — Renderer<br/>embedded templates & static,<br/>cssURL + tfmt helpers"]
        cfg["internal/config<br/>env → Config"]
    end

    pg[("PostgreSQL")]
    smtp["SMTP server"]

    main --> cfg
    main --> dbp
    main --> router
    router --> auth
    router --> handlers
    handlers --> auth
    handlers --> store
    handlers --> render
    hNot --> hub
    hNot --> mail
    hRt --> hub
    auth --> store
    store --> dbp
    dbp --> pg
    mail --> smtp
```

### 5.3 Package reference

#### `cmd/server` — composition root (`main.go`, 117 LOC)

- Loads `config.Config`; exits with `log.Fatalf` on any configuration error (fail fast).
- Opens the pgx pool (`db.Connect`) and applies migrations (`db.Migrate`).
- Constructs every dependency exactly once: `models.Store`, `auth.Manager`, `web.Renderer`, `realtime.Hub`, `email.Sender`, and the `handlers.Handlers` struct that holds them (constructor injection by struct).
- Builds the chi router, global middleware, the embedded static file server and four route tiers (public, authenticated, staff/admin, admin). See Appendix A.
- Starts `http.Server{Addr, Handler, ReadHeaderTimeout: 10s}` with `ListenAndServe`.

#### `internal/config` — configuration (`config.go`, 120 LOC)

- `Config` struct: `Addr`, `BaseURL`, `LogoutURL`, `DatabaseURL`, `SessionSecret`, `SecureCookies`, `SignupOpen`, SMTP fields, `AllowedCIDRs []*net.IPNet`, `Location *time.Location`.
- `Load()` reads environment variables, optionally from a `.env` file (`godotenv.Load`, which never overrides variables that are already set).
- Validates: `SESSION_SECRET` and `DATABASE_URL` are required; `TZ` must be a valid IANA zone; every `ALLOWED_CIDRS` entry must parse (bare IPs become `/32` or `/128`).
- `RegistrationAllowed(ip)` returns `true` when the allowlist is empty, otherwise checks CIDR membership.

#### `internal/db` — database access foundation (`db.go`, 61 LOC; `migrations/0001_init.sql`, 75 LOC)

- `Connect(ctx, url)` creates a `pgxpool.Pool` and pings it. Pool size uses pgx defaults (`max(4, runtime.NumCPU())` connections) unless `pool_max_conns` is added to `DATABASE_URL`.
- `Migrate(ctx)` reads every embedded `migrations/*.sql` file in lexical order and executes it. Migrations are idempotent (`IF NOT EXISTS`), so they run on every startup. There is no migration-version table (see TD-04).

#### `internal/models` — entities and the Store (5 files, 565 LOC)

- `models.go`: plain structs `Organization`, `User` (with `IsStaffSide()` = admin or staff), `Group`, `Event`, `Notification`. Nullable columns map to pointer fields (`*int64`, `*time.Time`).
- `Store` wraps the pool and is the only place SQL is written (repository pattern). Every query uses positional parameters (`$1…`). `pgx.ErrNoRows` is translated to the sentinel `models.ErrNotFound`.
- `IsMuted(prefs, category, groupID)` is a pure function implementing mute precedence (§8.9).
- Full method list: §5.6.

#### `internal/auth` — authentication and authorization (`auth.go`, 120 LOC)

- `Manager` owns a `sessions.CookieStore` and a reference to the Store.
- `HashPassword` / `CheckPassword`: bcrypt at `DefaultCost` (10).
- `Login` / `Logout` write or expire the `theralert_session` cookie (§8.5).
- Middleware:
  - `LoadUser` (global): reads `uid` from the session, loads the user, stores it in the request context under an unexported key type.
  - `RequireAuth`: redirects anonymous users to `/login` (`303`).
  - `RequireRole(roles...)`: middleware factory; responds `403 Forbidden` if the user's role is not allowed.
- `UserFrom(ctx)` returns the current `*models.User` or `nil`.

#### `internal/handlers` — HTTP handlers (7 files, 1,022 LOC)

- `Handlers` struct holds `Cfg`, `Store`, `Auth`, `View`, `Hub`, `Email`, `Loc`. Each route handler is a method on `*Handlers`.
- `view(r)` builds the common template data map (`User`, `Org`, `Unread`).
- Files: `handlers.go` (onboarding, auth, dashboard, admin users, profile, clock, SSE), `admin.go` (role change, org deletion), `groups.go`, `calendar.go` (calendar, events, recurrence), `notify.go` (fan-out and email body), `notifications_handlers.go` (feed, badge, mutes), `util.go` (`slugify`, `urlEncode`).
- Full catalogue: §5.5.

#### `internal/realtime` — SSE hub (`hub.go`, 83 LOC)

- `Hub{mu sync.RWMutex; clients map[int64]map[chan string]struct{}}` — for each user, the set of channels of that user's open streams (one per browser tab).
- `ServeHTTP(w, r, userID)` registers a buffered channel (capacity 8), writes an initial comment, then loops on `select` over the request context and the channel, flushing each message.
- `Notify(userID, event, data)` formats an SSE frame and performs a **non-blocking** send to each of the user's channels; a full buffer drops the message rather than blocking the producer.

#### `internal/email` — SMTP sender (`email.go`, 60 LOC)

- `Sender` holds host, port, credentials, from-address and the display location.
- `Enabled()` is false when `SMTP_HOST` is empty; `Send` is then a no-op.
- `Send(to, subject, htmlBody)` builds an RFC 5322 message with `From`, `To`, `Subject`, `Date` (in the configured timezone), MIME headers and an HTML body, and calls `smtp.SendMail`. `net/smtp` upgrades with STARTTLS when the server offers it, and `PlainAuth` refuses to send credentials over an unencrypted connection to a non-localhost server.

#### `web` — presentation (`render.go`, 109 LOC; 11 templates; static assets)

- `//go:embed templates/*.html` and `//go:embed static` compile the UI into the binary.
- `NewRenderer(loc)` parses `layout.html` together with each page template into a separate template set per page, and registers two template functions: `cssURL` (stylesheet URL plus FNV-32a hash of `app.css`) and `tfmt` (format a time in the configured zone).
- `Render(w, status, page, data)` executes into a buffer first, then writes headers, status and body, so a template error can never produce a half-written page.
- `RenderPartial` exists for HTMX fragments but is currently unused.

### 5.4 Package dependency rules

```mermaid
flowchart LR
    main["cmd/server"] --> config & db & models & auth & handlers & realtime & email & web
    handlers --> auth & config & email & models & realtime & web
    auth --> models
    models --> pgx["pgx/v5"]
    db --> pgx
    web --> stdlib["html/template, embed"]
    realtime --> nethttp["net/http"]
    email --> smtp["net/smtp"]
```

Rules that the code follows:

- Dependencies point inward toward `models`; `models` depends on nothing in the application except the database driver.
- Only `cmd/server` knows about every package; it is the only place where wiring happens.
- `handlers` is the only package that combines business rules with HTTP concerns.
- `realtime`, `email` and `web` know nothing about the domain (they move strings and bytes).
- No package imports `cmd/server`, and `internal/` packages cannot be imported from outside the module.

### 5.5 HTTP handler catalogue

| Handler | File | Route(s) | Reads | Writes | Template / response |
|---|---|---|---|---|---|
| `Root` | handlers.go | `GET /` | context user | — | `303` → `/dashboard` or `/login` |
| `Clock` | handlers.go | `GET /clock` | `Loc` | — | text fragment `Mon Jan 2 · 3:04:05 PM MST` |
| `SetupForm` / `Setup` | handlers.go | `GET/POST /setup` | `CountOrganizations` | org + admin via `createOrgAndAdmin` | `setup`; `303` → `/admin` |
| `SignupForm` / `Signup` | handlers.go | `GET/POST /signup` | `Cfg.SignupOpen` | org + admin via `createOrgAndAdmin` | `signup`; `403` when closed; `303` → `/admin` |
| `LoginForm` / `Login` | handlers.go | `GET/POST /login` | `CountOrganizations`, `UserByEmail` | session cookie | `login`; `401` on failure; `303` → `/dashboard` |
| `RegisterForm` / `Register` | handlers.go | `GET/POST /register` | `clientIP`, `OrganizationBySlug`, `EmailExists` | user (patient/family), session | `register`; `403` off-network; `303` → `/dashboard` |
| `Logout` | handlers.go | `POST /logout` | — | expires cookie | `303` → `LOGOUT_URL` |
| `Dashboard` | handlers.go | `GET /dashboard` | `view` | — | `dashboard` (staff vs patient/family layout) |
| `Admin` | handlers.go | `GET /admin` | `UsersByOrg` | — | `admin` |
| `CreateStaff` | handlers.go | `POST /admin/staff` | `EmailExists` | user (staff) | `303` → `/admin?flash=…` |
| `SetRole` | admin.go | `POST /admin/role` | `UserByID`, `CountAdmins` | `users.role` | `303` → `/admin?flash|error=…` |
| `DeleteOrg` | admin.go | `POST /admin/org/delete` | `OrganizationByID` | deletes org (cascade) | `303` → `/setup` |
| `Profile` | handlers.go | `GET /profile` | `view` | — | `profile` |
| `ChangePassword` | handlers.go | `POST /profile/password` | current hash | `users.password_hash` | `303` → `/profile?flash=…` |
| `DeleteAccount` | handlers.go | `POST /profile/delete` | `CountAdmins` | deletes user (cascade) | `409` if last admin; `303` → `LOGOUT_URL` |
| `Groups` | groups.go | `GET /groups` | `GroupsForOrg`, `GroupMembers` (per group), `UsersByOrg(patient)` | — | `groups` |
| `CreateGroup` | groups.go | `POST /groups` | `UserByID`, `UserByEmail` | group, memberships | `303` → `/groups?flash|error=…` |
| `DeleteGroup` | groups.go | `POST /groups/delete` | — | deletes group (cascade) | `303` → `/groups?flash=…` |
| `Calendar` | calendar.go | `GET /calendar` | `GroupsForOrg` or `GroupsForUser`, `EventsForCalendar`, `RecentEvents` | — | `calendar` |
| `CreateEvent` | calendar.go | `POST /events` | `GroupByID` | event, notifications | `303` → `/calendar?group=…` |
| `DeleteEvent` | calendar.go | `POST /events/delete` | — | deletes event (cascade) | `303` → `/calendar?group=…` |
| `Notifications` | notifications_handlers.go | `GET /notifications` | `NotificationsForUser(50)`, `MutePrefs`, `GroupsForUser` | — | `notifications` |
| `NotifCount` | notifications_handlers.go | `GET /notifications/count` | `UnreadCount` | — | badge HTML fragment (empty, `1`–`9`, or `9+`) |
| `MarkRead` | notifications_handlers.go | `POST /notifications/read` | — | `notifications.read_at` | `303` → `/notifications` |
| `SetMutes` | notifications_handlers.go | `POST /notifications/mute` | `GroupsForUser` | `mute_prefs` (upsert each scope) | `303` → `/notifications?flash=…` |
| `Events` | handlers.go | `GET /sse` | — | Hub registration | `text/event-stream` |

### 5.6 Data access catalogue (`models.Store`)

| Method | SQL | Tables | Tenant-scoped in SQL? | Used by |
|---|---|---|---|---|
| `CreateOrganization` | INSERT … RETURNING | organizations | n/a | `createOrgAndAdmin` |
| `OrganizationByID` | SELECT | organizations | by id | `view`, `DeleteOrg` |
| `OrganizationBySlug` | SELECT | organizations | by slug | `Register`, `createOrgAndAdmin` |
| `CountOrganizations` | SELECT count | organizations | global (bootstrap check) | `Setup*`, `LoginForm` |
| `CreateUser` | INSERT … RETURNING | users | `org_id` set explicitly | onboarding, `CreateStaff` |
| `UserByEmail` | SELECT | users | global (email is globally unique) | `Login`, `CreateGroup` (then org-checked) |
| `UserByID` | SELECT | users | global (then org-checked by caller) | `LoadUser`, `SetRole`, `CreateGroup` |
| `EmailExists` | SELECT EXISTS | users | global | onboarding, `CreateStaff` |
| `UsersByOrg` | SELECT … ORDER BY | users | **yes** | `Admin`, `Groups` |
| `DeleteUser` | DELETE | users (+cascades) | by id (self) | `DeleteAccount` |
| `UpdatePassword` | UPDATE | users | by id (self) | `ChangePassword` |
| `SetRole` | UPDATE | users | by id (org-checked by caller) | `SetRole` |
| `CountAdmins` | SELECT count | users | **yes** | last-admin guard |
| `DeleteOrganization` | DELETE | organizations (+cascades) | by id (own org) | `DeleteOrg` |
| `CreateGroup` | INSERT … RETURNING | groups | `org_id` set explicitly | `CreateGroup` |
| `AddGroupMember` | INSERT … ON CONFLICT DO NOTHING | group_members | via group | `CreateGroup` |
| `GroupByID` | SELECT + LEFT JOIN users | groups, users | **yes** | `CreateEvent` |
| `GroupsForOrg` | SELECT + LEFT JOIN | groups, users | **yes** | `Groups`, `Calendar` |
| `GroupsForUser` | SELECT DISTINCT + joins | groups, users, group_members | by membership | `Calendar`, `Notifications`, `SetMutes` |
| `GroupMembers` | SELECT + JOIN | users, group_members | via group | `Groups` |
| `GroupRecipients` | SELECT … UNION | users, groups, group_members | via group | `notifyGroup` |
| `DeleteGroup` | DELETE | groups (+cascades) | **yes** | `DeleteGroup` |
| `UserInGroup` | SELECT EXISTS … UNION | groups, group_members | via group | currently unused |
| `CreateEvent` | INSERT … RETURNING | events | `org_id` set explicitly | `CreateEvent` |
| `EventsForCalendar` | SELECT (window + all weekly) | events | via authorized group | `Calendar` |
| `RecentEvents` | SELECT … ORDER BY created_at DESC LIMIT | events | via authorized group | `Calendar` |
| `DeleteEvent` | DELETE | events (+cascades) | **yes** | `DeleteEvent` |
| `CreateNotification` | INSERT … RETURNING | notifications | `org_id` set explicitly | `notifyGroup` |
| `NotificationsForUser` | SELECT … LIMIT | notifications | by user | `Notifications` |
| `UnreadCount` | SELECT count | notifications | by user | `view`, `NotifCount` |
| `MarkAllRead` | UPDATE | notifications | by user | `MarkRead` |
| `MutePrefs` | SELECT | mute_prefs | by user | `notifyGroup`, `Notifications` |
| `SetMute` | INSERT … ON CONFLICT DO UPDATE | mute_prefs | by user | `SetMutes` |

### 5.7 Presentation layer

**Templates** (`web/templates`, each composed with `layout.html`):

| Template | Audience | Content |
|---|---|---|
| `layout.html` | all | HTML shell, favicon, hashed stylesheet, HTMX script; when signed in: navigation (role-aware links), live clock, notification bell + badge, user name/role, logout form, toast container and EventSource script. |
| `setup.html` | first-run operator | Facility name, facility code, first admin's name/email/password. |
| `signup.html` | prospective facility | Same fields as setup; "closed" message when `SIGNUP_OPEN=false`. |
| `login.html` | everyone | Email/password; links to `/register` and `/signup`. |
| `register.html` | patients, family | Facility code, name, email, role (patient/family), password with policy hint. |
| `dashboard.html` | all | Staff: cards linking to Groups, Calendar, Admin (admins). Patient/family: cards linking to Calendar and Notifications. |
| `admin.html` | admins | Create-staff form; people table with role badges and Make admin / Demote to staff actions; Danger-zone org deletion. |
| `groups.html` | staff, admins | Create-group form (name, patient dropdown, family emails); group cards with members, calendar link, delete. |
| `calendar.html` | all | Group selector, month navigation, legend, 7-column month grid with color-coded occurrences (↻ marks weekly), print button; staff sidebar with the event form; recent events list (delete for staff). |
| `notifications.html` | all | Feed with unread markers, Mark all read, mute checkboxes. |
| `profile.html` | all | Account details, change password, delete account. |

**Static assets** (`web/static`, embedded): `css/input.css` (Tailwind source with component classes and print rules) → `css/app.css` (compiled at build time, git-ignored), `js/htmx.min.js` (HTMX 1.9.12, vendored), `favicon.ico`.

**Role-based views**

| UI element | Admin | Staff | Patient | Family |
|---|---|---|---|---|
| Nav: Dashboard, Calendar, Profile, bell, clock | ✓ | ✓ | ✓ | ✓ |
| Nav: Groups | ✓ | ✓ | — | — |
| Nav: Admin | ✓ | — | — | — |
| Calendar: group selector scope | all org groups | all org groups | own groups | own groups |
| Calendar: event form and delete buttons | ✓ | ✓ | — | — |
| Notifications feed and mutes | ✓ (usually empty) | ✓ (usually empty) | ✓ | ✓ |

---

## 6. Runtime view

### 6.1 Startup

```mermaid
sequenceDiagram
    autonumber
    participant M as main()
    participant C as config.Load
    participant D as db (pgxpool)
    participant PG as PostgreSQL
    participant R as web.NewRenderer
    M->>C: Load()
    C-->>M: Config (or error, then log.Fatalf)
    M->>D: Connect(ctx, DATABASE_URL)
    D->>PG: open pool, Ping
    M->>D: Migrate(ctx)
    D->>PG: exec embedded 0001_init.sql (IF NOT EXISTS)
    M->>M: NewStore, auth.NewManager, realtime.NewHub, email.New
    M->>R: NewRenderer(Location)
    R->>R: parse layout + each page, hash app.css (FNV-32a)
    M->>M: build chi router, middleware, routes
    M->>M: http.Server.ListenAndServe(":3002")
```

Any failure before `ListenAndServe` terminates the process with a descriptive log line (fail fast). In Docker Compose the app waits for the database container's health check before starting.

### 6.2 Generic request pipeline

```mermaid
flowchart LR
    req["HTTP request"] --> L["middleware.Logger<br/>logs method, path, status, duration"]
    L --> RC["middleware.Recoverer<br/>panic → 500"]
    RC --> LU["auth.LoadUser<br/>cookie → uid → UserByID → context"]
    LU --> RT{"chi route match"}
    RT -->|public| H["Handler"]
    RT -->|authenticated tier| RA["RequireAuth<br/>no user → 303 /login"]
    RT -->|staff tier| RA2["RequireAuth → RequireRole(admin, staff)<br/>wrong role → 403"]
    RT -->|admin tier| RA3["RequireAuth → RequireRole(admin)"]
    RA --> H
    RA2 --> H
    RA3 --> H
    H --> V["view(r): User, Org, Unread"]
    H --> S["Store → PostgreSQL"]
    H --> T["Renderer.Render → buffer → response<br/>or 303 redirect (PRG)"]
```

Note that `LoadUser` runs for every request, including `/static/*` and the once-per-second `/clock` poll; each such request performs one `UserByID` query when a session cookie is present (see TD-02).

### 6.3 Login and session establishment

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant B as Browser
    participant A as Theralert
    participant DB as PostgreSQL
    U->>B: submit email + password
    B->>A: POST /login
    A->>DB: SELECT … FROM users WHERE email = $1
    DB-->>A: user row (with bcrypt hash)
    A->>A: bcrypt.CompareHashAndPassword
    alt invalid email or password
        A-->>B: 401 + login page "Invalid email or password."
    else valid
        A->>A: session.Values["uid"] = id, gob-encode, HMAC-SHA256 sign
        A-->>B: 303 → /dashboard + Set-Cookie theralert_session (HttpOnly, SameSite=Lax, 7 days)
        B->>A: GET /dashboard (cookie)
        A->>A: LoadUser verifies signature, reads uid
        A->>DB: SELECT user by id
        A-->>B: 200 dashboard (staff or patient/family variant)
    end
```

The error message is identical for unknown email and wrong password, which avoids revealing which emails are registered at login.

### 6.4 Self-serve organization signup (and first-run setup)

```mermaid
sequenceDiagram
    autonumber
    actor P as Prospective admin
    participant A as Theralert
    participant DB as PostgreSQL
    P->>A: GET /signup
    alt SIGNUP_OPEN = false
        A-->>P: 200 "signups are currently closed"
    else open
        A-->>P: 200 signup form
        P->>A: POST /signup (orgname, slug, name, email, password)
        A->>A: slugify(slug), validate required fields and password policy
        A->>DB: EmailExists(email)
        A->>DB: OrganizationBySlug(slug)
        alt email taken or slug taken or invalid
            A-->>P: 400 form re-rendered with message and entered values
        else ok
            A->>DB: INSERT organizations (name, slug)
            A->>A: bcrypt hash password
            A->>DB: INSERT users (org_id, …, role = 'admin')
            A-->>P: 303 → /admin + session cookie
        end
    end
```

`/setup` uses the same `createOrgAndAdmin` helper but is only available while **no** organization exists; afterwards it redirects to `/login`. `/login` itself redirects to `/setup` on an empty database. The pre-checks on email and slug prevent the common case of creating an organization whose admin insert then fails; a race between two simultaneous signups with the same values could still leave an organization without an admin, because the two inserts are not in one transaction (TD-07).

### 6.5 Patient / family registration with the network gate

```mermaid
sequenceDiagram
    autonumber
    actor F as Patient or family member
    participant A as Theralert
    participant DB as PostgreSQL
    F->>A: POST /register (org, name, email, role, password)
    A->>A: clientIP = first X-Forwarded-For entry, else RemoteAddr
    alt ALLOWED_CIDRS set and IP not in any range
        A-->>F: 403 "Registration is not permitted from your network"
    else allowed
        A->>A: role must be patient or family
        A->>DB: OrganizationBySlug(slugify(org))
        A->>A: password policy
        A->>DB: EmailExists(email)
        A->>DB: INSERT users (org_id, name, email, hash, role)
        A-->>F: 303 → /dashboard + session cookie
    end
```

Staff and admin accounts can never be created through `/register`; they come only from `/admin/staff`, organization creation, or promotion.

### 6.6 Logging an event and notification fan-out

This is the central business scenario.

```mermaid
sequenceDiagram
    autonumber
    actor S as Staff member
    participant A as Theralert (CreateEvent)
    participant DB as PostgreSQL
    participant H as SSE Hub
    participant G as email goroutine
    participant M as SMTP server
    actor F as Family member (tab open)
    S->>A: POST /events (group_id, title, category, when, datetime, recurrence)
    A->>DB: GroupByID(org_id, group_id)
    A->>A: normalize category and recurrence, require title
    A->>A: start = now, or ParseInLocation(datetime, TZ)
    A->>DB: INSERT events … RETURNING id
    A->>DB: GroupRecipients(group) → patient and family
    loop each recipient
        A->>DB: MutePrefs(user)
        alt muted (all, category or this group)
            A->>A: skip recipient
        else not muted
            A->>DB: INSERT notifications (message)
            A->>H: Notify(user, "notify", message)
            H-->>F: event: notify / data: "Therapy: PT — Tue Jun 9 at 9:00 AM EDT"
            A-)G: go Send(email, subject, html)
            G->>M: SMTP (STARTTLS, AUTH, MAIL, RCPT, DATA)
        end
    end
    A-->>S: 303 → /calendar?group=…&flash=Event+added.
    F->>F: toast for 8 s, htmx GET /notifications/count → badge
```

Key properties:

- The database writes for the event and the notification rows, and the in-memory SSE push, happen **inside the request**. The cost is `1 + 2N` database round-trips for `N` recipients.
- Email is sent in a **separate goroutine per recipient**; SMTP failures are ignored and never affect the staff member's response.
- The persisted notification row is the source of truth; the SSE push is a best-effort accelerator. A user without an open tab sees the item in the bell badge (polled every 20 s) and on `/notifications`.
- Notifications are sent **once, when the event is created**. There are no reminders when a scheduled or recurring event actually occurs (see §12.4).

### 6.7 Live notification stream (SSE lifecycle)

```mermaid
sequenceDiagram
    autonumber
    participant B as Browser (layout script)
    participant A as Theralert (/sse handler goroutine)
    participant H as Hub
    B->>A: GET /sse (EventSource, session cookie)
    A->>A: RequireAuth, assert http.Flusher
    A->>H: add(userID) → buffered chan (cap 8)
    A-->>B: 200 text/event-stream ": connected"
    loop until client disconnects
        alt message on channel
            H-->>A: "event: notify\ndata: …\n\n"
            A-->>B: write + Flush
        else request context done
            A->>H: remove(userID, chan), close(chan)
        end
    end
    Note over B,A: EventSource reconnects automatically after a drop
```

Concurrency characteristics:

- Each open tab holds one goroutine and one channel on the server.
- `add`/`remove` take the write lock; `Notify` takes the read lock, so many notifications can be published concurrently.
- Because `Notify` never blocks, a slow or stuck client cannot stall the request that created the event; at worst that client misses a live toast but still has the persisted notification.
- The hub is in-process memory: with more than one server instance, a user connected to instance A would not receive pushes produced on instance B (see R-05).
- There is no periodic heartbeat; idle streams may be closed by intermediaries (Cloudflare closes idle connections after about 100 s) and are re-opened by the browser.

### 6.8 Calendar rendering and recurrence expansion

```mermaid
flowchart TB
    a["GET /calendar?group=&y=&m="] --> b{"staff side?"}
    b -->|yes| c["GroupsForOrg(org)"]
    b -->|no| d["GroupsForUser(user)"]
    c --> e["selected = requested group if it is in the allowed list, else the first"]
    d --> e
    e --> f["month from y and m, default current month in TZ"]
    f --> g["grid = Sunday on/before the 1st up to the Sunday after month end"]
    g --> h["EventsForCalendar(group, gridStart, gridEnd)<br/>one-time events inside the window<br/>plus every weekly series that started before gridEnd"]
    h --> i["expandOccurrences:<br/>one-time → single occurrence<br/>weekly → advance by 7 days to the window, then step weekly"]
    i --> j["bucket occurrences by local date YYYY-MM-DD"]
    j --> k["build weeks of dayCell (Date, InMonth, IsToday, Occurrences)"]
    k --> l["render calendar.html + RecentEvents(8)"]
```

- The grid always contains whole weeks (4–6 rows).
- `time.AddDate(0, 0, 7)` operates on wall-clock time in the configured location, so a weekly 9:00 AM session stays at 9:00 AM across daylight-saving transitions.
- Authorization is implicit: the selected group is always drawn from the list the user is allowed to see, so requesting another tenant's group ID silently falls back to the user's first group.
- Weekly series have no end date and no per-occurrence exceptions; deleting the event removes the entire series.

### 6.9 Admin role change and the last-admin guard

```mermaid
sequenceDiagram
    autonumber
    actor Ad as Admin
    participant A as Theralert
    participant DB as PostgreSQL
    Ad->>A: POST /admin/role (user_id, role)
    A->>A: role must be admin or staff
    A->>DB: UserByID(user_id)
    alt target missing or in another organization
        A-->>Ad: 303 /admin?error=User not found in your organization.
    else target is patient or family
        A-->>Ad: 303 /admin?error=Only staff and admins can change role.
    else demoting an admin
        A->>DB: CountAdmins(org)
        alt only one admin
            A-->>Ad: 303 /admin?error=You cannot demote the last admin…
        else
            A->>DB: UPDATE users SET role
            A-->>Ad: 303 /admin?flash=… is now staff.
        end
    else promoting staff
        A->>DB: UPDATE users SET role = 'admin'
        A-->>Ad: 303 /admin?flash=… is now admin.
    end
```

The same guard protects `/profile/delete`: the only admin of an organization receives `409 Conflict` and is told to promote someone or delete the organization.

### 6.10 Account deletion and organization deletion cascades

```mermaid
flowchart LR
    subgraph acct["POST /profile/delete"]
        a1["verify password"] --> a2{"last admin?"}
        a2 -->|yes| a3["409, keep account"]
        a2 -->|no| a4["DELETE FROM users WHERE id"]
        a4 --> a5["cascade: group_members, notifications, mute_prefs<br/>set NULL: groups.patient_id, groups.staff_id, events.created_by"]
        a5 --> a6["expire cookie, 303 → LOGOUT_URL"]
    end
    subgraph org["POST /admin/org/delete"]
        o1["browser confirm() dialog"] --> o2{"confirm == facility code?"}
        o2 -->|no| o3["303 /admin?error=…"]
        o2 -->|yes| o4["DELETE FROM organizations WHERE id"]
        o4 --> o5["cascade: users, groups, events, notifications,<br/>group_members, mute_prefs"]
        o5 --> o6["expire cookie, 303 → /setup"]
    end
```

Other members of a deleted organization keep a signed cookie, but `LoadUser` finds no user for its `uid`, so they are treated as signed out on their next request.

---

## 7. Deployment view

### 7.1 Production topology

```mermaid
flowchart TB
    internet(("Internet users"))
    subgraph edge["Edge"]
        cf["Reverse proxy / Cloudflare Tunnel<br/>TLS for theralert.aniwaghray.com"]
    end
    subgraph hostbox["Linux host (Docker Engine + Compose v2)<br/>project dir ~/containers/Theralert"]
        subgraph net["bridge network theralert_default"]
            app["container: theralert<br/>image built from Dockerfile<br/>/theralert, listens :3002<br/>restart: unless-stopped"]
            db[("container: theralert-db<br/>postgres:16-alpine :5432<br/>healthcheck pg_isready every 5 s<br/>restart: unless-stopped")]
        end
        vol[["volume: theralert_db_data<br/>/var/lib/postgresql/data"]]
        port["host port 3002 → container 3002"]
    end
    smtp["SMTP provider :587"]
    internet --> cf --> port --> app
    app -->|"postgres://…@db:5432/…?sslmode=disable"| db
    db --- vol
    app --> smtp
```

| Element | Configuration |
|---|---|
| `theralert` service | `build: .`, `container_name: theralert`, ports `3002:3002`, environment from `.env` interpolation (see Appendix B), `depends_on: db (service_healthy)`, `restart: unless-stopped`. |
| `db` service | `postgres:16-alpine`, `POSTGRES_DB/USER/PASSWORD` from `.env`, volume `theralert_db_data`, health check `pg_isready -U $DB_USER -d $DB_NAME` (interval 5 s, timeout 5 s, 10 retries), `restart: unless-stopped`. |
| Database URL | Built by Compose: `postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}?sslmode=disable`. |
| TLS | Terminated at the proxy. Set `SECURE_COOKIES=true` (Compose default) so the session cookie is only sent over HTTPS. |

### 7.2 Build pipeline (container image)

```mermaid
flowchart LR
    src["Source tree<br/>(.dockerignore excludes .git, .env,<br/>binaries, app.css, tailwind binary)"] --> s1
    subgraph s1["Stage 'build' — golang:1.25-bookworm"]
        b1["COPY go.mod go.sum → go mod download (cached layer)"] --> b2["COPY . ."]
        b2 --> b3["curl tailwindcss-linux-x64 v3.4.17<br/>tailwindcss -c tailwind.theralert.config.js<br/>-i web/static/css/input.css -o app.css --minify"]
        b3 --> b4["CGO_ENABLED=0 GOOS=linux<br/>go build -ldflags='-s -w' -o /theralert ./cmd/server<br/>(templates, CSS, JS, SQL embedded)"]
    end
    s1 --> s2
    subgraph s2["Stage runtime — alpine:3.20"]
        r1["apk add ca-certificates tzdata"] --> r2["COPY /theralert"] --> r3["EXPOSE 3002, ENTRYPOINT /theralert"]
    end
    s2 --> img["Image ≈ 35 MB (34.4 MB measured)"]
```

- `ca-certificates` is required for STARTTLS to the SMTP server; `tzdata` is required for `TZ` / `time.LoadLocation`.
- Because CSS is compiled inside the build, the embedded `app.css` always matches the templates in the same image.

### 7.3 Environments

| Environment | How it runs | Database | Notes |
|---|---|---|---|
| Local development (Windows) | `go run ./cmd/server` after compiling CSS with `tailwindcss.exe` (`make css` / `make run` with `TAILWIND=./tailwindcss.exe`) | Docker container `theralert-pg-dev` on host port 5433 | `.env` is loaded by godotenv; first run lands on `/setup`. |
| Production | `docker compose up -d --build` on the Linux host | `theralert-db` container + named volume | Behind the reverse proxy at `theralert.aniwaghray.com`. |

There is no separate staging environment.

### 7.4 Network and ports

| Port | Bound by | Exposure | Purpose |
|---|---|---|---|
| 3002/tcp | `theralert` container, published on the host | Should be reachable only by the reverse proxy | HTTP application traffic. |
| 5432/tcp | `theralert-db` container | Internal Compose network only (not published) | PostgreSQL. |
| 587/tcp (egress) | `theralert` container | Outbound to SMTP provider | Email. |

Publishing 3002 on all host interfaces means the app is also reachable without the proxy if the host firewall allows it (see S-09).

### 7.5 Persistence

- All durable state lives in PostgreSQL in the `theralert_db_data` volume. Removing the volume (`docker compose down -v`) erases all organizations.
- The application container is disposable: it holds no files and can be rebuilt at any time.
- In-memory state lost on restart: SSE subscriptions (browsers reconnect automatically) and the parsed template cache (rebuilt at startup).

### 7.6 Scaling characteristics

| Dimension | Current behavior | Limit / note |
|---|---|---|
| Vertical | Goroutine per request and per open SSE stream; pgx pool of `max(4, NumCPU)` connections. | Increase `pool_max_conns` in `DATABASE_URL` for heavier load. |
| Horizontal | Not supported as-is: the SSE hub is per-process. Everything else is stateless (sessions are client-side cookies). | Needs a shared pub/sub (Postgres `LISTEN/NOTIFY` or Redis) before running more than one instance. |
| Polling load | Each open tab issues 1 `/clock` request per second and 1 badge request per 20 s. | ≈1.05 requests/s per open tab, each costing at least one session-user query (TD-02). |

---

## 8. Cross-cutting concepts

### 8.1 Domain model

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : employs-or-serves
    ORGANIZATIONS ||--o{ GROUPS : owns
    ORGANIZATIONS ||--o{ EVENTS : owns
    ORGANIZATIONS ||--o{ NOTIFICATIONS : owns
    USERS |o--o{ GROUPS : "is patient of"
    USERS |o--o{ GROUPS : "created (staff_id)"
    GROUPS ||--o{ GROUP_MEMBERS : has
    USERS ||--o{ GROUP_MEMBERS : "belongs to"
    GROUPS ||--o{ EVENTS : schedules
    USERS |o--o{ EVENTS : "created_by"
    USERS ||--o{ NOTIFICATIONS : receives
    EVENTS |o--o{ NOTIFICATIONS : triggers
    USERS ||--o{ MUTE_PREFS : sets

    ORGANIZATIONS {
        bigserial id PK
        text name
        text slug UK
        text billing_status
        text allowed_cidrs
        timestamptz created_at
    }
    USERS {
        bigserial id PK
        bigint org_id FK
        text name
        text email UK
        text password_hash
        text role
        timestamptz created_at
    }
    GROUPS {
        bigserial id PK
        bigint org_id FK
        text name
        bigint patient_id FK
        bigint staff_id FK
        timestamptz created_at
    }
    GROUP_MEMBERS {
        bigint group_id PK
        bigint user_id PK
    }
    EVENTS {
        bigserial id PK
        bigint org_id FK
        bigint group_id FK
        text category
        text title
        text description
        timestamptz starts_at
        timestamptz ends_at
        text recurrence
        bigint created_by FK
        timestamptz created_at
    }
    NOTIFICATIONS {
        bigserial id PK
        bigint org_id FK
        bigint user_id FK
        bigint event_id FK
        text message
        timestamptz read_at
        timestamptz created_at
    }
    MUTE_PREFS {
        bigint user_id PK
        text scope PK
        boolean muted
    }
```

| Entity | Meaning |
|---|---|
| Organization | A facility (tenant). Identified publicly by its **facility code** (`slug`), which patients and family type when registering. |
| User | A person with exactly one role in exactly one organization: `admin`, `staff`, `patient` or `family`. "Staff side" = admin or staff. |
| Group | The circle of people around one patient: the patient, family members (via `group_members`) and the staff member who created it. |
| Event | An item on a group's calendar: a logged activity (start = now), a one-time future event, or a weekly recurring series. |
| Notification | A per-recipient message produced when an event is created; unread until the user marks all read. |
| Mute preference | A per-user switch that suppresses notifications for a scope. |

### 8.2 Data dictionary

**`organizations`**

| Column | Type | Constraints / default | Purpose |
|---|---|---|---|
| `id` | BIGSERIAL | PK | Surrogate key. |
| `name` | TEXT | NOT NULL | Display name (e.g. "Sunrise Manor"). |
| `slug` | TEXT | NOT NULL, UNIQUE | Facility code; normalized to lowercase letters, digits and hyphens. |
| `billing_status` | TEXT | NOT NULL, default `'trial'` | Reserved for billing (`trial`, `active`, `suspended`); not yet read by code. |
| `allowed_cidrs` | TEXT | NOT NULL, default `''` | Reserved for a per-organization registration allowlist; not yet read by code (the global `ALLOWED_CIDRS` is used). |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` | Audit. |

**`users`** — index `idx_users_org (org_id)`

| Column | Type | Constraints / default | Purpose |
|---|---|---|---|
| `id` | BIGSERIAL | PK | Stored in the session cookie as `uid`. |
| `org_id` | BIGINT | NOT NULL, FK → organizations ON DELETE CASCADE | Tenant. |
| `name` | TEXT | NOT NULL | Display name. |
| `email` | TEXT | NOT NULL, UNIQUE (global) | Login identifier, lowercased before storage. Global uniqueness means one person cannot hold accounts in two organizations with the same email. |
| `password_hash` | TEXT | NOT NULL | bcrypt hash (cost 10). |
| `role` | TEXT | NOT NULL, CHECK in (`admin`,`staff`,`patient`,`family`) | Authorization role. |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` | Audit. |

**`groups`** — index `idx_groups_org (org_id)`

| Column | Type | Constraints / default | Purpose |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `org_id` | BIGINT | NOT NULL, FK → organizations ON DELETE CASCADE | Tenant. |
| `name` | TEXT | NOT NULL | e.g. "Mrs. Smith's circle". |
| `patient_id` | BIGINT | FK → users ON DELETE SET NULL, nullable | The resident. A group may temporarily have no patient. |
| `staff_id` | BIGINT | FK → users ON DELETE SET NULL, nullable | Staff member who created the group (informational). |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` | Audit. |

**`group_members`**

| Column | Type | Constraints | Purpose |
|---|---|---|---|
| `group_id` | BIGINT | PK part, FK → groups ON DELETE CASCADE | |
| `user_id` | BIGINT | PK part, FK → users ON DELETE CASCADE | Family member (any user of the same organization is technically accepted). |

**`events`** — indexes `idx_events_group (group_id)`, `idx_events_starts (starts_at)`

| Column | Type | Constraints / default | Purpose |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `org_id` | BIGINT | NOT NULL, FK → organizations ON DELETE CASCADE | Tenant (denormalized for scoped deletes). |
| `group_id` | BIGINT | NOT NULL, FK → groups ON DELETE CASCADE | Owning group. |
| `category` | TEXT | NOT NULL, default `'activity'`, CHECK in (`therapy`,`activity`,`appointment`) | Drives color and mute scope. |
| `title` | TEXT | NOT NULL | Required in the UI. |
| `description` | TEXT | NOT NULL, default `''` | Optional details. Free text — see the privacy note in §2.3. |
| `starts_at` | TIMESTAMPTZ | NOT NULL | Start instant; for weekly events, the first occurrence. |
| `ends_at` | TIMESTAMPTZ | nullable | Reserved; never set by the current code. |
| `recurrence` | TEXT | NOT NULL, default `'none'`, CHECK in (`none`,`weekly`) | Recurrence rule. |
| `created_by` | BIGINT | FK → users ON DELETE SET NULL | Staff author. |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` | Used to order "Recent". |

**`notifications`** — index `idx_notifications_user (user_id, created_at DESC)`

| Column | Type | Constraints / default | Purpose |
|---|---|---|---|
| `id` | BIGSERIAL | PK | |
| `org_id` | BIGINT | NOT NULL, FK → organizations ON DELETE CASCADE | Tenant. |
| `user_id` | BIGINT | NOT NULL, FK → users ON DELETE CASCADE | Recipient. |
| `event_id` | BIGINT | FK → events ON DELETE CASCADE, nullable | Source event; deleting an event removes its notifications. |
| `message` | TEXT | NOT NULL | Pre-rendered single-line text with the time in the configured zone. |
| `read_at` | TIMESTAMPTZ | nullable | NULL = unread. |
| `created_at` | TIMESTAMPTZ | NOT NULL, default `now()` | Feed ordering. |

**`mute_prefs`**

| Column | Type | Constraints / default | Purpose |
|---|---|---|---|
| `user_id` | BIGINT | PK part, FK → users ON DELETE CASCADE | Owner. |
| `scope` | TEXT | PK part | `all`, `therapy`, `activity`, `appointment`, or `group:<id>`. |
| `muted` | BOOLEAN | NOT NULL, default `true` | Saving the form writes a row for every known scope with true/false. |

### 8.3 Referential integrity and deletion semantics

| When this is deleted… | …these are deleted (CASCADE) | …these are kept with NULL (SET NULL) |
|---|---|---|
| Organization | users, groups, events, notifications (and transitively group_members, mute_prefs) | — |
| User | group_members rows, notifications, mute_prefs | `groups.patient_id`, `groups.staff_id`, `events.created_by` |
| Group | group_members, events (and their notifications) | — |
| Event | notifications for that event | — |

These rules are what make account deletion reliable (the previous MySQL schema used `ON DELETE RESTRICT`, which made deleting any user who belonged to a group fail).

### 8.4 Multi-tenancy

- **Model:** shared database, shared schema, tenant discriminator column `org_id` (ADR-004).
- **Tenant resolution:** the tenant is never taken from the URL or a form. It is the `org_id` of the signed-in user loaded by `LoadUser`.
- **Enforcement points:**
  1. Queries that list or fetch tenant data filter by the user's `org_id` (`UsersByOrg`, `GroupsForOrg`, `GroupByID`, `CountAdmins`) or by the user's own id (`GroupsForUser`, notifications, mutes).
  2. Destructive statements include `AND org_id = $2` (`DeleteGroup`, `DeleteEvent`), so a forged id from another tenant affects zero rows.
  3. When an id from a form refers to a user (role change, patient selection, family email), the handler loads the user and compares `OrgID` with the actor's before acting.
  4. New rows always get `org_id` from the actor, never from input.
- **Cross-tenant identifiers:** IDs are sequential `BIGSERIAL` values and therefore guessable; isolation relies on the checks above, not on secrecy of IDs.
- **Onboarding:** a new tenant is created by `/signup` (or `/setup` on an empty system). Facility codes are globally unique.
- **Known limitation:** email is globally unique, so a family member with relatives in two facilities needs two different email addresses.

### 8.5 Authentication and session management

| Aspect | Implementation |
|---|---|
| Credential | Email (case-insensitive, trimmed) + password. |
| Password policy | ≥ 8 characters, at least one digit and one special character (`validPassword`). bcrypt limits input to 72 bytes; longer passwords are rejected with a generic "Internal error." |
| Password storage | bcrypt, cost 10 (`bcrypt.DefaultCost`), salt embedded in the hash; constant-time comparison. |
| Session store | `gorilla/sessions.CookieStore` — the session lives entirely in the cookie; nothing is stored server-side. |
| Cookie | Name `theralert_session`; `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` when `SECURE_COOKIES=true`, `Max-Age` 7 days. |
| Cookie contents | `{"uid": <int64>}` gob-encoded, plus a timestamp, base64-encoded and authenticated with **HMAC-SHA256** using `SESSION_SECRET`. Not encrypted (no block key), so the value is readable but tamper-proof. |
| Server-side validity | The codec accepts a correctly signed cookie for up to **30 days** (gorilla/sessions default codec max-age), because the code replaces the store options without calling `store.MaxAge`. The browser itself discards the cookie after 7 days. |
| Per-request load | `LoadUser` re-reads the user from the database on every request, so role changes and deletions take effect immediately. |
| Logout | Sets `Max-Age=-1` and removes `uid`; redirects to `LOGOUT_URL`. There is no server-side revocation list, so a copied cookie value remains valid until it expires (see S-05). |
| Secret rotation | Changing `SESSION_SECRET` invalidates every session (all users must sign in again). |

### 8.6 Authorization

Authorization is role-based (RBAC) at the route level, combined with tenant and membership checks inside handlers.

**Route-tier matrix**

| Route tier | Middleware | Admin | Staff | Patient | Family | Anonymous |
|---|---|---|---|---|---|---|
| Public (`/`, `/login`, `/register`, `/signup`, `/setup`, `/logout`, `/clock`, `/static/*`) | none | ✓ | ✓ | ✓ | ✓ | ✓ |
| Authenticated (`/dashboard`, `/profile*`, `/calendar`, `/sse`, `/notifications*`) | `RequireAuth` | ✓ | ✓ | ✓ | ✓ | 303 → /login |
| Staff side (`/groups*`, `/events*`) | `RequireAuth` + `RequireRole(admin, staff)` | ✓ | ✓ | 403 | 403 | 303 → /login |
| Admin (`/admin*`) | `RequireAuth` + `RequireRole(admin)` | ✓ | 403 | 403 | 403 | 303 → /login |

**Data-level rules inside handlers**

| Action | Additional rule |
|---|---|
| View calendar | Staff side: any group in their organization. Patient/family: only groups where they are the patient or a member. |
| Create event | Group must belong to the actor's organization (`GroupByID` with `org_id`). |
| Delete event / group | SQL includes `org_id`. |
| Change role | Target must be in the actor's organization and be staff or admin; last admin cannot be demoted. |
| Delete own account | Last admin cannot delete themselves. |
| Delete organization | Admin only; confirmation text must equal the facility code. |
| Register | Role limited to patient/family; IP must pass the allowlist. |

### 8.7 Time and timezone handling

- **Storage:** every timestamp column is `TIMESTAMPTZ`; PostgreSQL stores instants in UTC.
- **Display timezone:** one IANA zone for the whole deployment, from `TZ` (e.g. `America/New_York`); default is the process's local zone (UTC in the container). Loaded once into `Config.Location`.
- **Input:** the HTML `datetime-local` value (`2006-01-02T15:04`) carries no zone; it is interpreted in the configured zone with `time.ParseInLocation`. "Log now" uses `time.Now()` (an absolute instant).
- **Output:** templates call `tfmt "<layout>" <time>`, which converts to the configured zone before formatting. The clock, notification messages and email `Date`/body use the same zone and include the zone abbreviation (e.g. `EDT`).
- **Calendar math** (`monthStart`, grid boundaries, "today", weekly recurrence) is done in the configured zone, so day boundaries and DST behave as users expect.
- **Limitation:** the timezone is per deployment, not per organization or per user. Facilities in different timezones sharing one deployment would see times in the deployment's zone (see R-08).

This design fixed the earlier bug where emails showed a later time than intended (the old code formatted database timestamps in the server's local zone).

### 8.8 Real-time updates

| Feature | Mechanism | Frequency | Endpoint |
|---|---|---|---|
| Clock | HTMX `hx-get` with `hx-trigger="load, every 1s"`, swap `innerHTML` | every second per tab | `GET /clock` |
| Notification badge | HTMX `hx-trigger="load, every 20s"`; also refreshed immediately after each live toast via `htmx.ajax` | every 20 s per tab | `GET /notifications/count` |
| Live alerts | Inline script opens `new EventSource('/sse')`; on `notify` it shows a toast (text via `textContent`, removed after 8 s) and refreshes the badge | push | `GET /sse` |

SSE was preferred over WebSockets because the traffic is strictly server-to-browser, works over ordinary HTTP through proxies, needs no extra library, and reconnects automatically (ADR-009).

### 8.9 Notifications and muting

- **Trigger:** creation of any event (logged now, one-time, or weekly) in a group.
- **Recipients:** the group's patient plus all `group_members` (`GroupRecipients`, a `UNION` so a person is not notified twice). Staff are not notified.
- **Message:** `"<Category label>: <Title> — <Mon Jan 2 at 3:04 PM MST>[ (repeats weekly)]"`. Category labels: Therapy, Activity, Dr. appointment.
- **Channels per non-muted recipient:**
  1. Persisted row in `notifications` (source of truth for the feed and badge).
  2. Live SSE `notify` event to every open tab of that user.
  3. Email (only if SMTP is configured), sent asynchronously. Subject: `Theralert: <Category label> for <patient name or group name>`. HTML body with category color, title, time, escaped description, and a footer explaining how to mute.
- **Mute evaluation** (`models.IsMuted`): a recipient is skipped if **any** of these scopes is muted: `all`, the event's category, or `group:<group id>`. Muting suppresses all three channels.
- **Mute storage:** saving the settings form upserts one row per known scope (`all`, three categories, and one per group the user belongs to) with `muted` true or false.
- **Feed:** `/notifications` shows the newest 50; "Mark all read" sets `read_at` on all unread rows.

### 8.10 Presentation layer

- **Server-side rendering:** each page is a Go template that defines `title` and `content` blocks and is composed with `layout.html`. Data is passed as a `map[string]any` built from `view(r)` plus page-specific keys.
- **Escaping:** `html/template` escapes contextually (HTML text, attributes, URLs, JS), which is the primary XSS control. The only hand-built HTML (email body, badge) escapes user text with `html.EscapeString` or contains no user text.
- **HTMX:** used for small fragment swaps (clock, badge). Forms are ordinary full-page POSTs, which keeps the app working without JavaScript except for live features.
- **Tailwind CSS:** compiled from `web/static/css/input.css` with `tailwind.theralert.config.js` (content glob `./web/templates/**/*.html`, `@tailwindcss/forms` plugin). Component classes: `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`, `.card`. Theme colors: `therapy` `#2563eb` (blue), `activity` `#16a34a` (green), `appointment` `#db2777` (pink); the same hex values are used in emails.
- **Printing:** `@media print` hides the navigation and every `.no-print` element, removes page padding, and forces `print-color-adjust: exact` so category colors print.
- **Cache busting:** at startup the renderer hashes the embedded `app.css` (FNV-32a) and every page links `/static/css/app.css?v=<hash>`. A rebuild that changes CSS changes the URL, so browsers never apply stale styles (ADR-016).
- **Accessibility basics:** semantic forms with labels, the bell has `aria-label`, color is paired with text (event titles, legend labels).

### 8.11 Input validation and normalization

| Input | Rule | Where |
|---|---|---|
| Email | Trimmed and lowercased; format checked only by the browser (`type=email`). | onboarding, login, staff creation, group family list |
| Password | ≥ 8 chars, ≥ 1 digit, ≥ 1 special character. | `validPassword` |
| Facility code | `slugify`: lowercase, runs of non-alphanumerics → `-`, trimmed of `-`. | setup, signup, register |
| Role (register) | Must be `patient` or `family`. | `Register` |
| Role (admin change) | Must be `admin` or `staff`. | `SetRole` |
| Event category | Unknown values become `activity`. | `CreateEvent` |
| Event recurrence | Anything other than `weekly` becomes `none`. | `CreateEvent` |
| Event title | Required. | `CreateEvent` |
| Event time | `datetime-local` parsed in the configured zone; invalid → error redirect. | `CreateEvent` |
| Family emails | Split on commas, semicolons, whitespace and newlines; unknown or other-tenant emails are skipped and reported. | `CreateGroup` |
| Numeric ids | `strconv.ParseInt`; parse failures become 0, which matches nothing. | various |

No server-side maximum lengths are enforced on text fields (see TD-09).

### 8.12 Error handling and user feedback

- **Go errors** are returned, not thrown. Store methods wrap `pgx.ErrNoRows` as `models.ErrNotFound`. Many read paths deliberately ignore errors and render an empty list instead of failing the page.
- **Panics** are converted to `500` responses by chi's `Recoverer`, so one bad request cannot crash the process.
- **Post/Redirect/Get:** successful mutations answer `303 See Other` to a GET page, so refreshing never re-submits a form. Outcome messages travel in `?flash=` (success) and `?error=` (failure) query parameters and are rendered by the target page.
- **Validation failures on forms** re-render the same page with an inline error and the previously entered (non-secret) values, using an appropriate status (`400`, `401`, `403`, `409`).
- **Known defect:** `/calendar` does not read `flash`/`error`, so "Event added.", "Event deleted.", "Title is required." and "Invalid date/time." are not shown (D-2).

### 8.13 Persistence and schema migration

- SQL is written by hand and executed with pgx; there is no ORM (ADR-006).
- Migrations are SQL files embedded with `//go:embed migrations/*.sql` and executed in filename order at every startup. They are written to be idempotent (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).
- There is one migration (`0001_init.sql`) and no record of applied versions. Future changes that alter existing tables (`ALTER TABLE`, data backfills) need either strictly idempotent SQL or a migration tool with a version table (TD-04, ADR-015).
- Transactions are not used; each statement autocommits (TD-07).

### 8.14 Concurrency model

| Concurrency source | Mechanism | Shared state and protection |
|---|---|---|
| HTTP requests | `net/http` runs each request on its own goroutine. | Handlers share only immutable dependencies (config, renderer) and goroutine-safe ones (pgx pool, hub). |
| SSE streams | One goroutine per open stream, blocked in `select`. | Hub map guarded by `sync.RWMutex`; per-stream buffered channel (cap 8). |
| Event fan-out | Producer goroutine (the request) sends with non-blocking `select { case ch <- msg: default: }`. | Never blocks on slow consumers; drops instead. |
| Email | One goroutine per recipient per event (`go h.Email.Send(...)`). | No shared state; errors discarded; no limit on concurrent SMTP connections. |
| Database | pgx pool hands out connections to concurrent goroutines. | Pool limits concurrency to its max connections; excess callers wait. |

Templates are parsed once at startup and are safe for concurrent execution. Maps are never written concurrently outside the hub's lock.

### 8.15 Configuration

- Twelve-factor style: all configuration comes from environment variables (Appendix B). A local `.env` file is supported for development.
- The process refuses to start without `SESSION_SECRET` and `DATABASE_URL`, or with an invalid `TZ` or `ALLOWED_CIDRS` entry.
- In Docker, Compose interpolates `.env` into an explicit `environment:` list. **Only variables listed there reach the container**; `SIGNUP_OPEN` is currently missing from that list (D-1).

### 8.16 Logging and observability

- chi's `middleware.Logger` writes one line per request to stdout (method, path, status, size, duration), visible via `docker compose logs`.
- Startup and fatal configuration/database errors use the standard `log` package.
- Not yet present: structured logs, request IDs in handler logs, metrics, tracing, an application health endpoint, or alerting (TD-05). Failures inside ignored-error paths (for example SMTP send errors) are currently invisible.

### 8.17 Privacy

- The schema has no medical fields; the only personal data is name, email and the people's group relationships and schedules.
- Users can delete their own accounts; organizations can be deleted in full.
- Emails contain only the event's category, title, time and description.
- Risk: free-text titles and descriptions could be used to record clinical details. Recommended controls are staff guidance and a UI hint (R-07).

---

## 9. Architecture decisions

Each decision record states the context, the decision, the alternatives considered and the consequences. All are **Accepted** unless noted.

### ADR-001 — Rewrite the application in Go, replacing Next.js

- **Context:** The original Next.js 14 + NextAuth + MySQL app had several defects (account deletion failed, wrong email times) and pulled in a large JavaScript toolchain for a mostly form-based app.
- **Decision:** Rewrite as a Go web server with server-rendered HTML.
- **Alternatives:** Fix the Next.js app; rewrite in Python/Django or Node/Express.
- **Consequences:** + single small binary, fast startup, strong standard library for HTTP and concurrency, few dependencies. − rich client-side interactions are more work; the team must know Go. The old app was removed once feature parity was reached.

### ADR-002 — Server-side rendering with `html/template` and HTMX instead of an SPA

- **Context:** The UI is forms, tables and a calendar. Users include elderly residents and relatives on varied devices.
- **Decision:** Render HTML on the server; use HTMX for small partial updates (clock, badge) and a few lines of inline JavaScript for SSE toasts.
- **Alternatives:** React/Svelte SPA with a JSON API; Go templates without HTMX.
- **Consequences:** + no frontend build at runtime, no API layer to maintain, works without JavaScript for core flows, automatic contextual escaping. − each interaction is a full page load; complex widgets would need more JavaScript.

### ADR-003 — PostgreSQL as the system of record

- **Context:** Needs relational integrity, cascading deletes, time zones and concurrent access.
- **Decision:** PostgreSQL 16.
- **Alternatives:** keep MySQL; SQLite.
- **Consequences:** + `TIMESTAMPTZ`, robust constraints, `ON CONFLICT` upserts, mature tooling. − a second container to run and back up. Existing MySQL data was not migrated (fresh start, by decision).

### ADR-004 — Shared-schema multi-tenancy with an `org_id` discriminator

- **Context:** Many facilities should be served by one deployment, run by one person.
- **Decision:** One schema; every tenant-owned table has `org_id`; queries and destructive statements are scoped by the actor's organization.
- **Alternatives:** one deployment per facility; schema-per-tenant; database-per-tenant; PostgreSQL row-level security.
- **Consequences:** + simplest to operate and onboard (self-serve signup), cheapest. − isolation depends on every query being written correctly (no database-enforced RLS); a noisy tenant affects others; per-tenant backup/restore is not trivial.

### ADR-005 — chi as the HTTP router

- **Context:** Need method-based routing, route groups and middleware composition.
- **Decision:** `go-chi/chi/v5`.
- **Alternatives:** standard library `http.ServeMux` (Go 1.22+ patterns), Gin, Echo, Fiber.
- **Consequences:** + 100 % `net/http`-compatible handlers and middleware, route groups with scoped middleware, tiny dependency. − one third-party dependency where the standard library could now do most of it.

### ADR-006 — Hand-written SQL with pgx and a repository-style Store

- **Context:** About 30 queries, several with joins and unions.
- **Decision:** `jackc/pgx/v5` pool; all SQL in `internal/models`.
- **Alternatives:** GORM or another ORM; `sqlc` code generation; `database/sql` with `lib/pq`.
- **Consequences:** + explicit, reviewable SQL, best Postgres support, no reflection magic. − scanning code is repetitive; schema changes require manual updates of scan lists. `sqlc` remains a good future option.

### ADR-007 — Signed cookie sessions with gorilla/sessions

- **Context:** Need simple stateful login for a server-rendered app.
- **Decision:** Store only the user id in an HMAC-signed, `HttpOnly`, `SameSite=Lax` cookie; reload the user from the database each request.
- **Alternatives:** server-side session table; Redis sessions; JWTs.
- **Consequences:** + stateless server, no session storage, instant effect of role changes and deletions. − no per-session revocation; logout cannot invalidate a copied cookie; rotating the secret logs everyone out.

### ADR-008 — bcrypt for password hashing

- **Decision:** `golang.org/x/crypto/bcrypt` at default cost 10.
- **Alternatives:** Argon2id, scrypt.
- **Consequences:** + battle-tested, salted, adaptive, constant-time compare. − 72-byte input limit; Argon2id is the more modern choice.

### ADR-009 — Server-Sent Events with an in-process hub for live notifications

- **Context:** Notifications flow only from server to browser; must survive proxies; must be cheap.
- **Decision:** `/sse` endpoint, `EventSource` in the browser, `realtime.Hub` mapping user id → channels.
- **Alternatives:** WebSockets; long polling; short polling only; a hosted push service.
- **Consequences:** + standard HTTP, automatic reconnection, no extra libraries, trivial client. − one open connection per tab; in-memory hub blocks horizontal scaling; no replay of missed events (mitigated by persisted notifications and badge polling).

### ADR-010 — Email via `net/smtp`, sent asynchronously and best-effort

- **Decision:** One goroutine per recipient calls `smtp.SendMail`; failures are ignored. Email is disabled when `SMTP_HOST` is empty.
- **Alternatives:** transactional email API (SendGrid, SES, Postmark); a persistent outbox with retries; a job queue.
- **Consequences:** + no extra service, no latency added to the staff member's action. − no retries, no delivery visibility, no rate limiting, lost on process restart; STARTTLS only (no port 465).

### ADR-011 — Embed all assets and migrations; ship a single static binary

- **Decision:** `//go:embed` for templates, static files and SQL; `CGO_ENABLED=0` build; Alpine runtime image.
- **Consequences:** + atomic deploys (code, templates, CSS and schema always match), ~35 MB image. − changing a template requires a rebuild; `app.css` must exist before `go build`.

### ADR-012 — Tailwind CSS via the standalone CLI at build time

- **Decision:** Use the Tailwind v3 standalone executable (no Node.js) with a dedicated `tailwind.theralert.config.js`.
- **Alternatives:** Tailwind CDN script; hand-written CSS; Node-based Tailwind build.
- **Consequences:** + no Node in the toolchain or runtime, small purged stylesheet. − a platform-specific binary must be downloaded for local builds.

### ADR-013 — Single events table; expand weekly recurrence at read time

- **Decision:** A weekly series is one row (`recurrence='weekly'`, `starts_at` = first occurrence). Occurrences are computed for the visible month.
- **Alternatives:** materialize one row per occurrence; iCalendar RRULE support.
- **Consequences:** + tiny storage, simple writes, DST-safe arithmetic. − no end date, no skipped/modified occurrences, deleting removes the series; queries must load all weekly series that started before the window.

### ADR-014 — Store UTC; render in one configured IANA timezone

- **Decision:** `TIMESTAMPTZ` columns; `TZ` setting loaded into `time.Location`; all formatting through `tfmt` or explicit `.In(loc)`.
- **Consequences:** + correct, consistent times in UI, notifications and email. − one zone per deployment (no per-tenant zones yet).

### ADR-015 — Idempotent embedded SQL migrations at startup

- **Decision:** Run every embedded `.sql` file on boot; statements use `IF NOT EXISTS`.
- **Alternatives:** goose, golang-migrate, Atlas.
- **Consequences:** + zero tooling, database always initialized. − no version history; destructive or `ALTER` migrations need care. Revisit before the first schema change (TD-04).

### ADR-016 — Content-hash cache busting for the stylesheet

- **Context:** Browsers cached an old `app.css` and rendered the new calendar without its grid styles.
- **Decision:** Append `?v=<FNV-32a hash of app.css>` to the stylesheet URL, computed at startup.
- **Consequences:** + every deploy with new CSS is picked up immediately. − only the CSS is versioned (HTMX is versioned by filename content but served without a hash).

### ADR-017 — Multiple admins, last-admin guard, and guarded organization deletion

- **Context:** Deleting the only admin would leave an unmanageable organization.
- **Decision:** Allow any number of admins with promote/demote; block demotion or self-deletion of the last admin; provide an explicit admin-only organization deletion requiring the facility code to be typed and a browser confirmation.
- **Alternatives:** transfer-on-delete; delete the organization automatically with its last admin.
- **Consequences:** + organizations can never be orphaned by accident; destruction is deliberate. − admins must manage roles explicitly.

### ADR-018 — Self-serve organization signup behind a feature flag

- **Decision:** Public `/signup` creates an organization and its first admin when `SIGNUP_OPEN=true` (default). It is not subject to the patient/family IP allowlist.
- **Consequences:** + facilities onboard themselves from anywhere; the flag is the future hook for billing. − open signup allows spam organizations; **in Docker the flag currently cannot be turned off** because Compose does not pass it through (D-1).

### ADR-019 — IP allowlist for patient/family registration

- **Decision:** Global `ALLOWED_CIDRS`; registration is refused from other networks.
- **Consequences:** + simple way to ensure accounts are created on-site. − relies on the client IP, which is currently taken from a client-controllable header (S-01); facilities behind CGNAT or with dynamic IPs are hard to describe; the per-organization column exists but is unused.

### ADR-020 — Mute preferences as scoped rows

- **Decision:** `mute_prefs(user_id, scope, muted)` with scopes `all`, category names and `group:<id>`; muted if any applicable scope is muted.
- **Consequences:** + extensible (new scopes need no schema change), simple precedence. − scope strings are not foreign keys, so stale `group:<id>` rows can remain after a group is deleted (harmless).

### ADR-021 — Post/Redirect/Get with flash messages in the query string

- **Decision:** After every successful mutation, redirect with `303` and pass a message in `?flash=` or `?error=`.
- **Alternatives:** flash messages stored in the session cookie.
- **Consequences:** + no server state, refresh-safe. − messages are visible and editable in the URL (content spoofing, S-07); each target page must remember to read them (D-2).

---

## 10. Quality requirements

### 10.1 Quality tree

```mermaid
flowchart LR
    Q["Theralert quality"] --> SEC["Security & privacy"]
    Q --> OPS["Operability"]
    Q --> PERF["Timeliness & performance"]
    Q --> USE["Usability"]
    Q --> MNT["Maintainability"]
    Q --> REL["Reliability"]
    SEC --> s1["Tenant isolation (QS-01)"]
    SEC --> s2["No medical data (QS-09)"]
    SEC --> s3["Safe destructive actions (QS-07, QS-08)"]
    SEC --> s4["Brute-force resistance (QS-15)"]
    OPS --> o1["One-command deploy (QS-04)"]
    OPS --> o2["No stale assets (QS-05)"]
    PERF --> p1["Live alert ≈ 1 s (QS-02)"]
    PERF --> p2["Offline catch-up (QS-03)"]
    USE --> u1["Correct local times (QS-06)"]
    USE --> u2["Printable calendar"]
    MNT --> m1["Small, layered codebase (QS-12)"]
    REL --> r1["Panic containment (QS-10)"]
    REL --> r2["Email failures isolated (QS-11)"]
    REL --> r3["Horizontal scale (QS-13)"]
    REL --> r4["Zero-downtime redeploy (QS-14)"]
```

### 10.2 Quality scenarios

| ID | Quality | Scenario (stimulus → response) | Measure | Status |
|---|---|---|---|---|
| QS-01 | Tenant isolation | A staff member of org A requests `/calendar?group=<id of an org B group>`. | No org B data is returned; the user's own first group is shown. | Met (verified) |
| QS-02 | Timeliness | Staff logs an activity while a family member has Theralert open. | Toast appears within ~1 s. | Met (SSE verified); proxy buffering must be off |
| QS-03 | Catch-up | Family member had no tab open when the event was logged. | Badge shows the unread count on next visit (≤ 20 s while open); item is in the feed. | Met |
| QS-04 | Deployability | Operator deploys on a fresh Docker host. | `docker compose up -d --build` yields a running system; image ≈ 35 MB. | Met |
| QS-05 | Operability | A deploy changes CSS. | Users see the new styling without a hard refresh. | Met (hashed URL) |
| QS-06 | Correctness | Staff schedules "9:00 AM" in a DST-observing zone. | Calendar, notification and email all show 9:00 AM local, including weeks after a DST change. | Met |
| QS-07 | Safety | Admin clicks "Delete organization". | Requires browser confirmation and the exact facility code. | Met |
| QS-08 | Safety | The only admin tries to delete their account or be demoted. | Action refused with guidance (409 / error). | Met |
| QS-09 | Privacy | Auditor inspects the schema. | No medical fields exist. | Met (free-text caveat R-07) |
| QS-10 | Reliability | A handler panics. | Client gets 500; process keeps serving. | Met (Recoverer) |
| QS-11 | Reliability | SMTP server is down while an event is logged. | Staff request succeeds; in-app notifications delivered. | Met (async, best-effort) |
| QS-12 | Maintainability | Developer adds a new page. | Touches one handler file, one template, one route line; no SQL outside `models`. | Met |
| QS-13 | Scalability | Load requires a second app instance. | Live alerts reach users on either instance. | **Not met** — hub is in-process (R-05) |
| QS-14 | Availability | Operator redeploys during use. | In-flight requests complete. | **Not met** — no graceful shutdown (TD-03) |
| QS-15 | Security | Attacker scripts password guesses against `/login`. | Attempts are throttled or locked out. | **Not met** (S-03) |

---

## 11. Security architecture and threat model

### 11.1 Assets

| Asset | Sensitivity | Why it matters |
|---|---|---|
| User accounts (name, email, password hash, role) | High | Identity, access to schedules; emails are personal data. |
| Group membership and schedules | High | Reveals who lives where and their daily routine. |
| Session cookies | High | Equivalent to the user's identity for up to 30 days. |
| `SESSION_SECRET` | Critical | Lets anyone forge a session for any user id. |
| Database credentials and volume | Critical | Full data access. |
| SMTP credentials | High | Can send mail as Theralert. |
| Organization integrity (admin roles) | High | Control over a facility's tenant. |

### 11.2 Trust boundaries

```mermaid
flowchart LR
    subgraph TB1["Untrusted: Internet"]
        br["Browsers (users and attackers)"]
    end
    subgraph TB2["Edge (operator-controlled)"]
        px["Reverse proxy / tunnel (TLS)"]
    end
    subgraph TB3["Host + Docker network (trusted)"]
        ap["Theralert server"]
        pg[("PostgreSQL")]
    end
    subgraph TB4["Third party"]
        sm["SMTP provider"]
    end
    br -->|"B1: HTTPS, cookies, form input"| px
    px -->|"B2: HTTP + X-Forwarded-For"| ap
    br -.->|"B2b: direct :3002 if host port is reachable"| ap
    ap -->|"B3: SQL, sslmode=disable"| pg
    ap -->|"B4: SMTP + STARTTLS"| sm
```

### 11.3 Threat analysis (STRIDE)

| # | Category | Threat | Existing controls | Residual risk |
|---|---|---|---|---|
| T1 | Spoofing | Password guessing / credential stuffing on `/login`. | bcrypt slows offline cracking; generic login error. | **Medium** — no rate limit or lockout (S-03). |
| T2 | Spoofing | Forged session cookie. | HMAC-SHA256 with `SESSION_SECRET`. | Low, if the secret is strong and private. |
| T3 | Spoofing | Stolen session cookie reused. | `HttpOnly`, `Secure`, `SameSite=Lax`. | Medium — no revocation; valid server-side up to 30 days (S-05). |
| T4 | Tampering | SQL injection. | Parameterized queries everywhere. | Low. |
| T5 | Tampering | Cross-site request forgery. | All mutations are POST; `SameSite=Lax`. | **Medium** — no CSRF tokens; sibling subdomains of `aniwaghray.com` are "same-site" and are not blocked by SameSite (S-02). |
| T6 | Tampering | Cross-tenant modification by forging ids. | `org_id` in destructive SQL, org checks on referenced users. | Low. |
| T7 | Tampering | Bypassing the registration network gate. | CIDR allowlist. | **High for that control** — first `X-Forwarded-For` value is client-supplied (S-01). |
| T8 | Repudiation | Admin denies changing roles or deleting data. | `created_by` on events only. | Medium — no audit log (TD-06). |
| T9 | Information disclosure | XSS stealing data or acting as the user. | `html/template` contextual escaping; toasts use `textContent`; `HttpOnly` cookie. | Low; no Content-Security-Policy as defense in depth (S-11). |
| T10 | Information disclosure | Cross-tenant reads. | Tenant-scoped queries; calendar selects only allowed groups. | Low. |
| T11 | Information disclosure | Account enumeration. | Login message is generic. | Low — registration/signup/staff creation say "An account with this email already exists." (S-12). |
| T12 | Information disclosure | Session cookie contents readable. | Signed, not encrypted; contains only a numeric id. | Low (S-06). |
| T13 | Information disclosure | Email header injection to send content to third parties. | Body text escaped. | **Medium-Low** — names in the Subject header are not stripped of CR/LF (S-04). |
| T14 | Information disclosure | Clinical data entered in free text. | Schema has no medical fields. | Compliance risk (R-07). |
| T15 | Denial of service | Slowloris / slow headers. | `ReadHeaderTimeout: 10s`. | Low-Medium — no read/write/idle timeouts or body size limits. |
| T16 | Denial of service | Many SSE connections or many polling tabs. | Go scales goroutines cheaply. | Medium — no per-user connection cap; clock polling hits the DB every second per tab (TD-02). |
| T17 | Denial of service | Signup spam creating many organizations. | `SIGNUP_OPEN` flag. | Medium — flag not effective in Docker (D-1); no CAPTCHA/rate limit. |
| T18 | Elevation of privilege | Patient/family reaching staff routes. | `RequireRole` middleware. | Low (verified 403). |
| T19 | Elevation of privilege | Staff reaching admin routes or self-promoting. | `RequireRole(admin)`; role change admin-only. | Low (verified 403). |
| T20 | Elevation of privilege | Clickjacking one-click admin actions (Make admin / Demote). | none | Low-Medium — no `X-Frame-Options` / `frame-ancestors` (S-11). |

### 11.4 Security findings register

| ID | Finding | Severity | Recommendation |
|---|---|---|---|
| S-01 | `clientIP` trusts the **first** `X-Forwarded-For` value, which the client controls; a remote user can claim an allowed IP and bypass `ALLOWED_CIDRS`. | High (for the allowlist) | Trust forwarding headers only from known proxies (`TRUSTED_PROXIES`), use the proxy's own header (e.g. `CF-Connecting-IP`) or the right-most untrusted hop, and do not publish port 3002 publicly. |
| S-02 | No anti-CSRF tokens; protection relies on `SameSite=Lax`, which does not cover same-site subdomains. | Medium | Add token-based CSRF middleware (e.g. `gorilla/csrf` or `justinas/nosurf`) to every form. |
| S-03 | No rate limiting or lockout on `/login`, `/register`, `/signup`. | Medium | Per-IP and per-account throttling; temporary lockout; optional CAPTCHA on signup. |
| S-04 | Patient/group names are placed in the email `Subject` without removing CR/LF; a crafted name can inject headers (e.g. `Bcc:`). | Medium-Low | Reject control characters in names server-side; encode the subject with `mime.QEncoding`. |
| S-05 | Sessions cannot be revoked; password change does not log out other sessions; signed cookies are accepted for 30 days server-side. | Low-Medium | Call `store.MaxAge(7*24*3600)`; add a per-user session version (`users.session_version`) checked in `LoadUser` and bumped on password change/logout-all. |
| S-06 | Session cookie is signed but not encrypted. | Low | Provide a block key to `NewCookieStore` to encrypt as well. |
| S-07 | `?flash=` / `?error=` text is displayed verbatim (escaped) from the URL, enabling convincing fake messages in phishing links. | Low | Use message codes or session-stored flashes. |
| S-08 | `SECURE_COOKIES` defaults to `false` in the binary (Compose defaults to `true`). | Low | Default to `true` and opt out for local HTTP only. |
| S-09 | Container runs as root; app port 3002 is published on all host interfaces. | Low | Add a non-root `USER`; bind to `127.0.0.1:3002:3002` or rely on the tunnel only. |
| S-10 | Free-text event fields can capture health information. | Compliance | Staff guidance, UI hint, optional field length limits, retention policy. |
| S-11 | No CSP, `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options` or HSTS headers. | Low-Medium | Add a security-headers middleware. |
| S-12 | Registration, signup and staff creation reveal whether an email exists. | Low | Generic responses with email-based confirmation flow. |
| S-13 | No email verification or password reset; staff get admin-chosen temporary passwords with no forced change. | Medium (product) | Invite links with expiring tokens; password reset by email. |

### 11.5 Security controls in place

- bcrypt password hashing; generic login failure message.
- HMAC-signed `HttpOnly`, `SameSite=Lax` session cookie; `Secure` in production.
- User reloaded from the database on every request (role changes and deletions apply immediately).
- Role-based route tiers; tenant scoping in queries and handler checks.
- Parameterized SQL only; no dynamic SQL strings.
- Context-aware HTML escaping; manual escaping in the email body; DOM `textContent` for toasts.
- All state changes via POST; PRG pattern.
- Last-admin guard; password re-entry for account deletion; typed facility code for organization deletion.
- Panic recovery; header read timeout.
- Fail-fast configuration validation; secrets only via environment.
- No medical fields in the schema.

---

## 12. Risks, technical debt and roadmap

### 12.1 Known defects

| ID | Defect | Impact | Fix |
|---|---|---|---|
| D-1 | `docker-compose.yml` does not pass `SIGNUP_OPEN` to the container, and `.env` is not copied into the image. | Self-serve signup cannot be closed in Docker deployments. | Add `SIGNUP_OPEN: ${SIGNUP_OPEN:-true}` to the `theralert` service environment. |
| D-2 | `Calendar` handler does not read `flash`/`error` query parameters although `calendar.html` renders them. | No confirmation after adding/deleting events; validation errors ("Title is required.", "Invalid date/time.") are invisible. | Read both parameters in `Calendar` like the other pages do. |
| D-3 | Session codec max-age (30 days) differs from cookie max-age (7 days). | Copied cookies stay valid longer than intended. | Call `store.MaxAge(...)` after setting options. |

### 12.2 Technical debt

| ID | Item | Consequence | Suggested remedy |
|---|---|---|---|
| TD-01 | No automated tests or CI. | Regressions (like D-2) are found manually. | Unit tests for `expandOccurrences`, `IsMuted`, `slugify`, `validPassword`, config parsing; HTTP tests with `httptest`; integration tests against Postgres (testcontainers); `go test -race`, `go vet`, `staticcheck` in CI. |
| TD-02 | Global `LoadUser` runs for `/clock` (every second per tab) and `/static/*`; `view()` computes an unread count no template uses. | ~1 DB query per second per open tab; extra query per page. | Render the clock client-side (sync once) or exempt `/clock` and `/static` from `LoadUser`; drop `Unread` from `view()`. |
| TD-03 | No graceful shutdown. | Redeploys cut in-flight requests and SSE streams abruptly. | Handle `SIGTERM`, call `srv.Shutdown(ctx)` with a timeout, close the pool. |
| TD-04 | No migration versioning. | Future `ALTER`s are risky. | Adopt goose or golang-migrate with a `schema_migrations` table. |
| TD-05 | Minimal observability. | SMTP failures and ignored DB errors are invisible. | `log/slog` structured logging, request IDs, `/healthz` and `/readyz`, Prometheus metrics. |
| TD-06 | No audit log. | Cannot answer "who deleted/changed what". | `audit_log` table written by admin and event handlers. |
| TD-07 | Multi-statement operations are not transactional (org + admin creation, group + members). | Partial writes possible under races or failures. | Wrap in `pool.BeginTx`. |
| TD-08 | N+1 queries: groups page loads members per group; fan-out reads mute prefs per recipient. | Slower pages at larger scale. | Batch queries (`= ANY($1)`), join mute prefs in `GroupRecipients`. |
| TD-09 | No server-side length limits on text inputs; no `http.MaxBytesReader`. | Oversized rows, abuse. | Validate lengths; add `CHECK` constraints; cap request bodies. |
| TD-10 | Unused code and columns (`RenderPartial`, `UserInGroup`, `BaseURL`, `ends_at`, `billing_status`, `organizations.allowed_cidrs`). | Confusion about what is implemented. | Implement or remove when the related features land. |
| TD-11 | Errors frequently ignored with `_ =`. | Silent failures. | Log at minimum; surface to users where actionable. |
| TD-12 | Local Tailwind build depends on a manually downloaded binary. | Onboarding friction. | Document or script the download per platform. |

### 12.3 Risk register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-01 | Registration allowlist bypass (S-01). | Medium | Medium | Fix forwarded-header trust; restrict port exposure. |
| R-02 | Brute-force account takeover (S-03). | Medium | High | Rate limiting, lockout, stronger password policy or passkeys. |
| R-03 | `SESSION_SECRET` leak. | Low | Critical | Store outside the repo; rotate on suspicion (logs everyone out). |
| R-04 | Data loss (volume deleted, disk failure). | Low | Critical | Scheduled `pg_dump` backups off-host; restore drills (§13.5). |
| R-05 | Live alerts fail when scaled to multiple instances. | Low (single instance today) | Medium | Postgres `LISTEN/NOTIFY` or Redis pub/sub fan-out. |
| R-06 | Email silently not delivered. | Medium | Medium | Outbox table with retries and status; transactional email provider. |
| R-07 | Staff record clinical details in free text (HIPAA-type exposure). | Medium | High | Policy, UI hint, training, retention limits. |
| R-08 | Facilities in different timezones on one deployment see wrong local times. | Medium (with self-serve signup) | Medium | Per-organization timezone column used by `tfmt`, clock and email. |
| R-09 | Spam organizations via open signup. | Medium | Low-Medium | Fix D-1; CAPTCHA; email verification; billing gate. |
| R-10 | Notification expectation gap: users expect reminders when events happen, but notifications are sent only at creation. | High | Medium | Reminder scheduler (see roadmap). |
| R-11 | Single maintainer (bus factor 1). | — | High | This document, tests, runbook. |

### 12.4 Roadmap

**Now — correctness and security hardening**

1. Fix D-1 (Compose `SIGNUP_OPEN`), D-2 (calendar flash/error) and D-3 (session max-age).
2. Trusted-proxy client IP handling (S-01); stop publishing 3002 publicly.
3. CSRF tokens (S-02), login/signup rate limiting (S-03), security headers (S-11).
4. Sanitize email headers (S-04).
5. SSE heartbeat comment every ~25 s to keep streams alive through proxies.
6. Non-root container user; `SECURE_COOKIES` default true.

**Next — product completeness and engineering foundations**

1. Event reminders: a background scheduler that notifies groups shortly before an event/occurrence starts (fulfils the "notify of upcoming events" expectation, R-10).
2. Recurrence improvements: end dates, editing events, skipping/modifying single occurrences.
3. Invite links, email verification and password reset (S-13).
4. Per-organization timezone (R-08) and per-organization allowlist (use the existing column).
5. Tests and CI (TD-01), versioned migrations (TD-04), graceful shutdown (TD-03), structured logging and health endpoints (TD-05), audit log (TD-06).

**Later — scale and business**

1. Stripe billing driving `billing_status` and gating signup.
2. Multi-instance support for SSE (R-05) and an email outbox with retries (R-06).
3. Staff notifications, digest emails, SMS or web push.
4. Data export per organization; accessibility audit; localization.

---

## 13. Operations runbook

### 13.1 Prerequisites

- Linux host with Docker Engine and Docker Compose v2.
- A reverse proxy or tunnel that terminates TLS for the public hostname and forwards to port 3002. For SSE, response buffering must be disabled for `/sse`.
- An SMTP account (optional), e.g. Gmail with an app password.

### 13.2 First deployment

```bash
git clone https://github.com/aniwag2/theralert.git
cd theralert
cp .env.example .env
# edit .env: SESSION_SECRET, DB_PASSWORD, BASE_URL, TZ, SMTP_*
docker compose up -d --build
docker compose ps
docker compose logs -f theralert     # expect "Theralert listening on :3002"
```

Then open the site. On an empty database `/login` redirects to `/setup`; create the first facility and admin there (or use `/signup`).

**Minimum `.env` values**

| Variable | Example | Notes |
|---|---|---|
| `SESSION_SECRET` | output of `openssl rand -base64 32` | Required; keep secret. |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | `theralert`, `theralert`, long random | Used to initialize Postgres on first start only. |
| `BASE_URL` | `https://theralert.aniwaghray.com` | Informational today. |
| `TZ` | `America/New_York` | Display timezone. |
| `SECURE_COOKIES` | `true` | Must be true behind HTTPS. |

### 13.3 Routine operations

| Task | Command / procedure |
|---|---|
| Deploy a new version | `git pull` then `docker compose up -d --build`. Migrations run automatically on start. Expect a few seconds of downtime (TD-03). |
| Roll back | `git checkout <previous commit>` then `docker compose up -d --build`. Safe while migrations stay additive. |
| View logs | `docker compose logs -f theralert` / `docker compose logs -f db` |
| Restart app only | `docker compose restart theralert` |
| Stop everything | `docker compose down` (keeps data). **Never** add `-v` unless you intend to erase the database. |
| Open a SQL shell | `docker exec -it theralert-db psql -U <DB_USER> -d <DB_NAME>` |
| Check health | `docker compose ps` (db shows `healthy`); `curl -I https://<host>/login` should return 200 or 303. |
| Close self-serve signup | Set `SIGNUP_OPEN=false` **and** add it to the Compose environment (D-1), then `docker compose up -d`. |
| Restrict registration networks | Set `ALLOWED_CIDRS=203.0.113.0/24,198.51.100.42`; ensure the proxy sets a trustworthy client IP (S-01). |
| Tune pool size | Append `&pool_max_conns=20` to the database URL. |

### 13.4 Secret rotation

| Secret | Procedure | Effect |
|---|---|---|
| `SESSION_SECRET` | Change in `.env`, `docker compose up -d`. | Every user is signed out. |
| Database password | 1) `docker exec -it theralert-db psql -U <DB_USER> -d <DB_NAME> -c "ALTER USER <DB_USER> WITH PASSWORD '<new>';"` 2) update `DB_PASSWORD` in `.env` 3) `docker compose up -d`. | `POSTGRES_PASSWORD` is only applied when the volume is first initialized, so changing `.env` alone does **not** change the database password. |
| SMTP password | Update `SMTP_PASS`, `docker compose up -d`. | None for users. |

### 13.5 Backup and restore

```bash
# Backup (custom format, compressed)
docker exec theralert-db pg_dump -U <DB_USER> -d <DB_NAME> -Fc > theralert_$(date +%F).dump

# Restore into the running database (overwrites existing objects)
docker exec -i theralert-db pg_restore -U <DB_USER> -d <DB_NAME> --clean --if-exists < theralert_YYYY-MM-DD.dump
```

Recommendations: run the backup daily via cron, copy dumps off the host, keep at least 14 days, and test a restore into a scratch container periodically.

### 13.6 Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| `dependency failed to start: container theralert-db is unhealthy` | `.env` missing or `DB_PASSWORD` empty; Postgres refuses to initialize without a password. | Create `.env` with `DB_NAME/DB_USER/DB_PASSWORD`; `docker compose down -v` (only on a fresh install!) and `up -d` again. |
| App exits with `config: SESSION_SECRET is required` / `DATABASE_URL is required` | Variable missing. | Set it in `.env` (Compose builds `DATABASE_URL` from `DB_*`). |
| App exits with `invalid TZ` | Misspelled zone. | Use an IANA name such as `America/Chicago`. |
| Calendar or pages look unstyled after an update | Browser cached old CSS from before cache busting; or `app.css` was not built. | Rebuild the image (CSS is compiled in the build); hard refresh once. |
| Times are off by hours | `TZ` not set (defaults to UTC in the container). | Set `TZ` and restart. |
| No emails | `SMTP_HOST` empty, wrong app password, port 465 used, or provider blocking. | Use port 587 with STARTTLS and an app password; failures are not logged yet (TD-05). |
| Live toasts never appear but the badge updates | Proxy buffers or times out SSE. | Disable buffering for `/sse` (`X-Accel-Buffering: no` for nginx); expect reconnects after ~100 s idle on Cloudflare. |
| Registration says "not permitted from your network" | `ALLOWED_CIDRS` excludes the client IP, or the proxy's forwarded IP differs from expectations. | Check the IP the app sees; adjust CIDRs. |
| "You are the only admin" when deleting an account | Last-admin guard. | Promote another admin first, or delete the organization. |
| `/setup` redirects to `/login` | An organization already exists. | Use `/signup` for additional facilities. |
| Cannot close signups in Docker | D-1. | Add `SIGNUP_OPEN` to the Compose environment. |
| `bind: address already in use` on 3002 (local) | Previous `go run` process still running (on Windows the process is the temporary build binary). | Find the PID listening on 3002 and terminate it. |

### 13.7 Local development

```bash
# one-time: start a dev database
docker run -d --name theralert-pg-dev -e POSTGRES_USER=theralert \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=theralert -p 5433:5432 postgres:16-alpine

# .env
# DATABASE_URL=postgres://theralert:devpass@localhost:5433/theralert?sslmode=disable
# SESSION_SECRET=dev-secret
# TZ=America/New_York

# download the Tailwind standalone CLI for your platform as ./tailwindcss (or tailwindcss.exe), then:
make run            # compiles CSS, then go run ./cmd/server
make css-watch      # optional: recompile CSS on template changes
```

---

## 14. Glossary

| Term | Definition |
|---|---|
| Admin | Role that manages an organization: staff, admin roles, organization deletion. Has all staff capabilities. |
| arc42 | A template for documenting software architectures; this document follows its section structure. |
| bcrypt | Adaptive password-hashing function with built-in salt. |
| C4 model | Hierarchical diagramming approach: Context, Containers, Components, Code. |
| Category | Event type: therapy (blue), activity (green), doctor's appointment (pink). |
| chi | Lightweight Go HTTP router compatible with `net/http`. |
| Composition root | The single place (`main.go`) where all dependencies are constructed and wired. |
| CSRF | Cross-site request forgery: tricking a signed-in browser into submitting a request. |
| Event | A calendar item belonging to a group. |
| Facility code | An organization's unique, human-typable identifier (`slug`), used when registering. |
| Family member | Role for relatives; sees groups they belong to and receives notifications. |
| Flash message | A one-time success or error message shown after a redirect. |
| Group | A patient plus family members plus the creating staff member; owns a calendar. |
| HTMX | Small JavaScript library that issues requests from HTML attributes and swaps returned HTML into the page. |
| `IsStaffSide` | True for admin and staff roles. |
| Mute scope | `all`, a category, or `group:<id>`; muting any applicable scope suppresses a notification. |
| Notification | Per-recipient record created when an event is created; delivered in-app, live and by email. |
| Occurrence | One rendered instance of an event on a specific day (weekly series produce many). |
| Organization | A tenant; one facility. |
| Patient | Role for the resident a group is centred on. |
| PHI | Protected health information; deliberately not stored by Theralert. |
| pgx | PostgreSQL driver and connection pool for Go. |
| PRG | Post/Redirect/Get: answer a POST with a redirect so refresh does not resubmit. |
| RBAC | Role-based access control. |
| SSE | Server-Sent Events: a one-way, long-lived HTTP response streaming `event:`/`data:` frames. |
| Staff | Role for caregivers; manages groups and events. |
| Tenant | An isolated customer (organization) sharing the deployment. |

---

## Appendix A — HTTP route reference

| Method | Path | Access | Handler | Parameters | Success response | Error responses |
|---|---|---|---|---|---|---|
| GET | `/` | public | `Root` | — | 303 → `/dashboard` (signed in) or `/login` | — |
| GET | `/clock` | public | `Clock` | — | 200 text fragment | — |
| GET | `/static/*` | public | `http.FileServer` | — | 200 file | 404 |
| GET | `/setup` | public, only while no organization exists | `SetupForm` | — | 200 `setup` | 303 → `/login` if orgs exist |
| POST | `/setup` | same | `Setup` | `orgname`, `slug`, `name`, `email`, `password` | 303 → `/admin` + cookie | 400 form error |
| GET | `/signup` | public | `SignupForm` | — | 200 `signup` (or closed notice) | 303 → `/dashboard` if signed in |
| POST | `/signup` | public, `SIGNUP_OPEN` | `Signup` | `orgname`, `slug`, `name`, `email`, `password` | 303 → `/admin` + cookie | 400 form error, 403 closed |
| GET | `/login` | public | `LoginForm` | — | 200 `login` | 303 → `/setup` (no orgs) or `/dashboard` (signed in) |
| POST | `/login` | public | `Login` | `email`, `password` | 303 → `/dashboard` + cookie | 401 |
| GET | `/register` | public | `RegisterForm` | — | 200 `register` | — |
| POST | `/register` | public, IP allowlist | `Register` | `org`, `name`, `email`, `role` (`patient`/`family`), `password` | 303 → `/dashboard` + cookie | 400, 403 |
| POST | `/logout` | public | `Logout` | — | 303 → `LOGOUT_URL`, cookie expired | — |
| GET | `/dashboard` | authenticated | `Dashboard` | — | 200 `dashboard` | 303 → `/login` |
| GET | `/profile` | authenticated | `Profile` | `flash` | 200 `profile` | 303 → `/login` |
| POST | `/profile/password` | authenticated | `ChangePassword` | `current`, `new` | 303 → `/profile?flash=…` | 400 |
| POST | `/profile/delete` | authenticated | `DeleteAccount` | `password` | 303 → `LOGOUT_URL` | 401 wrong password, 409 last admin, 500 |
| GET | `/calendar` | authenticated | `Calendar` | `group`, `y`, `m` | 200 `calendar` | 303 → `/login` |
| GET | `/sse` | authenticated | `Events` | — | 200 `text/event-stream` | 500 if streaming unsupported |
| GET | `/notifications` | authenticated | `Notifications` | `flash` | 200 `notifications` | 303 → `/login` |
| GET | `/notifications/count` | authenticated | `NotifCount` | — | 200 badge fragment | 303 → `/login` |
| POST | `/notifications/read` | authenticated | `MarkRead` | — | 303 → `/notifications` | — |
| POST | `/notifications/mute` | authenticated | `SetMutes` | `mute` (repeated: `all`, `therapy`, `activity`, `appointment`, `group:<id>`) | 303 → `/notifications?flash=…` | — |
| GET | `/groups` | admin, staff | `Groups` | `flash`, `error` | 200 `groups` | 403 |
| POST | `/groups` | admin, staff | `CreateGroup` | `name`, `patient_id`, `family_emails` | 303 → `/groups?flash=…` | 303 with `error` |
| POST | `/groups/delete` | admin, staff | `DeleteGroup` | `group_id` | 303 → `/groups?flash=…` | 303 with `error` |
| POST | `/events` | admin, staff | `CreateEvent` | `group_id`, `title`, `category`, `description`, `when` (`now`/`scheduled`), `datetime` (`YYYY-MM-DDTHH:MM`), `recurrence` (`none`/`weekly`) | 303 → `/calendar?group=…&flash=…` | 404 group, 303 with `error` |
| POST | `/events/delete` | admin, staff | `DeleteEvent` | `event_id`, `group_id` | 303 → `/calendar?group=…&flash=…` | 303 with `error` |
| GET | `/admin` | admin | `Admin` | `flash`, `error` | 200 `admin` | 403 |
| POST | `/admin/staff` | admin | `CreateStaff` | `name`, `email`, `password` | 303 → `/admin?flash=…` | 400, 500 |
| POST | `/admin/role` | admin | `SetRole` | `user_id`, `role` (`admin`/`staff`) | 303 → `/admin?flash=…` | 303 with `error` |
| POST | `/admin/org/delete` | admin | `DeleteOrg` | `confirm` (must equal facility code) | 303 → `/setup`, cookie expired | 303 with `error` |

## Appendix B — Configuration reference

| Variable | Default | Required | Passed by Compose | Purpose |
|---|---|---|---|---|
| `ADDR` | `:3002` | no | yes (`:3002`) | Listen address. |
| `BASE_URL` | `http://localhost:3002` | no | yes | Public base URL (currently informational). |
| `LOGOUT_URL` | `https://theralert.aniwaghray.com` | no | yes (same default) | Redirect target after logout and self-deletion. |
| `DATABASE_URL` | — | **yes** | yes (built from `DB_*`) | Postgres connection string; supports pgx options like `pool_max_conns`. |
| `SESSION_SECRET` | — | **yes** | yes | HMAC key for session cookies. |
| `SECURE_COOKIES` | `false` | no | yes (default `true`) | Adds `Secure` to the session cookie. |
| `SIGNUP_OPEN` | `true` | no | **no (D-1)** | Enables `/signup`. |
| `TZ` | process local zone | no | yes (default `UTC`) | Display timezone (IANA). |
| `ALLOWED_CIDRS` | empty (allow all) | no | yes | Comma-separated CIDRs/IPs allowed to use `/register`. |
| `SMTP_HOST` | empty (email disabled) | no | yes | SMTP server host. |
| `SMTP_PORT` | `587` | no | yes | SMTP port (STARTTLS). |
| `SMTP_USER` | empty | no | yes | SMTP username; also the default sender. |
| `SMTP_PASS` | empty | no | yes | SMTP password / app password. |
| `MAIL_FROM` | `SMTP_USER` | no | yes | `From` address. |
| `DB_NAME` / `DB_USER` / `DB_PASSWORD` | — | Compose only | used for the `db` service and `DATABASE_URL` | Postgres initialization and credentials. |

## Appendix C — Source inventory

| Path | LOC | Purpose |
|---|---|---|
| `cmd/server/main.go` | 117 | Composition root, routes, HTTP server. |
| `internal/config/config.go` | 120 | Environment configuration and IP allowlist. |
| `internal/db/db.go` | 61 | Connection pool and embedded migration runner. |
| `internal/db/migrations/0001_init.sql` | 75 | Complete schema. |
| `internal/models/models.go` | 58 | Entity structs. |
| `internal/models/store.go` | 169 | Organizations and users. |
| `internal/models/store_groups.go` | 158 | Groups, membership, recipients. |
| `internal/models/store_events.go` | 72 | Events. |
| `internal/models/store_notifications.go` | 108 | Notifications, mute preferences, `IsMuted`. |
| `internal/auth/auth.go` | 120 | Sessions, bcrypt, middleware. |
| `internal/realtime/hub.go` | 83 | SSE hub. |
| `internal/email/email.go` | 60 | SMTP sender. |
| `internal/handlers/handlers.go` | 406 | Onboarding, auth, dashboard, admin users, profile, clock, SSE. |
| `internal/handlers/admin.go` | 66 | Role change, organization deletion. |
| `internal/handlers/groups.go` | 105 | Group management. |
| `internal/handlers/calendar.go` | 227 | Calendar, events, recurrence expansion. |
| `internal/handlers/notify.go` | 105 | Notification fan-out and email body. |
| `internal/handlers/notifications_handlers.go` | 93 | Feed, badge, mute settings. |
| `internal/handlers/util.go` | 20 | `slugify`, `urlEncode`. |
| `web/render.go` | 109 | Template renderer and embedded assets. |
| `web/templates/*.html` (11 files) | 740 | Pages and layout. |
| `web/static/css/input.css` | 37 | Tailwind source, components, print rules. |
| `web/static/js/htmx.min.js` | — | HTMX 1.9.12 (vendored, 48 KB). |
| `web/static/favicon.ico` | — | Favicon. |
| `tailwind.theralert.config.js` | — | Tailwind configuration. |
| `Dockerfile`, `docker-compose.yml`, `Makefile`, `.env.example` | — | Build and deployment. |
| **Total (Go, SQL, HTML, CSS)** | **3,109** | Go: 2,257 · SQL: 75 · HTML: 740 · CSS: 37 |

## Appendix D — Third-party components

| Component | Version | Purpose | License |
|---|---|---|---|
| Go toolchain and standard library | 1.25.6 | Language, `net/http`, `html/template`, `net/smtp`, `embed` | BSD-3-Clause |
| `github.com/go-chi/chi/v5` | v5.3.0 | Router and middleware | MIT |
| `github.com/jackc/pgx/v5` | v5.10.0 | PostgreSQL driver and pool | MIT |
| `github.com/gorilla/sessions` | v1.4.0 | Cookie sessions | BSD-3-Clause |
| `github.com/gorilla/securecookie` | v1.1.2 (indirect) | Cookie signing | BSD-3-Clause |
| `github.com/joho/godotenv` | v1.5.1 | `.env` loading | MIT |
| `golang.org/x/crypto` | v0.52.0 | bcrypt | BSD-3-Clause |
| HTMX | 1.9.12 | HTML-driven AJAX (vendored) | 0BSD |
| Tailwind CSS standalone CLI | v3.4.17 | CSS build (build time only) | MIT |
| PostgreSQL | 16 (alpine image) | Database | PostgreSQL License |
| Alpine Linux | 3.20 | Runtime base image | Various (MIT/GPL packages) |
