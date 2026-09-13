import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router'
import { logout } from '@/lib/auth'

/** Signs out via the API, drops every cached query, then lands on /login. */
export function useSignOut() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)

  const signOut = useCallback(async () => {
    setPending(true)
    try {
      await logout()
      queryClient.clear()
      navigate('/login', { replace: true })
    } finally {
      setPending(false)
    }
  }, [navigate, queryClient])

  return { signOut, pending }
}
