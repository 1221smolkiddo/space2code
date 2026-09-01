import { afterEach, describe, expect, it, vi } from 'vitest'
import { confirmExplicitLeave } from './leaveConfirmation'

afterEach(()=>vi.restoreAllMocks())

describe('explicit session leave confirmation',()=>{
  it('warns that leaving affects the partner and respects cancellation',()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    expect(confirmExplicitLeave()).toBe(false)
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/end the session for your partner/i))
  })

  it('allows the explicit leave after confirmation',()=>{
    vi.spyOn(window,'confirm').mockReturnValue(true)
    expect(confirmExplicitLeave()).toBe(true)
  })
})
