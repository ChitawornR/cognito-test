# KYC Platform — Design Spec
Date: 2026-06-08

## Overview

Full-stack KYC document submission platform using AWS Cognito (email+password+Email OTP MFA, Google OAuth), Next.js frontend, Express backend, and MongoDB Atlas.

---

## 1. Architecture

```
┌─────────────────────────────────────────────┐
│  Next.js Frontend (port 3000)               │
│  ├── / homepage (public)                    │
│  ├── /login (public)                        │
│  ├── /register (public)                     │
│  ├── /verify-otp (public, step in flow)     │
│  ├── /upload (protected — navbar only)      │
│  └── /status (protected — navbar only)      │
└─────────────┬───────────────────────────────┘
              │ HTTP fetch with credentials
              │ HttpOnly Cookie (accessToken)
┌─────────────▼───────────────────────────────┐
│  Express Backend (port 4000)                │
│  ├── POST /api/auth/register                │
│  ├── POST /api/auth/verify-email            │
│  ├── POST /api/auth/login                   │
│  ├── POST /api/auth/verify-login-otp        │
│  ├── GET  /api/auth/google                  │
│  ├── GET  /api/auth/google/callback         │
│  ├── POST /api/auth/logout                  │
│  ├── GET  /api/auth/me                      │
│  ├── POST /api/forms (protected)            │
│  ├── GET  /api/forms (protected)            │
│  └── GET  /api/forms/:id/file (protected)   │
└──────┬──────────────┬────────────────────────┘
       │              │
┌──────▼──────┐ ┌─────▼──────────────────────┐
│  AWS Cognito│ │  MongoDB Atlas             │
│  User Pool  │ │  ├── users collection      │
│  Email MFA  │ │  ├── forms collection      │
│  + Google   │ │  └── GridFS (files)        │
└─────────────┘ └────────────────────────────┘
```

### Auth Strategy
- All Cognito SDK calls happen server-side in Express — `COGNITO_CLIENT_SECRET` never exposed to browser
- Tokens stored as HttpOnly cookies — inaccessible to JavaScript (XSS-safe)
- Backend middleware verifies `accessToken` against Cognito JWKS on every protected request
- Google OAuth uses Cognito authorization endpoint — custom UI is preserved for email/password flows

---

## 2. Cognito Configuration (Verified Working)

| Setting | Value |
|---|---|
| User Pool ID | `ap-southeast-1_Q8CK0wD6b` |
| Region | `ap-southeast-1` |
| Sign-in options | Email |
| Required attributes | `email`, `given_name`, `family_name` |
| MFA enforcement | Required |
| MFA method | Email OTP |
| Email provider | Amazon SES (`superbeaver.rr@hotmail.com`) |
| Auto-verified attributes | `email` |
| Google IdP | Configured |
| Cognito Domain | `ap-southeast-1q8ck0wd6b.auth.ap-southeast-1.amazoncognito.com` |
| App Client auth flows | `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_USER_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH` |
| OAuth grant type | Authorization code grant |
| OAuth scopes | `email`, `openid`, `profile` |
| Callback URL | `http://localhost:4000/api/auth/google/callback` |

---

## 3. Auth Flows

### Register (email + password)
```
POST /api/auth/register { email, password, firstName, lastName }
  → Cognito SignUp
  → Cognito sends OTP to email (via SES)
  → Frontend redirects to /verify-otp?email=xxx&context=register
POST /api/auth/verify-email { email, code }
  → Cognito ConfirmSignUp
  → Create user document in MongoDB
  → Frontend redirects to /login
```

### Login (email + password + Email MFA)
```
POST /api/auth/login { email, password }
  → Cognito InitiateAuth (USER_PASSWORD_AUTH)
  → Response: MFA_CHALLENGE (EMAIL_OTP)
  → Frontend redirects to /verify-otp?email=xxx&context=login&session=xxx
POST /api/auth/verify-login-otp { email, code, session }
  → Cognito RespondToAuthChallenge
  → Response: tokens (AccessToken, IdToken, RefreshToken)
  → Backend sets HttpOnly cookie
  → Frontend redirects to /
```

### Google OAuth
```
GET /api/auth/google
  → Backend redirects to Cognito authorization URL with Google IdP hint
User authenticates with Google → Cognito handles → callback
GET /api/auth/google/callback?code=xxx
  → Backend exchanges code for tokens
  → Upsert user in MongoDB (create if new, update if existing)
  → Set HttpOnly cookie
  → Redirect to /
```

### Logout
```
POST /api/auth/logout
  → Clear HttpOnly cookie
  → Cognito GlobalSignOut (invalidate tokens)
  → Frontend redirects to /
```

---

## 4. Data Models

### users collection
```typescript
{
  _id: ObjectId,
  cognitoSub: string,        // unique — Cognito user sub
  email: string,
  firstName: string,         // given_name
  lastName: string,          // family_name
  provider: "email" | "google",
  createdAt: Date,
  updatedAt: Date
}
```

### forms collection
```typescript
{
  _id: ObjectId,
  cognitoSub: string,        // foreign key → users.cognitoSub
  status: "pending" | "under_review" | "approved" | "rejected" | "cancelled",
  companyName: string,
  taxId: string,
  businessType: string,
  fileId: ObjectId,          // GridFS file _id
  fileName: string,
  fileMimeType: string,
  submittedAt: Date,
  updatedAt: Date
}
```

### GridFS (auto-managed)
- `fs.files` + `fs.chunks` collections
- Stores binary file data (ID card images)
- Referenced by `forms.fileId`

---

## 5. Frontend Pages & Navbar Behavior

### Navbar
| Auth state | Visible items |
|---|---|
| Not logged in | Logo, Login, Register |
| Logged in | Logo, Upload File, ติดตามสถานะ, Logout |

### Pages

| Route | Auth | Description |
|---|---|---|
| `/` | Public | Landing page with hero section + features. After login/register → always redirects here. |
| `/login` | Public | Email + password form. After submit → /verify-otp for MFA or error. Google login button → /api/auth/google. |
| `/register` | Public | Email + password + firstName + lastName form. After submit → /verify-otp for email verification. |
| `/verify-otp` | Public | Single OTP input. Context (register/login) and session passed via query params. |
| `/upload` | Protected | KYC form + file upload. Accessible only via navbar when logged in. |
| `/status` | Protected | List of submitted forms with status. Accessible only via navbar when logged in. |

---

## 6. Upload Form & IndexedDB Strategy

### Form fields
- Company name (ชื่อบริษัท)
- TAX ID (เลขประจำตัวผู้เสียภาษี)
- Business type (ประเภทธุรกิจ) — dropdown
- ID card file (ไฟล์บัตรประชาชน) — image upload

### IndexedDB flow
```
User selects file → save to IndexedDB immediately (key: cognitoSub)
User fills form fields → save draft to IndexedDB
User refreshes page → restore from IndexedDB (file + fields intact)
User submits → POST multipart/form-data to /api/forms
  → Backend stores file in GridFS
  → Backend stores form in MongoDB with status: "pending"
  → Backend cancels previous active form (status → "cancelled") if exists
  → Frontend clears IndexedDB entry
  → Frontend redirects to /status
```

### File storage
- Browser: IndexedDB (temporary, survives page refresh)
- Backend: MongoDB GridFS (permanent binary storage)
- MongoDB form document: stores `fileId` reference + `fileName` + `fileMimeType`

---

## 7. Form Status Tracking

### Status values
| Status | Meaning |
|---|---|
| `pending` | Submitted, awaiting review |
| `under_review` | Reviewer is processing |
| `approved` | Application approved |
| `rejected` | Application rejected |
| `cancelled` | Superseded by a newer submission |

### Business rule
A user can submit multiple forms. When a new form is submitted, any existing form with status `pending` or `under_review` is automatically set to `cancelled`. Only one active form at a time.

### Status page (/status)
- Lists all forms for the logged-in user (newest first)
- Shows status badge, company name, TAX ID, submission date
- Links to view submitted file

---

## 8. Backend Middleware

```typescript
// authMiddleware.ts
// Reads accessToken from HttpOnly cookie
// Verifies JWT signature against Cognito JWKS endpoint
// Attaches { cognitoSub, email } to req.user
// Returns 401 if missing or invalid
```

Applied to: `POST /api/forms`, `GET /api/forms`, `GET /api/forms/:id/file`

---

## 9. Environment Variables

### backend/.env
```env
# Cognito
COGNITO_USER_POOL_ID=ap-southeast-1_Q8CK0wD6b
AWS_REGION=ap-southeast-1
COGNITO_CLIENT_ID=3apa8832rhp9lc7fkf2nfph2h4
COGNITO_CLIENT_SECRET=65h1f9ob07705r33mskdbaqksu4fk5q0dv2lcgfusj9o2fp25vr
COGNITO_DOMAIN=https://ap-southeast-1q8ck0wd6b.auth.ap-southeast-1.amazoncognito.com

# Database
MONGODB_URI=mongodb+srv://...

# Google OAuth
GOOGLE_CLIENT_ID=889675021789-...
GOOGLE_CLIENT_SECRET=GOCSPX-...

# Config
FRONTEND_URL=http://localhost:3000
PORT=4000
```

### frontend/.env.local
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 10. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, TypeScript |
| Backend | Express, TypeScript, `@aws-sdk/client-cognito-identity-provider` |
| Database | MongoDB Atlas, Mongoose, GridFS |
| Auth | AWS Cognito (Email MFA + Google OAuth) |
| File (browser) | IndexedDB API |
| File (server) | MongoDB GridFS |
| Token storage | HttpOnly Cookie |
| JWT verification | `jwks-rsa` + Cognito JWKS endpoint |
