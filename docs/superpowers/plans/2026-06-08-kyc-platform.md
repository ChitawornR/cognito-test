# KYC Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack KYC document submission platform with AWS Cognito auth (email+OTP MFA + Google OAuth), file upload via GridFS, and form status tracking.

**Architecture:** Express backend handles all Cognito SDK calls server-side and stores tokens in HttpOnly cookies. Next.js frontend calls the backend API with `credentials: 'include'`. MongoDB Atlas stores users, forms, and files (GridFS).

**Tech Stack:** Next.js 16, React 19, Tailwind 4, Express, TypeScript, `@aws-sdk/client-cognito-identity-provider`, `aws-jwt-verify`, Mongoose, MongoDB GridFS, Multer, cookie-parser

---

## File Structure

```
aws-cognito-test/
├── backend/
│   ├── src/
│   │   ├── server.ts                        # Entry point — starts Express
│   │   ├── app.ts                           # Express app setup, CORS, routes
│   │   ├── config/
│   │   │   └── database.ts                  # MongoDB Atlas connection
│   │   ├── middleware/
│   │   │   └── auth.middleware.ts           # JWT verification via Cognito JWKS
│   │   ├── services/
│   │   │   ├── cognito.service.ts           # All Cognito SDK calls
│   │   │   └── gridfs.service.ts            # GridFS upload/download
│   │   ├── models/
│   │   │   ├── user.model.ts               # Mongoose User schema
│   │   │   └── form.model.ts               # Mongoose Form schema
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts          # Auth endpoints (register, login, google, logout, me)
│   │   │   └── forms.controller.ts         # Forms endpoints (submit, list, get file)
│   │   └── routes/
│   │       ├── auth.routes.ts              # /api/auth/* routes
│   │       └── forms.routes.ts             # /api/forms/* routes
│   ├── package.json
│   ├── tsconfig.json
│   └── .env                               # Already exists
│
└── frontend/
    ├── app/
    │   ├── layout.tsx                      # Root layout with Navbar
    │   ├── page.tsx                        # Homepage (landing)
    │   ├── login/page.tsx                  # Login form
    │   ├── register/page.tsx               # Register form
    │   ├── verify-otp/page.tsx             # OTP verification (register + login)
    │   ├── upload/page.tsx                 # KYC upload form (protected)
    │   └── status/page.tsx                 # Form status list (protected)
    ├── components/
    │   └── Navbar.tsx                      # Auth-aware navigation
    ├── lib/
    │   ├── api.ts                          # fetch wrapper with credentials
    │   ├── auth-context.tsx                # Auth state (user info, logout)
    │   └── indexeddb.ts                    # Draft + file persistence
    └── .env.local                          # NEXT_PUBLIC_API_URL
```

---

## Task 1: Backend — Project Scaffold

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/src/server.ts`
- Create: `backend/src/app.ts`

- [ ] **Step 1: Install dependencies**

```bash
cd /Users/digioth/Desktop/test/aws-cognito-test/backend
npm init -y
npm install express cors cookie-parser dotenv mongoose multer \
  @aws-sdk/client-cognito-identity-provider aws-jwt-verify
npm install -D typescript ts-node-dev @types/express @types/cors \
  @types/cookie-parser @types/node @types/multer \
  jest ts-jest @types/jest supertest @types/supertest
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Update `backend/package.json` scripts**

Replace the `scripts` section in package.json:

```json
{
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "jest --runInBand"
  },
  "jest": {
    "preset": "ts-jest",
    "testEnvironment": "node",
    "testMatch": ["**/*.test.ts"]
  }
}
```

- [ ] **Step 4: Create `backend/src/app.ts`**

```typescript
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'

dotenv.config()

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

export default app
```

- [ ] **Step 5: Create `backend/src/server.ts`**

```typescript
import app from './app'
import { connectDB } from './config/database'

const PORT = process.env.PORT || 4000

async function main() {
  await connectDB()
  app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`)
  })
}

main()
```

- [ ] **Step 6: Verify server starts**

```bash
cd /Users/digioth/Desktop/test/aws-cognito-test/backend
npm run dev
```

Expected: `Backend running on http://localhost:4000` (will error on DB — that's fine, DB is next)

---

## Task 2: Backend — MongoDB Connection + Models

**Files:**
- Create: `backend/src/config/database.ts`
- Create: `backend/src/models/user.model.ts`
- Create: `backend/src/models/form.model.ts`

- [ ] **Step 1: Create `backend/src/config/database.ts`**

```typescript
import mongoose from 'mongoose'

export async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI is not set')
  await mongoose.connect(uri)
  console.log('MongoDB connected')
}
```

- [ ] **Step 2: Create `backend/src/models/user.model.ts`**

```typescript
import mongoose, { Schema, Document } from 'mongoose'

export interface IUser extends Document {
  cognitoSub: string
  email: string
  firstName: string
  lastName: string
  provider: 'email' | 'google'
  createdAt: Date
  updatedAt: Date
}

const UserSchema = new Schema<IUser>(
  {
    cognitoSub: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    provider: { type: String, enum: ['email', 'google'], required: true },
  },
  { timestamps: true }
)

export const User = mongoose.model<IUser>('User', UserSchema)
```

- [ ] **Step 3: Create `backend/src/models/form.model.ts`**

```typescript
import mongoose, { Schema, Document, Types } from 'mongoose'

export type FormStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'cancelled'

export interface IForm extends Document {
  cognitoSub: string
  status: FormStatus
  companyName: string
  taxId: string
  businessType: string
  fileId: Types.ObjectId
  fileName: string
  fileMimeType: string
  submittedAt: Date
  updatedAt: Date
}

const FormSchema = new Schema<IForm>(
  {
    cognitoSub: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['pending', 'under_review', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    companyName: { type: String, required: true },
    taxId: { type: String, required: true },
    businessType: { type: String, required: true },
    fileId: { type: Schema.Types.ObjectId, required: true },
    fileName: { type: String, required: true },
    fileMimeType: { type: String, required: true },
    submittedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

export const Form = mongoose.model<IForm>('Form', FormSchema)
```

- [ ] **Step 4: Restart server and verify MongoDB connects**

```bash
npm run dev
```

Expected output includes: `MongoDB connected`

---

## Task 3: Backend — Cognito Service

**Files:**
- Create: `backend/src/services/cognito.service.ts`

- [ ] **Step 1: Create `backend/src/services/cognito.service.ts`**

```typescript
import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  RespondToAuthChallengeCommand,
  GlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import crypto from 'crypto'

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
})

const CLIENT_ID = process.env.COGNITO_CLIENT_ID!
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET!

function computeSecretHash(username: string): string {
  return crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(username + CLIENT_ID)
    .digest('base64')
}

export async function cognitoSignUp(
  email: string,
  password: string,
  firstName: string,
  lastName: string
): Promise<void> {
  await client.send(
    new SignUpCommand({
      ClientId: CLIENT_ID,
      SecretHash: computeSecretHash(email),
      Username: email,
      Password: password,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'given_name', Value: firstName },
        { Name: 'family_name', Value: lastName },
      ],
    })
  )
}

export async function cognitoConfirmSignUp(email: string, code: string): Promise<void> {
  await client.send(
    new ConfirmSignUpCommand({
      ClientId: CLIENT_ID,
      SecretHash: computeSecretHash(email),
      Username: email,
      ConfirmationCode: code,
    })
  )
}

export interface LoginResult {
  challengeName?: string
  session?: string
  tokens?: {
    accessToken: string
    idToken: string
    refreshToken: string
  }
}

export async function cognitoInitiateLogin(
  email: string,
  password: string
): Promise<LoginResult> {
  const response = await client.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: CLIENT_ID,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
        SECRET_HASH: computeSecretHash(email),
      },
    })
  )

  if (response.ChallengeName) {
    return {
      challengeName: response.ChallengeName,
      session: response.Session,
    }
  }

  return {
    tokens: {
      accessToken: response.AuthenticationResult!.AccessToken!,
      idToken: response.AuthenticationResult!.IdToken!,
      refreshToken: response.AuthenticationResult!.RefreshToken!,
    },
  }
}

export async function cognitoRespondToMfa(
  email: string,
  code: string,
  session: string
): Promise<{ accessToken: string; idToken: string; refreshToken: string }> {
  const response = await client.send(
    new RespondToAuthChallengeCommand({
      ClientId: CLIENT_ID,
      ChallengeName: 'EMAIL_OTP',
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        EMAIL_OTP_CODE: code,
        SECRET_HASH: computeSecretHash(email),
      },
    })
  )

  return {
    accessToken: response.AuthenticationResult!.AccessToken!,
    idToken: response.AuthenticationResult!.IdToken!,
    refreshToken: response.AuthenticationResult!.RefreshToken!,
  }
}

export async function cognitoGlobalSignOut(accessToken: string): Promise<void> {
  await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }))
}

export function buildGoogleAuthUrl(redirectUri: string): string {
  const domain = process.env.COGNITO_DOMAIN!
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    scope: 'email openid profile',
    redirect_uri: redirectUri,
    identity_provider: 'Google',
  })
  return `${domain}/oauth2/authorize?${params.toString()}`
}

export async function cognitoExchangeCode(
  code: string,
  redirectUri: string
): Promise<{ accessToken: string; idToken: string; refreshToken: string }> {
  const domain = process.env.COGNITO_DOMAIN!
  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')

  const response = await fetch(`${domain}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed: ${text}`)
  }

  const data = await response.json() as {
    access_token: string
    id_token: string
    refresh_token: string
  }

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/digioth/Desktop/test/aws-cognito-test/backend
npx tsc --noEmit
```

Expected: No errors

---

## Task 4: Backend — Auth Middleware

**Files:**
- Create: `backend/src/middleware/auth.middleware.ts`

- [ ] **Step 1: Create `backend/src/middleware/auth.middleware.ts`**

```typescript
import { Request, Response, NextFunction } from 'express'
import { CognitoJwtVerifier } from 'aws-jwt-verify'

const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  tokenUse: 'access',
})

export interface AuthRequest extends Request {
  user?: {
    cognitoSub: string
    email: string
  }
}

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const token = req.cookies?.accessToken

  if (!token) {
    res.status(401).json({ error: 'No token provided' })
    return
  }

  try {
    const payload = await verifier.verify(token)
    req.user = {
      cognitoSub: payload.sub,
      email: payload.email as string,
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

---

## Task 5: Backend — Auth Controller (email flows)

**Files:**
- Create: `backend/src/controllers/auth.controller.ts`

- [ ] **Step 1: Create `backend/src/controllers/auth.controller.ts`**

```typescript
import { Request, Response } from 'express'
import { CognitoJwtVerifier } from 'aws-jwt-verify'
import {
  cognitoSignUp,
  cognitoConfirmSignUp,
  cognitoInitiateLogin,
  cognitoRespondToMfa,
  cognitoGlobalSignOut,
  buildGoogleAuthUrl,
  cognitoExchangeCode,
} from '../services/cognito.service'
import { User } from '../models/user.model'
import { AuthRequest } from '../middleware/auth.middleware'

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: false,
  sameSite: 'lax' as const,
}

const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  tokenUse: 'id',
})

function setTokenCookies(
  res: Response,
  tokens: { accessToken: string; idToken: string; refreshToken: string }
): void {
  res.cookie('accessToken', tokens.accessToken, { ...COOKIE_OPTIONS, maxAge: 3600 * 1000 })
  res.cookie('idToken', tokens.idToken, { ...COOKIE_OPTIONS, maxAge: 3600 * 1000 })
  res.cookie('refreshToken', tokens.refreshToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 3600 * 1000 })
}

function clearTokenCookies(res: Response): void {
  res.clearCookie('accessToken', COOKIE_OPTIONS)
  res.clearCookie('idToken', COOKIE_OPTIONS)
  res.clearCookie('refreshToken', COOKIE_OPTIONS)
}

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const { email, password, firstName, lastName } = req.body
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }
    await cognitoSignUp(email, password, firstName, lastName)
    res.status(201).json({ message: 'Registration successful. Check your email for OTP.' })
  } catch (err: unknown) {
    const error = err as Error
    res.status(400).json({ error: error.message })
  }
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  try {
    const { email, code } = req.body
    if (!email || !code) {
      res.status(400).json({ error: 'Missing email or code' })
      return
    }
    await cognitoConfirmSignUp(email, code)

    // Cognito has confirmed email — user row will be created on first login via /me
    res.json({ message: 'Email verified. You can now log in.' })
  } catch (err: unknown) {
    const error = err as Error
    res.status(400).json({ error: error.message })
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ error: 'Missing email or password' })
      return
    }
    const result = await cognitoInitiateLogin(email, password)

    if (result.challengeName) {
      res.json({
        challenge: result.challengeName,
        session: result.session,
      })
      return
    }

    setTokenCookies(res, result.tokens!)
    res.json({ message: 'Login successful' })
  } catch (err: unknown) {
    const error = err as Error
    res.status(401).json({ error: error.message })
  }
}

export async function verifyLoginOtp(req: Request, res: Response): Promise<void> {
  try {
    const { email, code, session } = req.body
    if (!email || !code || !session) {
      res.status(400).json({ error: 'Missing email, code, or session' })
      return
    }
    const tokens = await cognitoRespondToMfa(email, code, session)
    setTokenCookies(res, tokens)

    // Upsert user in MongoDB after first email login
    const idPayload = await idVerifier.verify(tokens.idToken)
    await User.findOneAndUpdate(
      { cognitoSub: idPayload.sub },
      {
        cognitoSub: idPayload.sub,
        email: idPayload.email as string,
        firstName: idPayload.given_name as string,
        lastName: idPayload.family_name as string,
        provider: 'email',
      },
      { upsert: true, new: true }
    )

    res.json({ message: 'MFA verified. Login successful.' })
  } catch (err: unknown) {
    const error = err as Error
    res.status(401).json({ error: error.message })
  }
}

export async function logout(req: AuthRequest, res: Response): Promise<void> {
  try {
    const accessToken = req.cookies?.accessToken
    if (accessToken) {
      await cognitoGlobalSignOut(accessToken)
    }
  } catch {
    // Ignore Cognito errors on logout (token may be expired)
  } finally {
    clearTokenCookies(res)
    res.json({ message: 'Logged out' })
  }
}

export async function me(req: AuthRequest, res: Response): Promise<void> {
  try {
    const user = await User.findOne({ cognitoSub: req.user!.cognitoSub })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({
      cognitoSub: user.cognitoSub,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      provider: user.provider,
    })
  } catch (err: unknown) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

export async function googleAuth(_req: Request, res: Response): Promise<void> {
  const redirectUri = `${process.env.FRONTEND_URL?.replace('3000', '4000') ?? 'http://localhost:4000'}/api/auth/google/callback`
  const url = buildGoogleAuthUrl(redirectUri)
  res.redirect(url)
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.query
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing code' })
      return
    }

    const redirectUri = `http://localhost:4000/api/auth/google/callback`
    const tokens = await cognitoExchangeCode(code, redirectUri)
    setTokenCookies(res, tokens)

    const idPayload = await idVerifier.verify(tokens.idToken)
    await User.findOneAndUpdate(
      { cognitoSub: idPayload.sub },
      {
        cognitoSub: idPayload.sub,
        email: idPayload.email as string,
        firstName: idPayload.given_name as string ?? (idPayload.name as string)?.split(' ')[0] ?? '',
        lastName: idPayload.family_name as string ?? (idPayload.name as string)?.split(' ').slice(1).join(' ') ?? '',
        provider: 'google',
      },
      { upsert: true, new: true }
    )

    res.redirect(process.env.FRONTEND_URL ?? 'http://localhost:3000')
  } catch (err: unknown) {
    const error = err as Error
    res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=${encodeURIComponent(error.message)}`)
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

---

## Task 6: Backend — GridFS Service + Forms Controller

**Files:**
- Create: `backend/src/services/gridfs.service.ts`
- Create: `backend/src/controllers/forms.controller.ts`

- [ ] **Step 1: Create `backend/src/services/gridfs.service.ts`**

```typescript
import mongoose from 'mongoose'
import { GridFSBucket, ObjectId } from 'mongodb'
import { Readable } from 'stream'

function getBucket(): GridFSBucket {
  const db = mongoose.connection.db
  if (!db) throw new Error('Database not connected')
  return new GridFSBucket(db, { bucketName: 'fs' })
}

export async function uploadFile(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<ObjectId> {
  const bucket = getBucket()
  const stream = bucket.openUploadStream(filename, {
    metadata: { contentType: mimeType },
  })

  return new Promise((resolve, reject) => {
    const readable = Readable.from(buffer)
    readable.pipe(stream)
    stream.on('finish', () => resolve(stream.id as ObjectId))
    stream.on('error', reject)
  })
}

export async function downloadFile(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; contentType: string; filename: string }> {
  const bucket = getBucket()
  const objectId = new ObjectId(fileId)

  const files = await bucket.find({ _id: objectId }).toArray()
  if (!files.length) throw new Error('File not found')

  const file = files[0]
  const contentType = (file.metadata?.contentType as string) ?? 'application/octet-stream'
  const downloadStream = bucket.openDownloadStream(objectId)

  return { stream: downloadStream, contentType, filename: file.filename }
}

export async function deleteFile(fileId: string): Promise<void> {
  const bucket = getBucket()
  await bucket.delete(new ObjectId(fileId))
}
```

- [ ] **Step 2: Create `backend/src/controllers/forms.controller.ts`**

```typescript
import { Response } from 'express'
import { AuthRequest } from '../middleware/auth.middleware'
import { Form } from '../models/form.model'
import { uploadFile, downloadFile } from '../services/gridfs.service'

export async function submitForm(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { companyName, taxId, businessType } = req.body
    const file = req.file

    if (!companyName || !taxId || !businessType) {
      res.status(400).json({ error: 'Missing required fields' })
      return
    }
    if (!file) {
      res.status(400).json({ error: 'ID card file is required' })
      return
    }

    const cognitoSub = req.user!.cognitoSub

    // Cancel any active forms
    await Form.updateMany(
      { cognitoSub, status: { $in: ['pending', 'under_review'] } },
      { status: 'cancelled' }
    )

    // Upload file to GridFS
    const fileId = await uploadFile(file.buffer, file.originalname, file.mimetype)

    const form = await Form.create({
      cognitoSub,
      companyName,
      taxId,
      businessType,
      fileId,
      fileName: file.originalname,
      fileMimeType: file.mimetype,
      submittedAt: new Date(),
    })

    res.status(201).json({
      id: form._id,
      status: form.status,
      companyName: form.companyName,
      taxId: form.taxId,
      businessType: form.businessType,
      submittedAt: form.submittedAt,
    })
  } catch (err: unknown) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

export async function getForms(req: AuthRequest, res: Response): Promise<void> {
  try {
    const forms = await Form.find({ cognitoSub: req.user!.cognitoSub })
      .sort({ submittedAt: -1 })
      .select('-__v')

    res.json(forms.map((f) => ({
      id: f._id,
      status: f.status,
      companyName: f.companyName,
      taxId: f.taxId,
      businessType: f.businessType,
      fileName: f.fileName,
      submittedAt: f.submittedAt,
      updatedAt: f.updatedAt,
    })))
  } catch (err: unknown) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}

export async function getFormFile(req: AuthRequest, res: Response): Promise<void> {
  try {
    const form = await Form.findOne({
      _id: req.params.id,
      cognitoSub: req.user!.cognitoSub,
    })

    if (!form) {
      res.status(404).json({ error: 'Form not found' })
      return
    }

    const { stream, contentType, filename } = await downloadFile(form.fileId.toString())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    stream.pipe(res)
  } catch (err: unknown) {
    const error = err as Error
    res.status(500).json({ error: error.message })
  }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: No errors

---

## Task 7: Backend — Routes + App Wiring

**Files:**
- Create: `backend/src/routes/auth.routes.ts`
- Create: `backend/src/routes/forms.routes.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create `backend/src/routes/auth.routes.ts`**

```typescript
import { Router } from 'express'
import {
  register,
  verifyEmail,
  login,
  verifyLoginOtp,
  logout,
  me,
  googleAuth,
  googleCallback,
} from '../controllers/auth.controller'
import { authMiddleware } from '../middleware/auth.middleware'

const router = Router()

router.post('/register', register)
router.post('/verify-email', verifyEmail)
router.post('/login', login)
router.post('/verify-login-otp', verifyLoginOtp)
router.post('/logout', logout)
router.get('/me', authMiddleware, me)
router.get('/google', googleAuth)
router.get('/google/callback', googleCallback)

export default router
```

- [ ] **Step 2: Create `backend/src/routes/forms.routes.ts`**

```typescript
import { Router } from 'express'
import multer from 'multer'
import { authMiddleware } from '../middleware/auth.middleware'
import { submitForm, getForms, getFormFile } from '../controllers/forms.controller'

const router = Router()
const upload = multer({ storage: multer.memoryStorage() })

router.use(authMiddleware)
router.post('/', upload.single('file'), submitForm)
router.get('/', getForms)
router.get('/:id/file', getFormFile)

export default router
```

- [ ] **Step 3: Update `backend/src/app.ts` to mount routes**

```typescript
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.routes'
import formsRoutes from './routes/forms.routes'

dotenv.config()

const app = express()

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}))
app.use(express.json())
app.use(cookieParser())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth', authRoutes)
app.use('/api/forms', formsRoutes)

export default app
```

- [ ] **Step 4: Final compile check + start server**

```bash
npx tsc --noEmit
npm run dev
```

Expected: Server starts, MongoDB connects, no TypeScript errors

- [ ] **Step 5: Smoke test health endpoint**

```bash
curl http://localhost:4000/health
```

Expected: `{"status":"ok"}`

---

## Task 8: Frontend — Setup + API Client + Auth Context

**Files:**
- Create: `frontend/.env.local`
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/auth-context.tsx`

- [ ] **Step 1: Create `frontend/.env.local`**

```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

- [ ] **Step 2: Add `idb` package for IndexedDB**

```bash
cd /Users/digioth/Desktop/test/aws-cognito-test/frontend
pnpm add idb
```

- [ ] **Step 3: Create `frontend/lib/api.ts`**

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export async function apiRequest<T = unknown>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function apiUpload<T = unknown>(
  path: string,
  formData: FormData
): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Upload failed' }))
    throw new Error(body.error ?? `HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}
```

- [ ] **Step 4: Create `frontend/lib/auth-context.tsx`**

```typescript
'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { apiRequest } from './api'

interface AuthUser {
  cognitoSub: string
  email: string
  firstName: string
  lastName: string
  provider: 'email' | 'google'
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  logout: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchUser() {
    try {
      const data = await apiRequest<AuthUser>('/api/auth/me')
      setUser(data)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try {
      await apiRequest('/api/auth/logout', { method: 'POST' })
    } finally {
      setUser(null)
    }
  }

  useEffect(() => { fetchUser() }, [])

  return (
    <AuthContext.Provider value={{ user, loading, refresh: fetchUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
```

---

## Task 9: Frontend — Navbar + Root Layout

**Files:**
- Create: `frontend/components/Navbar.tsx`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Create `frontend/components/Navbar.tsx`**

```typescript
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '../lib/auth-context'

export default function Navbar() {
  const { user, loading, logout } = useAuth()
  const router = useRouter()

  async function handleLogout() {
    await logout()
    router.push('/')
  }

  return (
    <nav className="w-full border-b border-gray-200 bg-white px-6 py-4">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <Link href="/" className="text-xl font-bold text-blue-600">
          KYC Platform
        </Link>

        {!loading && (
          <div className="flex items-center gap-6">
            {user ? (
              <>
                <Link
                  href="/upload"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  Upload File
                </Link>
                <Link
                  href="/status"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  ติดตามสถานะ
                </Link>
                <button
                  onClick={handleLogout}
                  className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-sm font-medium text-gray-700 hover:text-blue-600"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}
```

- [ ] **Step 2: Update `frontend/app/layout.tsx`**

```typescript
import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '../lib/auth-context'
import Navbar from '../components/Navbar'

export const metadata: Metadata = {
  title: 'KYC Platform',
  description: 'Business document verification system',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen bg-gray-50">
        <AuthProvider>
          <Navbar />
          <main>{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
```

---

## Task 10: Frontend — Homepage

**Files:**
- Modify: `frontend/app/page.tsx`

- [ ] **Step 1: Replace `frontend/app/page.tsx`**

```typescript
import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          ยืนยันตัวตนธุรกิจของคุณ
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          ระบบตรวจสอบเอกสารธุรกิจ — สะดวก รวดเร็ว ปลอดภัย
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/register"
            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            เริ่มต้นใช้งาน
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-gray-300 px-6 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
        {[
          { icon: '🔒', title: 'ปลอดภัย', desc: 'เข้ารหัสด้วย AWS Cognito + Email OTP ทุกครั้งที่ login' },
          { icon: '⚡', title: 'รวดเร็ว', desc: 'ส่งเอกสารได้ในไม่กี่นาที ระบบจัดเก็บอัตโนมัติ' },
          { icon: '📊', title: 'ติดตามสถานะ', desc: 'ตรวจสอบสถานะเอกสารได้ตลอดเวลาผ่าน dashboard' },
        ].map((f) => (
          <div key={f.title} className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="text-3xl">{f.icon}</div>
            <h3 className="mt-3 text-lg font-semibold text-gray-900">{f.title}</h3>
            <p className="mt-2 text-sm text-gray-600">{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Task 11: Frontend — Login Page

**Files:**
- Create: `frontend/app/login/page.tsx`

- [ ] **Step 1: Create `frontend/app/login/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiRequest } from '../../lib/api'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const data = await apiRequest<{ challenge?: string; session?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })

      if (data.challenge === 'EMAIL_OTP') {
        router.push(`/verify-otp?email=${encodeURIComponent(email)}&context=login&session=${encodeURIComponent(data.session ?? '')}`)
      } else {
        router.push('/')
      }
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-sm px-6">
      <h1 className="text-2xl font-bold text-gray-900">เข้าสู่ระบบ</h1>
      <p className="mt-2 text-sm text-gray-600">
        ยังไม่มีบัญชี?{' '}
        <Link href="/register" className="text-blue-600 hover:underline">
          สมัครสมาชิก
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
        </button>
      </form>

      <div className="mt-4">
        <div className="relative flex items-center">
          <div className="flex-1 border-t border-gray-300" />
          <span className="mx-3 text-xs text-gray-500">หรือ</span>
          <div className="flex-1 border-t border-gray-300" />
        </div>
        <a
          href={`${API}/api/auth/google`}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </a>
      </div>
    </div>
  )
}
```

---

## Task 12: Frontend — Register Page

**Files:**
- Create: `frontend/app/register/page.tsx`

- [ ] **Step 1: Create `frontend/app/register/page.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { apiRequest } from '../../lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      router.push(`/verify-otp?email=${encodeURIComponent(form.email)}&context=register`)
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-6">
      <h1 className="text-2xl font-bold text-gray-900">สมัครสมาชิก</h1>
      <p className="mt-2 text-sm text-gray-600">
        มีบัญชีแล้ว?{' '}
        <Link href="/login" className="text-blue-600 hover:underline">
          เข้าสู่ระบบ
        </Link>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">ชื่อ</label>
            <input
              name="firstName"
              required
              value={form.firstName}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">นามสกุล</label>
            <input
              name="lastName"
              required
              value={form.lastName}
              onChange={handleChange}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Email</label>
          <input
            name="email"
            type="email"
            required
            value={form.email}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input
            name="password"
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">อย่างน้อย 8 ตัว มีตัวพิมพ์ใหญ่ ตัวเลข และอักขระพิเศษ</p>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'กำลังสมัคร...' : 'สมัครสมาชิก'}
        </button>
      </form>
    </div>
  )
}
```

---

## Task 13: Frontend — Verify OTP Page

**Files:**
- Create: `frontend/app/verify-otp/page.tsx`

- [ ] **Step 1: Create `frontend/app/verify-otp/page.tsx`**

```typescript
'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { apiRequest } from '../../lib/api'
import { useAuth } from '../../lib/auth-context'

function VerifyOtpForm() {
  const router = useRouter()
  const params = useSearchParams()
  const { refresh } = useAuth()

  const email = params.get('email') ?? ''
  const context = params.get('context') ?? 'register'
  const session = params.get('session') ?? ''

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      if (context === 'login') {
        await apiRequest('/api/auth/verify-login-otp', {
          method: 'POST',
          body: JSON.stringify({ email, code, session }),
        })
        await refresh()
        router.push('/')
      } else {
        await apiRequest('/api/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ email, code }),
        })
        router.push('/login')
      }
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto mt-20 max-w-sm px-6">
      <h1 className="text-2xl font-bold text-gray-900">
        {context === 'login' ? 'ยืนยัน OTP' : 'ยืนยัน Email'}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        เราได้ส่งรหัส 6 หลักไปที่ <strong>{email}</strong>
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">รหัส OTP</label>
          <input
            type="text"
            required
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-center text-xl font-mono tracking-widest focus:border-blue-500 focus:outline-none"
            placeholder="000000"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading || code.length !== 6}
          className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'กำลังตรวจสอบ...' : 'ยืนยัน'}
        </button>
      </form>
    </div>
  )
}

export default function VerifyOtpPage() {
  return (
    <Suspense>
      <VerifyOtpForm />
    </Suspense>
  )
}
```

---

## Task 14: Frontend — IndexedDB Utility

**Files:**
- Create: `frontend/lib/indexeddb.ts`

- [ ] **Step 1: Create `frontend/lib/indexeddb.ts`**

```typescript
import { openDB } from 'idb'

const DB_NAME = 'kyc-drafts'
const STORE = 'form-drafts'

interface FormDraft {
  cognitoSub: string
  companyName: string
  taxId: string
  businessType: string
  fileName?: string
  fileType?: string
  fileData?: ArrayBuffer
}

async function getDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore(STORE, { keyPath: 'cognitoSub' })
    },
  })
}

export async function saveDraft(draft: FormDraft): Promise<void> {
  const db = await getDB()
  await db.put(STORE, draft)
}

export async function loadDraft(cognitoSub: string): Promise<FormDraft | undefined> {
  const db = await getDB()
  return db.get(STORE, cognitoSub)
}

export async function clearDraft(cognitoSub: string): Promise<void> {
  const db = await getDB()
  await db.delete(STORE, cognitoSub)
}
```

---

## Task 15: Frontend — Upload Form Page

**Files:**
- Create: `frontend/app/upload/page.tsx`

- [ ] **Step 1: Create `frontend/app/upload/page.tsx`**

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../lib/auth-context'
import { apiUpload } from '../../lib/api'
import { saveDraft, loadDraft, clearDraft } from '../../lib/indexeddb'

const BUSINESS_TYPES = [
  'บริษัทจำกัด',
  'ห้างหุ้นส่วนจำกัด',
  'บุคคลธรรมดา',
  'ร้านค้า',
  'อื่นๆ',
]

export default function UploadPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [form, setForm] = useState({ companyName: '', taxId: '', businessType: '' })
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    loadDraft(user.cognitoSub).then((draft) => {
      if (!draft) return
      setForm({
        companyName: draft.companyName,
        taxId: draft.taxId,
        businessType: draft.businessType,
      })
      if (draft.fileData && draft.fileName && draft.fileType) {
        const restored = new File([draft.fileData], draft.fileName, { type: draft.fileType })
        setFile(restored)
        setDraftRestored(true)
      }
    })
  }, [user])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const updated = { ...form, [e.target.name]: e.target.value }
    setForm(updated)
    if (user) {
      saveDraft({
        cognitoSub: user.cognitoSub,
        ...updated,
        fileName: file?.name,
        fileType: file?.type,
      })
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected || !user) return
    setFile(selected)
    const buffer = await selected.arrayBuffer()
    await saveDraft({
      cognitoSub: user.cognitoSub,
      ...form,
      fileName: selected.name,
      fileType: selected.type,
      fileData: buffer,
    })
    setDraftRestored(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('กรุณาเลือกไฟล์บัตรประชาชน'); return }
    setError('')
    setSubmitting(true)

    try {
      const fd = new FormData()
      fd.append('companyName', form.companyName)
      fd.append('taxId', form.taxId)
      fd.append('businessType', form.businessType)
      fd.append('file', file)

      await apiUpload('/api/forms', fd)
      await clearDraft(user!.cognitoSub)
      router.push('/status')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <div className="mx-auto mt-10 max-w-lg px-6">
      <h1 className="text-2xl font-bold text-gray-900">ยื่นเอกสาร KYC</h1>
      <p className="mt-2 text-sm text-gray-600">กรอกข้อมูลบริษัทและแนบบัตรประชาชน</p>

      {draftRestored && (
        <div className="mt-3 rounded-md bg-blue-50 px-4 py-2 text-sm text-blue-700">
          ✓ กู้คืนข้อมูลที่กรอกไว้แล้ว
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700">ชื่อบริษัท</label>
          <input
            name="companyName"
            required
            value={form.companyName}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">TAX ID (เลขประจำตัวผู้เสียภาษี)</label>
          <input
            name="taxId"
            required
            value={form.taxId}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">ประเภทธุรกิจ</label>
          <select
            name="businessType"
            required
            value={form.businessType}
            onChange={handleChange}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">-- เลือกประเภทธุรกิจ --</option>
            {BUSINESS_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            ไฟล์บัตรประจำตัวประชาชน
          </label>
          <div
            onClick={() => fileRef.current?.click()}
            className="mt-1 cursor-pointer rounded-md border-2 border-dashed border-gray-300 p-6 text-center hover:border-blue-400"
          >
            {file ? (
              <p className="text-sm text-gray-700">📄 {file.name}</p>
            ) : (
              <p className="text-sm text-gray-500">คลิกเพื่อเลือกไฟล์ (JPG, PNG, PDF)</p>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'กำลังส่ง...' : 'ส่งเอกสาร'}
        </button>
      </form>
    </div>
  )
}
```

---

## Task 16: Frontend — Status Page

**Files:**
- Create: `frontend/app/status/page.tsx`

- [ ] **Step 1: Create `frontend/app/status/page.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '../../lib/auth-context'
import { apiRequest } from '../../lib/api'

interface FormEntry {
  id: string
  status: 'pending' | 'under_review' | 'approved' | 'rejected' | 'cancelled'
  companyName: string
  taxId: string
  businessType: string
  fileName: string
  submittedAt: string
  updatedAt: string
}

const STATUS_LABELS: Record<FormEntry['status'], { label: string; color: string }> = {
  pending: { label: 'รอดำเนินการ', color: 'bg-yellow-100 text-yellow-800' },
  under_review: { label: 'กำลังตรวจสอบ', color: 'bg-blue-100 text-blue-800' },
  approved: { label: 'อนุมัติแล้ว', color: 'bg-green-100 text-green-800' },
  rejected: { label: 'ปฏิเสธ', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'ยกเลิก', color: 'bg-gray-100 text-gray-600' },
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

export default function StatusPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [forms, setForms] = useState<FormEntry[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<FormEntry[]>('/api/forms')
      .then(setForms)
      .catch(console.error)
      .finally(() => setFetching(false))
  }, [user])

  if (loading || !user) return null

  return (
    <div className="mx-auto mt-10 max-w-3xl px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ติดตามสถานะ</h1>
        <button
          onClick={() => router.push('/upload')}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + ยื่นเอกสารใหม่
        </button>
      </div>

      {fetching ? (
        <p className="mt-8 text-sm text-gray-500">กำลังโหลด...</p>
      ) : forms.length === 0 ? (
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">ยังไม่มีเอกสารที่ยื่น</p>
          <button
            onClick={() => router.push('/upload')}
            className="mt-4 text-sm font-medium text-blue-600 hover:underline"
          >
            ยื่นเอกสารตอนนี้
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {forms.map((form) => {
            const { label, color } = STATUS_LABELS[form.status]
            return (
              <div key={form.id} className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{form.companyName}</p>
                    <p className="mt-1 text-sm text-gray-500">TAX ID: {form.taxId}</p>
                    <p className="text-sm text-gray-500">ประเภท: {form.businessType}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-medium ${color}`}>
                    {label}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <p className="text-xs text-gray-400">
                    ส่งเมื่อ {new Date(form.submittedAt).toLocaleDateString('th-TH', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </p>
                  <a
                    href={`${API}/api/forms/${form.id}/file`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    ดูไฟล์ →
                  </a>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

---

## Task 17: Integration Smoke Test

- [ ] **Step 1: Start backend**

```bash
cd /Users/digioth/Desktop/test/aws-cognito-test/backend
npm run dev
```

Expected: `MongoDB connected`, `Backend running on http://localhost:4000`

- [ ] **Step 2: Start frontend**

```bash
cd /Users/digioth/Desktop/test/aws-cognito-test/frontend
pnpm dev
```

Expected: `Ready on http://localhost:3000`

- [ ] **Step 3: Test register flow**

1. เปิด http://localhost:3000
2. กด Register → กรอก email, ชื่อ, นามสกุล, password
3. Redirect ไป /verify-otp — เช็ค email รับ OTP
4. ใส่ OTP → redirect ไป /login

- [ ] **Step 4: Test login + MFA flow**

1. ใส่ email + password ที่สมัครไว้
2. Redirect ไป /verify-otp — เช็ค email รับ OTP (MFA)
3. ใส่ OTP → redirect ไป homepage
4. Navbar แสดง "Upload File | ติดตามสถานะ | Logout"

- [ ] **Step 5: Test Google OAuth flow**

1. กด "Sign in with Google" ใน /login
2. เลือก Google account
3. Redirect กลับมา homepage — Navbar แสดง auth state

- [ ] **Step 6: Test upload + IndexedDB flow**

1. กด Upload File ใน navbar
2. กรอกข้อมูล + เลือกไฟล์
3. Refresh หน้า → ข้อมูลยังอยู่ (IndexedDB)
4. กด Submit → redirect ไป /status

- [ ] **Step 7: Test status page**

1. เปิด /status
2. เห็น form ที่ submit ไปพร้อม status "รอดำเนินการ"
3. กด "ดูไฟล์" → เปิดไฟล์ได้

- [ ] **Step 8: Test protected route redirect**

1. Logout
2. ลองเปิด http://localhost:3000/upload ตรงๆ
3. ต้อง redirect ไป /login อัตโนมัติ
