/** Requires the local frontend/API and seeded demo data. Reads real search context;
 * chat mutations are intercepted so no paid model calls or stored threads are changed.
 */
import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const base = process.env.SHOTS_BASE_URL ?? 'http://localhost:5175'
const out = new URL('../.screenshots/redesign/', import.meta.url).pathname
await mkdir(out, { recursive: true })
const browser = await chromium.launch()
const errors = []
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${base}/login`)
  await page.getByLabel('Email or username').fill(process.env.SHOTS_USER ?? 'rahul@aimious.demo')
  await page.getByLabel('Password', { exact: true }).fill(process.env.SHOTS_PASSWORD ?? 'Demo@1234')
  const login = page.waitForResponse(
    (r) => r.url().includes('/auth/login/') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  const { access } = await (await login).json()
  assert.ok(access, 'Demo login succeeds')
  const headers = { Authorization: `Bearer ${access}` }
  const runs = await (await context.request.get(`${base}/api/v1/searches/`, { headers })).json()
  const run = runs.results.find(
    (item) => item.total_found > 0 && ['completed', 'partial'].includes(item.status),
  )
  assert.ok(run, 'A finished search with results exists')
  const path = `/api/v1/searches/${run.id}/chat/`
  const response = await context.request.get(`${base}${path}`, { headers })
  assert.ok(response.ok(), 'Chat API loads real search scope')
  const thread = { ...(await response.json()), messages: [] }
  const applications = await (
    await context.request.get(
      `${base}/api/v1/applications/?job_description=${run.job_description}`,
      { headers },
    )
  ).json()
  const candidate = applications.results[0].candidate
  const citation = {
    id: candidate.id,
    name: candidate.full_name,
    avatar_url: null,
    match_pct: 90,
    status: 'new',
    status_label: 'New',
  }
  let mode = 'answer'
  let posts = 0
  let clears = 0
  const event = (name, data) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`
  await page.route(`**${path}`, async (route) => {
    const method = route.request().method()
    if (method === 'GET') return route.fulfill({ json: thread })
    if (method === 'DELETE') {
      clears++
      thread.messages = []
      return route.fulfill({ status: 204 })
    }
    if (method !== 'POST') return route.abort()
    posts++
    if (mode === 'slow') await new Promise((resolve) => setTimeout(resolve, 1500))
    if (mode === 'failure')
      return route.fulfill({
        contentType: 'text/event-stream',
        body: event('error', { message: 'Temporary answer failure. Please retry.' }),
      })
    const question = {
      id: `q-${posts}`,
      role: 'user',
      content: route.request().postDataJSON().message,
      citations: [],
      model: '',
      created_at: new Date().toISOString(),
    }
    const message = {
      id: `a-${posts}`,
      role: 'assistant',
      content: `**${citation.name}** has relevant experience.\n\n- Strong Python skills.\n- Review the candidate profile for details.`,
      citations: [citation],
      model: 'browser-test',
      created_at: new Date().toISOString(),
    }
    if (mode === 'answer') thread.messages.push(question, message)
    await route
      .fulfill({
        contentType: 'text/event-stream',
        body:
          event('context', { named: [citation], excerpts: 0, ranked: thread.scope.ranked }) +
          event('token', { text: message.content }) +
          event('done', { question, message, seconds: 1 }),
      })
      .catch(() => {})
  })

  await page.waitForURL(`${base}/`)
  await page.goto(`${base}/search?jd=${run.job_description}`)
  const launcher = page.locator('[data-slot="search-chat-launcher"]')
  const panel = page.getByRole('dialog', { name: 'Ask about this search', exact: true })
  const input = panel.getByRole('textbox', { name: 'Your question' })
  await launcher.click()
  await input.waitFor()
  await page.waitForTimeout(400)
  assert.equal(
    await input.evaluate((el) => el === document.activeElement),
    true,
    'Composer receives focus',
  )
  assert.equal(
    await panel.getByRole('log').evaluate((el) => el.scrollTop),
    0,
    'Intro opens at the top',
  )
  await page.screenshot({ path: `${out}search-chat-desktop.png` })
  await panel.getByRole('list', { name: 'Suggested questions' }).getByRole('button').first().click()
  await panel.getByRole('list', { name: 'Candidates mentioned' }).waitFor()
  assert.ok(
    await panel.getByRole('link', { name: citation.name, exact: true }).getAttribute('href'),
    'Answer links the candidate',
  )
  await page.screenshot({ path: `${out}search-chat-answer.png` })
  await panel.getByRole('button', { name: 'Clear conversation', exact: true }).click()
  await page.getByRole('dialog', { name: 'Clear this conversation?' }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: 'Clear this conversation?' }).waitFor({ state: 'hidden' })
  assert.equal(await panel.isVisible(), true, 'Escape dismisses only the clear confirmation')
  assert.equal(clears, 0, 'Cancelling does not clear history')
  await panel.getByRole('button', { name: 'Clear conversation', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Clear this conversation?' })
    .getByRole('button', { name: 'Clear conversation', exact: true })
    .click()
  await panel.getByRole('heading', { name: 'Make sense of your shortlist' }).waitFor()
  assert.equal(clears, 1, 'Confirmed clear resets the thread')

  mode = 'failure'
  await input.fill('Compare these candidates')
  await input.press('Enter')
  await panel.getByRole('alert').waitFor()
  mode = 'answer'
  await panel.getByRole('button', { name: 'Try again', exact: true }).click()
  await panel.getByRole('list', { name: 'Candidates mentioned' }).waitFor()
  assert.equal(await panel.getByRole('alert').count(), 0, 'Retry recovers from a stream error')
  mode = 'slow'
  await input.fill('Explain the gaps')
  await input.press('Enter')
  await panel.getByRole('button', { name: 'Stop answering' }).click()
  await panel.getByRole('button', { name: 'Send', exact: true }).waitFor()
  assert.equal(
    await input.inputValue(),
    'Explain the gaps',
    'Stopping preserves the question for editing',
  )
  await input.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  assert.equal(
    await launcher.evaluate((el) => el === document.activeElement),
    true,
    'Close restores launcher focus',
  )
  await page
    .getByRole('button', { name: 'Ask AI about these results', exact: true })
    .first()
    .click()
  await input.waitFor()
  await input.press('Escape')
  await panel.waitFor({ state: 'hidden' })
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('aria-expanded')),
    'false',
    'Cached reopen restores the results button focus',
  )

  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await launcher.click()
    await input.waitFor()
    await page.waitForTimeout(250)
    const bounds = await panel.boundingBox()
    assert.ok(
      bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 844,
      `Panel fits at ${width}px`,
    )
    assert.equal(
      await panel.evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `No panel overflow at ${width}px`,
    )
    assert.equal(
      await panel.getByRole('log').evaluate((el) => el.scrollWidth > el.clientWidth),
      false,
      `No message overflow at ${width}px`,
    )
    assert.equal(
      await page.locator('html').getAttribute('data-motion'),
      'reduced',
      'System motion preference is respected',
    )
    await input.fill('First line')
    await input.press('Shift+Enter')
    await input.press('a')
    assert.equal(await input.inputValue(), 'First line\na', 'Shift+Enter inserts a newline')
    await page.screenshot({ path: `${out}search-chat-${width}.png` })
    await panel.getByRole('button', { name: 'Close', exact: true }).click()
    await panel.waitFor({ state: 'hidden' })
  }
  assert.deepEqual(errors, [], 'No browser render errors')
  console.log(
    'Search chat passed: live API scope; suggestions, answer links, clear/cancel, retry, stop, keyboard/focus, reduced motion, and desktop/390px/320px layouts.',
  )
} finally {
  await browser.close()
}
