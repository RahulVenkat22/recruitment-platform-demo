import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, getApiError, fieldErrorMessage } from '@/lib/api'

export default function ResetPasswordPage() {
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '',
  )
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirmation) {
      setError('The passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.post('/api/v1/auth/reset-password/', { token, new_password: password })
      window.history.replaceState(null, '', '/reset-password')
      setPassword('')
      setConfirmation('')
      setDone(true)
    } catch (err) {
      const detail = getApiError(err)
      setError(
        fieldErrorMessage(detail.details, 'new_password') ??
          detail.message ??
          'Unable to reset your password. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <section className="w-full max-w-md space-y-5 rounded-xl border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        {done ? (
          <p role="status">Your password has been updated.</p>
        ) : !token ? (
          <p>Open the reset link in your email, or request a new link from the sign-in page.</p>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="space-y-4">
            <label className="block">
              New password
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded border bg-background p-2"
              />
            </label>
            <label className="block">
              Confirm password
              <input
                type="password"
                autoComplete="new-password"
                required
                maxLength={128}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                className="mt-1 w-full rounded border bg-background p-2"
              />
            </label>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              type="submit"
              className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Set password'}
            </button>
          </form>
        )}
        <Link to="/login" className="text-primary underline">
          Back to sign in
        </Link>
      </section>
    </main>
  )
}
