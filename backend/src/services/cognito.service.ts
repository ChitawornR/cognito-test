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

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const CLIENT_ID = requireEnv('COGNITO_CLIENT_ID')
const CLIENT_SECRET = requireEnv('COGNITO_CLIENT_SECRET')
const COGNITO_DOMAIN = requireEnv('COGNITO_DOMAIN')

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

  const result = response.AuthenticationResult
  if (!result?.AccessToken || !result?.IdToken || !result?.RefreshToken) {
    throw new Error('Cognito returned no authentication tokens')
  }
  return {
    tokens: {
      accessToken: result.AccessToken,
      idToken: result.IdToken,
      refreshToken: result.RefreshToken,
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

  const result = response.AuthenticationResult
  if (!result?.AccessToken || !result?.IdToken || !result?.RefreshToken) {
    throw new Error('Cognito returned no authentication tokens')
  }
  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken,
  }
}

export async function cognitoGlobalSignOut(accessToken: string): Promise<void> {
  await client.send(new GlobalSignOutCommand({ AccessToken: accessToken }))
}

export function buildGoogleAuthUrl(redirectUri: string): string {
  const domain = COGNITO_DOMAIN
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
  const domain = COGNITO_DOMAIN
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
