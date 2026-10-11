import { useEffect, useState } from 'react'

// True once `isFetching` has been true for longer than `thresholdMs`,
// false again as soon as fetching stops. Used to show "the server is
// waking up" only for a genuinely slow request, not every request.
export function useSlowRequest(isFetching: boolean, thresholdMs = 5000): boolean {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    if (!isFetching) return
    const timer = setTimeout(() => setIsSlow(true), thresholdMs)
    // Runs when fetching stops (or the effect re-runs, or on unmount):
    // clears the pending timer and resets slow status, in one place.
    return () => {
      clearTimeout(timer)
      setIsSlow(false)
    }
  }, [isFetching, thresholdMs])

  return isSlow
}
