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
    req.user = { cognitoSub: payload.sub }
    next()
  } catch (err) {
    const isJwtError = err instanceof Error && (
      err.name.includes('Jwt') || err.name.includes('jwt')
    )
    if (isJwtError) {
      res.status(401).json({ error: 'Invalid or expired token' })
    } else {
      next(err)
    }
  }
}
