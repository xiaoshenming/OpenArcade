import { useCallback, useMemo, useState } from 'react'
import { createSessionEpoch } from './session-epoch'

export function useSessionAuthority() {
  const [sessionKey, setSessionKey] = useState(0)
  const epoch = useMemo(() => createSessionEpoch(), [])
  const beginSession = useCallback(() => {
    epoch.advance()
    setSessionKey((key) => key + 1)
  }, [epoch])
  return {
    sessionKey,
    eventEpoch: epoch.capture(),
    beginSession,
    isCurrentSession: epoch.isCurrent,
  }
}
