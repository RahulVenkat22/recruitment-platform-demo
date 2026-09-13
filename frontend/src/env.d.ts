interface ImportMetaEnv {
  /** Empty or unset means the SPA calls `/api/v1/...` on its own origin. */
  readonly VITE_API_BASE_URL?: string
  /** 'true' shows the seeded demo accounts on the login page outside dev builds. */
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string
}
