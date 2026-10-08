# CISO Dashboard — Full-stack SaaS

A CISO/security operations dashboard built with:

- **Backend** — Node.js + Express + PostgreSQL (`pg`) + JWT + bcrypt + `node-cron`
- **Frontend** — React + Vite + Tailwind CSS + React Router + Axios
- **Background job** — runs every 5 minutes, refreshes API responses even when the frontend is closed

## Folder structure

```
CISODashboard/
├── backend/
│   ├── db.js
│   ├── server.js
│   ├── seed-users.js          # generate real bcrypt hashes for seed users
│   ├── schema.sql             # PostgreSQL DDL + seed inserts
│   ├── .env                   # DB creds + JWT secret
│   ├── middleware/
│   │   └── authMiddleware.js
│   └── routes/
│       ├── auth.js
│       ├── users.js
│       ├── organisations.js
│       ├── apiTokens.js
│       └── apiResponses.js
└── frontend/
    ├── index.html
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        ├── index.css
        ├── components/
        │   ├── AppLayout.jsx   # sidebar + outlet
        │   └── UI.jsx          # Card, Button, Input, Badge, StatCard
        └── pages/
            ├── Login.jsx
            ├── Dashboard.jsx
            ├── Organisations.jsx
            ├── Users.jsx
            ├── ApiTokens.jsx
            └── ApiResponses.jsx
```

## Quick start

### 1. Database

1. Create the database in pgAdmin: name **`CISODashboard`** on port **`5432`** (user `postgres`, password `root`).
2. Open a Query Tool against `CISODashboard` and run the contents of `backend/schema.sql`.

### 2. Backend

```bash
cd backend
npm install
# optional: generate fresh bcrypt hashes for the seed users
node seed-users.js
npm run dev
```

API will run on `http://localhost:5000`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

App will run on `http://localhost:5173` and proxy `/api` to the backend.

## Seed login credentials

The seeder sets passwords to:

| Username | Password     | Role        | Orgs |
|----------|--------------|-------------|------|
| Shubham  | Shubham@123  | superAdmin  | 1, 2 |
| Ramesh   | Ramesh@123   | admin       | 1, 2 |
| Radhesh  | Radhesh@123  | member      | 1    |
| Raju     | Raju@123     | member      | 2    |

## Enterprise Token & License Management System

The application includes an Enterprise License & Token management system designed for multi-tenant architecture with support for both **Online (Hosted SaaS)** and **Offline (Client On-Premise Install)** deployments.

### Deployment Modes (`DEPLOYMENT_MODE`)

Configured via environment variable `DEPLOYMENT_MODE=online|offline`.

#### Mode 1: Online (Hosted SaaS)
1. **Token Generation & Security**:
   - Every organisation is issued a unique license token bound to its organisation name, slug, start date, and end date.
   - Raw tokens (`ciso_lic_<hex>`) are hashed using **SHA-256** and stored securely in `org_tokens`. Raw tokens are displayed only once on creation.
2. **Access Control & Middleware**:
   - `orgMiddleware` and `validateOrgToken` automatically enforce validity on every request for non-superadmin users.
   - If a license expires (`end_date < today`), requests return HTTP `403 Forbidden` with `{ code: 'TOKEN_EXPIRED' }`, rendering the `LicenseExpiredBarrier` overlay. SuperAdmins are never blocked.
3. **Automated Maintenance & Notifications**:
   - A daily background job transitions expired tokens from `active` to `expired`.
   - Sends dark-themed email alerts to SuperAdmins upon expiry with deduplication (`expired_notified_at`), as well as proactive pre-expiry warnings at **30, 15, and 7 days** before expiry.
4. **Validity Extension**:
   - SuperAdmins can extend validity via the SuperAdmin Console (`PATCH /api/superadmin/orgs/:id/token/extend`).
   - Requires `newEndDate > currentEndDate` and a reason/note. On extension, access is restored immediately, notification flags are reset, and an audit trail entry is logged in `superadmin_audit_logs`.

#### Mode 2: Offline (Client On-Premise Install)
1. **Tamper-Proof Cryptographic Signing**:
   - Offline licenses are cryptographically signed using **RS256** (RSA-2048) with our vendor private key (`LICENSE_PRIVATE_KEY`).
   - The client install includes only the public key (`LICENSE_PUBLIC_KEY`) and verifies the signature at startup and on every request.
2. **Clock-Tampering & Rollback Protection**:
   - Tracks monotonically increasing timestamps in `license_clock_state`. If the system date goes backwards (> 5 minutes skew), validation is immediately blocked with `CLOCK_ROLLBACK_DETECTED`.
3. **Client Renewal Workflow**:
   - Client admins cannot manually extend dates.
   - On expiry, users see the License Expired Barrier with a **"Copy License Request Code"** button.
   - The client shares the request code with the vendor SuperAdmin.
   - The vendor SuperAdmin issues a signed `.lic` file or token using `node backend/scripts/issue-offline-license.js`.
   - The client admin uploads/pastes the signed token via the **"Upload / Paste New Token"** modal (`POST /api/superadmin/license/apply`), verifying the signature, advancing validity, and restoring access.
4. **Offline Notification Queue**:
   - If SMTP is unreachable on the client server, notification emails are queued in `pending_notifications` and retried automatically.

### Key Environment Variables (`.env`)

```env
# Deployment mode: online or offline
DEPLOYMENT_MODE=online

# Vendor superadmin contact email for license alerts
VENDOR_SUPERADMIN_EMAIL=support@techsec.com

# Pre-expiry warning alert thresholds in days
TOKEN_WARN_DAYS=30,15,7

# RSA-2048 keys for offline signed licenses
LICENSE_PUBLIC_KEY=
LICENSE_PRIVATE_KEY=
```

### Key CLI Scripts

```bash
# Generate RSA key pair for offline licenses
node backend/scripts/generate-license-keys.js

# Issue a cryptographically signed offline license token
node backend/scripts/issue-offline-license.js --org "Acme Corp" --slug "acme-corp" --end "2027-10-08"

# Run token service test suite
node --test backend/tests/tokenService.test.js
```
