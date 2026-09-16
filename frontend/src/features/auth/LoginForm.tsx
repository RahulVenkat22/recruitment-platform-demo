import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRightIcon, CircleAlertIcon, EyeIcon, EyeOffIcon, Loader2Icon } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group'
import { DemoAccounts } from '@/features/auth/DemoAccounts'
import { DEMO_PASSWORD, demoAccountsEnabled, type DemoAccount } from '@/features/auth/demo-accounts'
import { ForgotPasswordDialog } from '@/features/auth/ForgotPasswordDialog'
import {
  describeLoginFailure,
  loginSchema,
  type LoginFailure,
  type LoginValues,
} from '@/features/auth/login-schema'
import { login } from '@/lib/auth'
import { EASE_BRAND } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { SessionUser } from '@/types/domain'

interface LoginFormProps {
  onSuccess: (user: SessionUser) => void
  className?: string
}

/** The fields rise in one after another on load (Enhancement.md 1); off under reduced motion. */
function rise(index: number, reduced: boolean | null) {
  return {
    initial: reduced ? false : { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, ease: EASE_BRAND, delay: 0.3 + index * 0.07 },
  }
}

export function LoginForm({ onSuccess, className }: LoginFormProps) {
  const ids = { identifier: useId(), password: useId(), remember: useId(), error: useId() }
  const reducedMotion = useReducedMotion()
  const [showPassword, setShowPassword] = useState(false)
  const [failure, setFailure] = useState<LoginFailure | null>(null)
  const [shake, setShake] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)
  // Bumped on every open so the dialog remounts with a clean form and the latest email.
  const [forgotKey, setForgotKey] = useState(0)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '', remember_me: false },
  })
  const { errors, isSubmitting } = form.formState

  // Fallback for when animationend never fires (reduced motion collapses the duration).
  useEffect(() => {
    if (!shake) return
    const timer = setTimeout(() => setShake(false), 600)
    return () => clearTimeout(timer)
  }, [shake])

  async function onSubmit(values: LoginValues) {
    setFailure(null)
    try {
      const user = await login({
        email: values.identifier,
        password: values.password,
        remember_me: values.remember_me,
      })
      onSuccess(user)
    } catch (error) {
      const described = describeLoginFailure(error)
      setFailure(described)
      if (described.kind === 'credentials') {
        setShake(true)
        form.resetField('password', { defaultValue: '' })
        form.setFocus('password')
      }
    }
  }

  function fillDemo(account: DemoAccount) {
    form.clearErrors()
    setFailure(null)
    form.setValue('identifier', account.email, { shouldDirty: true })
    form.setValue('password', DEMO_PASSWORD, { shouldDirty: true })
    form.setFocus('password')
  }

  const identifier = useWatch({ control: form.control, name: 'identifier' })

  return (
    <>
      <form
        noValidate
        aria-label="Sign in"
        aria-describedby={failure ? ids.error : undefined}
        data-shake={shake || undefined}
        onAnimationEnd={() => setShake(false)}
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('space-y-5', shake && 'animate-shake', className)}
      >
        {failure && (
          <Alert
            id={ids.error}
            variant="destructive"
            className="border-danger/20 bg-danger-soft text-danger"
          >
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription className="text-danger">{failure.message}</AlertDescription>
          </Alert>
        )}

        <fieldset disabled={isSubmitting} className="space-y-5">
          <motion.div {...rise(0, reducedMotion)}>
            <Field data-invalid={Boolean(errors.identifier)}>
              <FieldLabel htmlFor={ids.identifier}>Email or username</FieldLabel>
              <Input
                id={ids.identifier}
                type="text"
                inputMode="email"
                autoComplete="username"
                autoFocus
                className="h-11 bg-surface transition-[border-color,box-shadow] duration-150 ease-brand hover:border-line-strong"
                aria-invalid={Boolean(errors.identifier)}
                {...form.register('identifier')}
              />
              <FieldError errors={[errors.identifier]} />
            </Field>
          </motion.div>

          <motion.div {...rise(1, reducedMotion)}>
            <Field data-invalid={Boolean(errors.password)}>
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor={ids.password}>Password</FieldLabel>
                <button
                  type="button"
                  onClick={() => {
                    setForgotKey((key) => key + 1)
                    setForgotOpen(true)
                  }}
                  className="rounded-control text-small text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Forgot password?
                </button>
              </div>
              <InputGroup className="h-11 bg-surface transition-[border-color,box-shadow] duration-150 ease-brand hover:border-line-strong">
                <InputGroupInput
                  id={ids.password}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  {...form.register('password')}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupButton
                    size="icon-xs"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? (
                      <EyeOffIcon aria-hidden="true" />
                    ) : (
                      <EyeIcon aria-hidden="true" />
                    )}
                  </InputGroupButton>
                </InputGroupAddon>
              </InputGroup>
              <FieldError errors={[errors.password]} />
            </Field>
          </motion.div>

          <motion.div {...rise(2, reducedMotion)}>
            <Field orientation="horizontal">
              <Controller
                control={form.control}
                name="remember_me"
                render={({ field }) => (
                  <Checkbox
                    id={ids.remember}
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor={ids.remember} className="font-normal text-ink-muted">
                Remember me
              </FieldLabel>
            </Field>
          </motion.div>
        </fieldset>

        <motion.div {...rise(3, reducedMotion)}>
          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            aria-busy={isSubmitting || undefined}
            className="group/submit relative h-11 w-full overflow-hidden text-[14px] transition-[background-color,transform,box-shadow] duration-150 ease-brand hover:shadow-card-hover"
          >
            {isSubmitting ? (
              <>
                <Loader2Icon aria-hidden="true" className="animate-spin" />
                Signing in
              </>
            ) : (
              <>
                Sign in
                <ArrowRightIcon
                  data-icon="inline-end"
                  aria-hidden="true"
                  className="transition-transform duration-150 ease-brand group-hover/submit:translate-x-0.5"
                />
              </>
            )}
            {isSubmitting && (
              <span
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-white/15"
              >
                <span className="block h-full w-1/3 bg-accent animate-bh-scan" />
              </span>
            )}
          </Button>
        </motion.div>

        {demoAccountsEnabled() && (
          <motion.div {...rise(4, reducedMotion)}>
            <DemoAccounts onPick={fillDemo} />
          </motion.div>
        )}
      </form>

      <ForgotPasswordDialog
        key={forgotKey}
        open={forgotOpen}
        onOpenChange={setForgotOpen}
        initialEmail={identifier.includes('@') ? identifier : ''}
      />
    </>
  )
}
