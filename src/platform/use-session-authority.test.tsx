import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSessionAuthority } from './use-session-authority'

describe('host session authority hook', () => {
  it('revokes a callback epoch before exposing the next session', () => {
    const { result } = renderHook(() => useSessionAuthority())
    const retainedEpoch = result.current.eventEpoch
    act(() => result.current.beginSession())
    expect(result.current.sessionKey).toBe(1)
    expect(result.current.isCurrentSession(retainedEpoch)).toBe(false)
    expect(result.current.isCurrentSession(result.current.eventEpoch)).toBe(true)
  })
})
