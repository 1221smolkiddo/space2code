export interface AuthenticatedUser {
  id: string
  email: string | null
}

export interface AuthService {
  verifyAccessToken(token: string): Promise<AuthenticatedUser>
}

export function bearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)
  if (!match?.[1]) throw new Error('Missing or invalid bearer token')
  return match[1]
}
