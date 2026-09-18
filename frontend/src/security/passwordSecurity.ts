const HIBP_RANGE_URL = 'https://api.pwnedpasswords.com/range/'

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_REQUIREMENTS = 'Use at least 12 characters with uppercase and lowercase letters and a number.'

export class PasswordSecurityError extends Error {
  readonly code: 'WEAK_PASSWORD' | 'COMPROMISED_PASSWORD' | 'CHECK_UNAVAILABLE'

  constructor(
    message: string,
    code: 'WEAK_PASSWORD' | 'COMPROMISED_PASSWORD' | 'CHECK_UNAVAILABLE',
  ) {
    super(message)
    this.name = 'PasswordSecurityError'
    this.code = code
  }
}

function assertPasswordStrength(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/[0-9]/.test(password)) {
    throw new PasswordSecurityError(PASSWORD_REQUIREMENTS, 'WEAK_PASSWORD')
  }
}

async function sha1(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-1', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

/**
 * Checks a completed password with HIBP's k-anonymity endpoint. Only the first
 * five SHA-1 characters leave the browser; the password and complete hash do not.
 */
export async function assertPasswordIsSafe(
  password: string,
  request: typeof fetch = fetch,
): Promise<void> {
  assertPasswordStrength(password)

  try {
    const hash = await sha1(password)
    const prefix = hash.slice(0, 5)
    const suffix = hash.slice(5)
    const response = await request(HIBP_RANGE_URL + prefix, {
      headers: { 'Add-Padding': 'true' },
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error('HIBP request failed')

    const compromised = (await response.text()).split(/\r?\n/).some(line => {
      const [candidate, count] = line.split(':')
      return candidate?.toUpperCase() === suffix && Number(count) > 0
    })
    if (compromised) {
      throw new PasswordSecurityError(
        'This password appears in known data breaches. Choose a different, unique password.',
        'COMPROMISED_PASSWORD',
      )
    }
  } catch (error) {
    if (error instanceof PasswordSecurityError) throw error
    throw new PasswordSecurityError(
      'Password safety verification is temporarily unavailable. Please try again.',
      'CHECK_UNAVAILABLE',
    )
  }
}