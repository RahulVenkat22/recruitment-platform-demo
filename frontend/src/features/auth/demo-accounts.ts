import type { UserRole } from '@/types/domain'

export interface DemoAccount {
  name: string
  email: string
  designation: string
  role: UserRole
}

/** Every seeded login shares this password (plan.md section 18). */
export const DEMO_PASSWORD = 'Demo@1234'

/** The ten seeded users, in plan.md section 18 order; names match backend/seed/pools/users.py. */
export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    name: 'Rahul Venkat',
    email: 'rahul@aimious.demo',
    designation: 'HR Manager',
    role: 'hr_admin',
  },
  { name: 'Priya Sharma', email: 'priya@aimious.demo', designation: 'HR Executive', role: 'hr' },
  {
    name: 'Karthik Iyer',
    email: 'karthik@aimious.demo',
    designation: 'Talent Acquisition Specialist',
    role: 'hr',
  },
  {
    name: 'Anitha Rajan',
    email: 'anitha@aimious.demo',
    designation: 'HR Business Partner',
    role: 'hr',
  },
  {
    name: 'Arun Kumar',
    email: 'arun@aimious.demo',
    designation: 'Engineering Manager',
    role: 'interviewer',
  },
  {
    name: 'Divya Raman',
    email: 'divya@aimious.demo',
    designation: 'Senior Software Engineer',
    role: 'interviewer',
  },
  {
    name: 'Suresh Menon',
    email: 'suresh@aimious.demo',
    designation: 'Lead Data Scientist',
    role: 'interviewer',
  },
  {
    name: 'Nisha Patel',
    email: 'nisha@aimious.demo',
    designation: 'DevOps Lead',
    role: 'interviewer',
  },
  {
    name: 'Vikram Shah',
    email: 'vikram@aimious.demo',
    designation: 'Product Manager',
    role: 'employee',
  },
  {
    name: 'Lakshmi Narayanan',
    email: 'lakshmi@aimious.demo',
    designation: 'Frontend Lead',
    role: 'employee',
  },
]

/** Shown in dev builds, and in production only when the build opts in. */
export function demoAccountsEnabled(): boolean {
  return import.meta.env.DEV || import.meta.env.VITE_SHOW_DEMO_ACCOUNTS === 'true'
}
