# CISO Dashboard — Proper Run Guide

This guide explains how to run the full CISO Dashboard project properly on Windows.

## 1. Project folders

Main project path:

```bash
C:\Shubham\Tehsec\CISO
```

Backend path:

```bash
C:\Shubham\Tehsec\CISO\backend
```

Frontend path:

```bash
C:\Shubham\Tehsec\CISO\frontend
```

---

## 2. Required software

Make sure these are installed:

1. Node.js
2. PostgreSQL
3. Git Bash / terminal
4. VS Code or any editor

Check Node:

```bash
node -v
npm -v
```

Check PostgreSQL is running from Windows Services or pgAdmin.

---

## 3. Backend `.env` file

File location:

```bash
C:\Shubham\Tehsec\CISO\backend\.env
```

Use this content:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=cisodashboard
DB_USER=postgres
DB_PASSWORD=root
JWT_SECRET=ciso_dashboard_super_secret_key_change_in_prod
JWT_EXPIRES_IN=8h

# SMTP email settings for OTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=sithdalvi123@gmail.com
SMTP_PASS=muttqztelmccmmfz
SMTP_FROM="SecureHub <sithdalvi123@gmail.com>"

# Frontend URL
APP_URL=http://localhost:5173
```

Important:

- `DB_PASSWORD` must match your PostgreSQL password.
- For Gmail SMTP, `SMTP_PASS` must be a Gmail App Password, not your normal Gmail password.
- If SMTP fails, backend mailer logs OTP in the backend terminal fallback mode.

---

## 4. Install dependencies

### Backend

```bash
cd C:/Shubham/Tehsec/CISO/backend
npm install
```

### Frontend

```bash
cd C:/Shubham/Tehsec/CISO/frontend
npm install
```

---

## 5. Database setup

If you are setting up the project fresh, run:

```bash
"C:/Program Files/PostgreSQL/16/bin/psql.exe" -U postgres -d postgres -f "C:/Shubham/Tehsec/CISO/backend/setup.sql"
```

It will ask for your PostgreSQL password.

Warning:

- `setup.sql` drops and recreates the database.
- Only run it if you are okay with resetting demo data.

---

## 6. Fix for OTP table error

If you see this error:

```text
error: relation "user_otps" does not exist
```

It means the OTP table was missing from PostgreSQL.

This project now auto-creates the table on backend startup through `backend/server.js`.

To apply the fix:

1. Stop backend terminal with `Ctrl + C`.
2. Start backend again:

```bash
cd C:/Shubham/Tehsec/CISO/backend
npm run dev
```

You should see startup messages and no `user_otps` crash.

Manual SQL fix, if needed:

```sql
CREATE TABLE IF NOT EXISTS user_otps (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_otps_user_lookup
  ON user_otps(user_id, is_used, created_at DESC);
```

---

## 7. Run backend

Open terminal 1:

```bash
cd C:/Shubham/Tehsec/CISO/backend
npm run dev
```

Expected output:

```text
Server running on http://10.134.243.128:3000
```

Backend API is available at:

```text
http://localhost:3000/api
```

---

## 8. Run frontend

Open terminal 2:

```bash
cd C:/Shubham/Tehsec/CISO/frontend
npm run dev
```

Expected Vite URL:

```text
http://localhost:5173
```

Open browser:

```text
http://localhost:5173/login
```

---

## 9. Login process

### Classic login flow

1. Open `/login`.
2. Enter username.
3. App checks username in database.
4. Enter password.
5. Backend verifies password.
6. OTP is sent to user's email.
7. Enter OTP.
8. App redirects to organisation selection.
9. Select organisation.
10. Dashboard opens.

API flow:

```text
POST /api/auth/check-username
POST /api/auth/login
POST /api/auth/otp/send
POST /api/auth/otp/verify
GET  /api/organisations/my
```

### 2FA login flow

1. Open `/login-2fa`.
2. Enter username, registered email, and password.
3. Backend verifies all three.
4. OTP is sent to email.
5. Enter OTP.
6. App redirects to organisation selection.

API flow:

```text
POST /api/auth/2fa/login
POST /api/auth/2fa/verify-otp
POST /api/auth/2fa/resend-otp
```

---

## 10. Demo users

Default demo users from `setup.sql`:

| Username | Password | Role | Organisations |
|---|---|---|---|
| Radhesh | Radhesh@123 | member | Techsec |
| Ramesh | Ramesh@123 | admin | Techsec, PCPL |
| Raju | Raju@123 | member | PCPL |
| Shubham | Shubham@123 | superAdmin | All orgs |
| Priya | Priya@123 | admin | Acme |
| Karan | Karan@123 | admin | Northwind |
| Anita | Anita@123 | admin | BlueShield |

---

## 11. User email setup

OTP is sent to the email stored in the `users.email` column.

Seeded emails are in:

```bash
backend/migrations/20260817_user_emails.sql
```

Example:

```sql
UPDATE users SET email = 'shubham@techsec.com' WHERE username = 'Shubham';
```

If you want OTP to come to your Gmail for testing, update the user email:

```sql
UPDATE users SET email = 'sithdalvi123@gmail.com' WHERE username = 'Shubham';
```

Run that query in pgAdmin against database:

```text
cisodashboard
```

---

## 12. Common problems and fixes

### Problem: `relation "user_otps" does not exist`

Fix:

```bash
cd C:/Shubham/Tehsec/CISO/backend
npm run dev
```

The backend now creates this table automatically.

### Problem: `Could not send OTP`

Check:

1. Backend is running.
2. `.env` SMTP settings are correct.
3. User has an email in database.
4. Gmail App Password is valid.

If SMTP fails, check backend terminal. The OTP may be printed there in fallback mode.

### Problem: frontend cannot reach backend

Make sure backend runs on port `3000` and frontend proxy/API points to `/api`.

### Problem: wrong PostgreSQL password

Update:

```env
DB_PASSWORD=root
```

in:

```bash
backend/.env
```

Use your actual PostgreSQL password.

---

## 13. Proper start order

Always start in this order:

1. PostgreSQL service
2. Backend
3. Frontend
4. Browser login page

Commands:

Terminal 1:

```bash
cd C:/Shubham/Tehsec/CISO/backend
npm run dev
```

Terminal 2:

```bash
cd C:/Shubham/Tehsec/CISO/frontend
npm run dev
```

Browser:

```text
http://localhost:5173/login
```

---

## 14. After code changes

If backend files change, nodemon usually restarts automatically.

If backend crashed, press `Ctrl + C`, then run:

```bash
npm run dev
```

If frontend page looks old, hard refresh browser:

```text
Ctrl + Shift + R
```
