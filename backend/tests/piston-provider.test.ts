import { afterEach, describe, expect, it, vi } from 'vitest'

import { PistonExecutionProvider } from '../src/execution/piston-provider.js'

afterEach(() => vi.unstubAllGlobals())

describe('PistonExecutionProvider', () => {
  it('maps Piston compile and run stages into the provider-neutral contract', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      language: 'c',
      version: '13.2.0',
      compile: {
        stdout: '', stderr: '', code: 0, signal: null, message: null, status: null,
        cpu_time: 3, wall_time: 5, memory: 2_048,
      },
      run: {
        stdout: 'hello\n', stderr: '', code: 0, signal: null, message: null, status: null,
        cpu_time: 1, wall_time: 2, memory: 1_024,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const provider = new PistonExecutionProvider({
      executeUrl: 'https://piston.example/api/v2/execute',
      authorization: 'Bearer test-token',
    })
    const result = await provider.execute({
      language: 'c', version: '*', filename: 'main.c', source: 'int main(){}', stdin: '',
      timeoutMs: 3_000, signal: new AbortController().signal,
    })

    expect(result).toMatchObject({
      language: 'c', version: '13.2.0', compile: { code: 0 },
      run: { stdout: 'hello\n', code: 0, wallTimeMs: 2 },
    })
    expect(fetchMock).toHaveBeenCalledWith('https://piston.example/api/v2/execute', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer test-token' }),
    }))
  })

  it('turns a rejected Piston response into a sanitized controlled error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: 'runtime unknown\u0000secret' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )))
    const provider = new PistonExecutionProvider({ executeUrl: 'https://piston.example/api/v2/execute' })
    await expect(provider.execute({
      language: 'python', version: '*', filename: 'main.py', source: '', stdin: '',
      timeoutMs: 3_000, signal: new AbortController().signal,
    })).rejects.toMatchObject({
      code: 'EXECUTION_PROVIDER_UNAVAILABLE', message: 'runtime unknownsecret',
    })
  })
})
