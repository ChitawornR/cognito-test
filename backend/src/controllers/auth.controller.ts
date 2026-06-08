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

    if (!result.tokens) {
      res.status(500).json({ error: 'Unexpected auth state: no tokens and no challenge' })
      return
    }
    setTokenCookies(res, result.tokens)
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

    const idPayload = await idVerifier.verify(tokens.idToken)
    const userEmail = typeof idPayload.email === 'string' ? idPayload.email : null
    const firstName = typeof idPayload.given_name === 'string' ? idPayload.given_name : ''
    const lastName = typeof idPayload.family_name === 'string' ? idPayload.family_name : ''
    if (!userEmail) {
      res.status(500).json({ error: 'ID token missing email claim' })
      return
    }
    await User.findOneAndUpdate(
      { cognitoSub: idPayload.sub },
      {
        cognitoSub: idPayload.sub,
        email: userEmail,
        firstName,
        lastName,
        provider: 'email',
      },
      { upsert: true, returnDocument: 'after' }
    )

    res.json({ message: 'MFA verified. Login successful.' })
  } catch (err: unknown) {
    const error = err as Error
    const isAuthError = error.name.includes('Jwt') || error.name.includes('jwt') ||
      error.message.includes('Incorrect username or password') ||
      error.message.includes('Invalid code') ||
      error.message.includes('session')
    res.status(isAuthError ? 401 : 500).json({ error: error.message })
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
  const redirectUri = `http://localhost:4000/api/auth/google/callback`
  const url = buildGoogleAuthUrl(redirectUri)
  res.redirect(url)
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, error, error_description } = req.query
    if (error) {
      res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=${encodeURIComponent(String(error_description || error))}`)
      return
    }
    if (!code || typeof code !== 'string') {
      res.status(400).json({ error: 'Missing code' })
      return
    }

    const redirectUri = `http://localhost:4000/api/auth/google/callback`
    const tokens = await cognitoExchangeCode(code, redirectUri)
    setTokenCookies(res, tokens)

    const idPayload = await idVerifier.verify(tokens.idToken)
    const userEmail = typeof idPayload.email === 'string' ? idPayload.email : null
    if (!userEmail) {
      res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=${encodeURIComponent('Google account has no verified email')}`)
      return
    }
    const nameParts = typeof idPayload.name === 'string' ? idPayload.name.split(' ') : []
    const firstName = typeof idPayload.given_name === 'string' ? idPayload.given_name : (nameParts[0] ?? '')
    const lastName = typeof idPayload.family_name === 'string' ? idPayload.family_name : (nameParts.slice(1).join(' ') ?? '')
    await User.findOneAndUpdate(
      { cognitoSub: idPayload.sub },
      {
        cognitoSub: idPayload.sub,
        email: userEmail,
        firstName,
        lastName,
        provider: 'google',
      },
      { upsert: true, returnDocument: 'after' }
    )

    res.redirect(process.env.FRONTEND_URL ?? 'http://localhost:3000')
  } catch (err: unknown) {
    const error = err as Error
    clearTokenCookies(res)
    res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=${encodeURIComponent(error.message)}`)
  }
}
