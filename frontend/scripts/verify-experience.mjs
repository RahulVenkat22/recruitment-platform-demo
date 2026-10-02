/** Read-only browser checks. Requires the local frontend, API and seeded demo account.
 * Run from frontend: node scripts/verify-experience.mjs
 * Optional environment: SHOTS_BASE_URL, SHOTS_USER, SHOTS_PASSWORD.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
const base = process.env.SHOTS_BASE_URL ?? 'http://localhost:5175'
const out = new URL('../.screenshots/redesign/', import.meta.url).pathname
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const errors = []
let checked = 0
async function settled(page) {
  await page.locator('main h1').waitFor()
  await page.waitForFunction(
    () => !document.querySelector('[data-slot="brand-splash"], [data-slot="skeleton"]'),
    null,
    { timeout: 20000 },
  )
  await page.waitForTimeout(950)
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/login`)
  await settled(page)
  await page.screenshot({ path: `${out}login-desktop.png` })
  await page.getByLabel('Email or username').fill(process.env.SHOTS_USER ?? 'rahul@aimious.demo')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SHOTS_PASSWORD ?? 'Demo@1234')
  const login = page.waitForResponse(
    (r) => r.url().includes('/auth/login/') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const session = await (await login).json()
  assert.ok(session.access, 'Demo login succeeds')
  await page.waitForURL(`${base}/`)
  const rows = async (path) => {
    const response = await context.request.get(`${base}/api/v1/${path}/`, {
      headers: { Authorization: `Bearer ${session.access}` },
    })
    assert.ok(response.ok(), `GET ${path} succeeds`)
    return (await response.json()).results
  }
  const jobs = await rows('job-descriptions')
  const candidates = await rows('candidates')
  const tickets = await rows('support/tickets')
  const job =
    jobs.find((j) => j.title === 'Senior Python Developer') ??
    jobs.find((j) => j.status === 'open') ??
    jobs[0]
  const person = candidates.find((candidate) => candidate.applications?.length > 0) ?? candidates[0]
  const routes = [
    '/',
    '/dashboard',
    '/jobs',
    '/jobs/new',
    '/search',
    '/candidates',
    '/candidates/upload',
    '/interviews',
    '/interviews?view=calendar',
    '/templates',
    '/notifications',
    '/support',
    '/settings',
    '/settings?tab=security',
    '/settings?tab=preferences',
    '/settings?tab=users',
    '/not-a-real-page',
  ]
  if (job)
    routes.push(
      `/jobs/${job.id}`,
      `/jobs/${job.id}/edit`,
      ...['people', 'timeline', 'candidates', 'kanban', 'versions'].map(
        (tab) => `/jobs/${job.id}?tab=${tab}`,
      ),
    )
  if (person)
    routes.push(
      `/candidates/${person.id}`,
      ...['match', 'timeline', 'interviews', 'communications', 'calls'].map(
        (tab) => `/candidates/${person.id}?tab=${tab}`,
      ),
    )
  if (tickets[0]) routes.push(`/support/${tickets[0].id}`)
  for (const width of process.argv.includes('--interactions-only') ? [] : [1440, 390]) {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 })
    for (const route of routes) {
      await page.goto(`${base}${route}`)
      await settled(page)
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        false,
        `No page overflow: ${route} at ${width}`,
      )
      assert.equal(
        await page.getByText("This page couldn't be shown", { exact: true }).count(),
        0,
        `No render error: ${route}`,
      )
      assert.equal(
        await page.locator('#main').evaluate((el) => el.scrollWidth > el.clientWidth + 2),
        false,
        `No clipped main content: ${route} at ${width}`,
      )
      assert.equal(
        await page.locator('[data-slot="error-state"]').count(),
        0,
        `API data loaded: ${route} at ${width}`,
      )
      checked++
      if (
        [
          '/',
          '/dashboard',
          '/search',
          '/settings',
          '/candidates',
          '/interviews',
          '/support',
        ].includes(route) ||
        route.includes('tab=kanban')
      ) {
        const slug = route === '/' ? 'home' : route.replaceAll(/[^a-z0-9]/gi, '-')
        await page.screenshot({ path: `${out}${slug}-${width}.png` })
      }
      console.log(`OK ${width} ${route}`)
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`${base}/`)
  await settled(page)
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog').getByRole('link', { name: 'Support', exact: true }).click()
  await page.waitForURL(`${base}/support`)
  await page.getByRole('dialog', { name: 'Navigation' }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'New ticket', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(`${base}/settings?tab=preferences`)
  await settled(page)
  await page.getByRole('switch', { name: 'Interface animations' }).click()
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced')
  await page.reload()
  await settled(page)
  assert.equal(
    await page.getByRole('switch', { name: 'Interface animations' }).getAttribute('aria-checked'),
    'false',
  )
  await page.getByRole('switch', { name: 'Interface animations' }).click()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'reduced')
  await page.goto(`${base}/`)
  await settled(page)
  assert.ok(
    parseFloat(
      await page
        .locator('.talent-orbit__track')
        .first()
        .evaluate((el) => getComputedStyle(el).animationDuration),
    ) < 0.001,
    'Reduced motion stops ambient effects',
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.waitForFunction(() => document.documentElement.dataset.motion === 'full')
  await page.getByRole('button', { name: 'Collapse sidebar' }).click()
  assert.equal(await page.getByRole('complementary').getAttribute('data-collapsed'), 'true')
  await page.getByRole('button', { name: 'Expand sidebar' }).click()
  await page.getByRole('button', { name: 'Search (Ctrl or ⌘ K)' }).click()
  await page.getByRole('dialog').waitFor()
  await page.keyboard.press('Escape')
  assert.deepEqual(errors, [], 'No JavaScript errors')
  console.log(
    JSON.stringify(
      {
        checkedViews: checked,
        widths: [1440, 390],
        interactions:
          'navigation, dialogs, palette, sidebar, persisted and system motion preferences',
        errors,
        screenshots: out,
      },
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
