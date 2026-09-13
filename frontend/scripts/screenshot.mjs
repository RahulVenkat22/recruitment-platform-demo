#!/usr/bin/env node
/**
 * Screenshot pages of the running app through the real UI.
 *
 *   npm run shots -- /login /dashboard /settings
 *   node scripts/screenshot.mjs --user priya@aimious.demo --password Demo@1234 /jobs
 *
 * Every route is captured at 1440px and 400px wide into frontend/.screenshots/
 * as <name>-<width>.png, where <name> is the route slug ("/jobs/42?tab=kanban"
 * -> "jobs-42-tab-kanban", "/" -> "root"). "/login" is captured anonymously;
 * every other route is visited after signing in through the login form.
 *
 * Needs the Vite dev server (5175) proxying to Django (8200): `make dev`.
 *
 * Options
 *   --base <url>        default http://localhost:5175  (env SHOTS_BASE_URL)
 *   --user <email>      default rahul@aimious.demo    (env SHOTS_USER)
 *   --password <pw>     default Demo@1234              (env SHOTS_PASSWORD)
 *   --out <dir>         default <frontend>/.screenshots
 *   --widths 1440,400   comma list of viewport widths
 *   --no-full-page      capture the viewport only
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const FRONTEND_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const DEFAULTS = {
  base: process.env.SHOTS_BASE_URL ?? 'http://localhost:5175',
  user: process.env.SHOTS_USER ?? 'rahul@aimious.demo',
  password: process.env.SHOTS_PASSWORD ?? 'Demo@1234',
  out: path.join(FRONTEND_DIR, '.screenshots'),
  widths: [1440, 400],
  fullPage: true,
}

/** Selectors that mean "still loading": the boot splash, page fallbacks and every skeleton. */
const LOADING_SELECTOR = '[aria-busy="true"], [data-slot="skeleton"]'
const LOADING_TIMEOUT_MS = 15_000
/** plan.md 8.3: route transitions fade in over 400ms; let them finish before the capture. */
const SETTLE_MS = 600

function parseArgs(argv) {
  const options = { ...DEFAULTS }
  const routes = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => {
      i += 1
      if (argv[i] === undefined) throw new Error(`${arg} needs a value`)
      return argv[i]
    }
    if (arg === '--base') options.base = next()
    else if (arg === '--user') options.user = next()
    else if (arg === '--password') options.password = next()
    else if (arg === '--out') options.out = path.resolve(next())
    else if (arg === '--widths') options.widths = next().split(',').map((w) => Number(w.trim()))
    else if (arg === '--no-full-page') options.fullPage = false
    else if (arg === '--help' || arg === '-h') {
      console.log('usage: screenshot.mjs [options] <route> [<route> ...]  (see file header)')
      process.exit(0)
    } else if (arg.startsWith('--')) throw new Error(`unknown option ${arg}`)
    else routes.push(arg.startsWith('/') ? arg : `/${arg}`)
  }
  if (routes.length === 0) routes.push('/login', '/dashboard', '/settings')
  if (options.widths.some((w) => !Number.isInteger(w) || w <= 0)) {
    throw new Error('--widths must be positive integers')
  }
  return { options, routes }
}

/** "/jobs/42?tab=kanban" -> "jobs-42-tab-kanban"; "/" -> "root". */
export function routeSlug(route) {
  const slug = route
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
  return slug || 'root'
}

function isLoginRoute(route) {
  return route.split('?')[0].replace(/\/+$/, '') === '/login'
}

async function waitForSettled(page) {
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(
    (selector) => document.querySelectorAll(selector).length === 0,
    LOADING_SELECTOR,
    { timeout: LOADING_TIMEOUT_MS },
  )
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(SETTLE_MS)
}

async function signIn(page, { base, user, password }) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  await page.waitForSelector('input[autocomplete="username"]')
  await page.fill('input[autocomplete="username"]', user)
  await page.fill('input[autocomplete="current-password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: LOADING_TIMEOUT_MS })
  await waitForSettled(page)
}

/**
 * The app shell scrolls inside `#main` (the sidebar and top bar stay put), so a
 * full-page capture would only show the first viewport of a long page. Let the
 * scroll container and its ancestors grow to their content for the capture.
 */
async function unclipShell(page) {
  await page.evaluate(() => {
    let node = document.getElementById('main')
    while (node && node !== document.body) {
      node.style.setProperty('overflow', 'visible', 'important')
      node.style.setProperty('height', 'auto', 'important')
      node.style.setProperty('min-height', '0', 'important')
      node = node.parentElement
    }
  })
}

async function capture(page, route, width, options) {
  const file = path.join(options.out, `${routeSlug(route)}-${width}.png`)
  await page.goto(`${options.base}${route}`, { waitUntil: 'networkidle' })
  await waitForSettled(page)
  if (options.fullPage) await unclipShell(page)
  await page.screenshot({ path: file, fullPage: options.fullPage })
  console.log(`${route} @ ${width} -> ${path.relative(process.cwd(), file)} (${page.url()})`)
  return file
}

async function main() {
  const { options, routes } = parseArgs(process.argv.slice(2))
  await mkdir(options.out, { recursive: true })

  const browser = await chromium.launch()
  const failures = []
  try {
    for (const width of options.widths) {
      const viewport = { width, height: width < 768 ? 800 : 900 }
      const anonymous = await browser.newContext({ viewport, deviceScaleFactor: 1 })
      const authed = await browser.newContext({ viewport, deviceScaleFactor: 1 })
      let signedIn = false
      try {
        for (const route of routes) {
          try {
            if (isLoginRoute(route)) {
              const page = await anonymous.newPage()
              await capture(page, route, width, options)
              await page.close()
              continue
            }
            const page = await authed.newPage()
            if (!signedIn) {
              await signIn(page, options)
              signedIn = true
            }
            await capture(page, route, width, options)
            await page.close()
          } catch (error) {
            failures.push(`${route} @ ${width}: ${error instanceof Error ? error.message : error}`)
            console.error(`FAILED ${route} @ ${width}:`, error)
          }
        }
      } finally {
        await anonymous.close()
        await authed.close()
      }
    }
  } finally {
    await browser.close()
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} capture(s) failed:\n  ${failures.join('\n  ')}`)
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
