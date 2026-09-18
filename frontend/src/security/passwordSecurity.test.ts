import { describe, expect, it, vi } from 'vitest'

import { assertPasswordIsSafe, PASSWORD_MIN_LENGTH, PasswordSecurityError } from './passwordSecurity'

async function sha1(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

describe('password security', () => {
  it('rejects local policy failures before making a network request', async () => {
    const request = vi.fn()
    await expect(assertPasswordIsSafe('short', request)).rejects.toMatchObject({ code: 'WEAK_PASSWORD' })
    expect(request).not.toHaveBeenCalled()
    expect(PASSWORD_MIN_LENGTH).toBe(12)
  })

  it('uses a padded k-anonymity query without sending the password or complete hash', async () => {
    const password = 'UniqueEnoughPassphrase7'
    const hash = await sha1(password)
    const request = vi.fn().mockResolvedValue(new Response('00000000000000000000000000000000000:0'))
    await expect(assertPasswordIsSafe(password, request)).resolves.toBeUndefined()
    const [url, options] = request.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.pwnedpasswords.com/range/' + hash.slice(0, 5))
    expect(url).not.toContain(password)
    expect(url).not.toContain(hash)
    expect(options).toMatchObject({ headers: { 'Add-Padding': 'true' }, cache: 'no-store' })
    expect(options.body).toBeUndefined()
  })

  it('rejects a matching leaked hash and ignores padded zero-count entries', async () => {
    const password = 'KnownCompromisedPass7'
    const hash = await sha1(password)
    const body = hash.slice(5) + ':42' + String.fromCharCode(10) + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0'
    const request = vi.fn().mockResolvedValue(new Response(body))
    await expect(assertPasswordIsSafe(password, request)).rejects.toEqual(
      expect.objectContaining<Partial<PasswordSecurityError>>({ code: 'COMPROMISED_PASSWORD' }),
    )
  })

  it('fails closed when the password service is unavailable', async () => {
    const unavailable = vi.fn().mockRejectedValue(new Error('network down'))
    await expect(assertPasswordIsSafe('UniqueEnoughPassphrase7', unavailable)).rejects.toMatchObject({
      code: 'CHECK_UNAVAILABLE',
    })
    const badResponse = vi.fn().mockResolvedValue(new Response('', { status: 503 }))
    await expect(assertPasswordIsSafe('UniqueEnoughPassphrase7', badResponse)).rejects.toMatchObject({
      code: 'CHECK_UNAVAILABLE',
    })
  })
})