import { expect, test } from '@playwright/test'

test('phone desk: four tapes, settings persist, live/bots off', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('desk-title')).toHaveText('HUB / PREDICTIONS')
  await expect(page.getByTestId('desk-title')).not.toHaveText(/HUBEB|PREDICTTIONS|HUBPREDICTIONS/)
  const head = page.getByTestId('desk-head')
  const box = await head.boundingBox()
  expect(box?.y).toBeLessThanOrEqual(2)

  for (const id of ['btc', 'ng', 'cu', 'gld']) {
    await expect(page.getByTestId(`tape-${id}`)).toBeVisible()
    await expect(page.getByTestId(`status-${id}`)).toHaveText('WAIT')
    await expect(page.getByTestId(`hit-${id}`)).toContainText(/24H/)
    await expect(page.getByTestId(`race-${id}`)).toBeVisible()
    await expect(page.getByTestId(`save-${id}`)).toBeVisible()
    await expect(page.getByTestId(`bot-${id}`)).not.toBeChecked()
  }

  await expect(page.getByTestId('scoreboard')).toBeVisible()
  const pnlBox = await page.getByTestId('pnl').boundingBox()
  const ttlBox = await page.getByTestId('ttl').boundingBox()
  const cashBox = await page.getByTestId('kalshi-cash').boundingBox()
  expect(pnlBox && ttlBox && cashBox).toBeTruthy()
  expect((ttlBox?.x ?? 0)).toBeGreaterThan((pnlBox?.x ?? 0) + (pnlBox?.width ?? 0) - 2)
  expect((cashBox?.x ?? 0)).toBeGreaterThan((ttlBox?.x ?? 0) + (ttlBox?.width ?? 0) - 2)
  expect(Math.abs((pnlBox?.y ?? 0) - (ttlBox?.y ?? 0))).toBeLessThan(8)
  expect(Math.abs((ttlBox?.y ?? 0) - (cashBox?.y ?? 0))).toBeLessThan(8)
  const settingsBox = await page.getByTestId('settings-toggle').boundingBox()
  expect((settingsBox?.x ?? 0) + (settingsBox?.width ?? 0)).toBeLessThanOrEqual(392)
  expect((settingsBox?.y ?? 0)).toBeGreaterThanOrEqual(0)
  await page.screenshot({
    path: '/opt/cursor/artifacts/screenshots/phone-header.png',
    clip: { x: 0, y: 0, width: 390, height: 220 },
  })
  await expect(page.getByTestId('ttl')).toContainText(/TTL|%/)
  await expect(page.getByTestId('pulse')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('BITCOIN 15 MINUTE')
  await expect(page.getByTestId('bets-24h')).toBeVisible()
  await expect(page.getByTestId('bets-24h')).toContainText(/Last 24H bets/i)
  await expect(page.getByTestId('bets-filter')).toBeVisible()
  await expect(page.getByTestId('bets-filter-all')).toBeVisible()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')
  for (const id of ['btc', 'ng', 'cu', 'gld']) {
    await expect(page.getByTestId(`bets-filter-${id}`)).toBeVisible()
    const chipBox = await page.getByTestId(`bets-filter-${id}`).boundingBox()
    expect((chipBox?.height ?? 0)).toBeGreaterThanOrEqual(40)
    expect((chipBox?.x ?? 0) + (chipBox?.width ?? 0)).toBeLessThanOrEqual(392)
  }
  const placedBox = await page.getByTestId('bets-placed').boundingBox()
  const wlBox = await page.getByTestId('bets-wl').boundingBox()
  const pnl24Box = await page.getByTestId('bets-pnl').boundingBox()
  expect((wlBox?.x ?? 0)).toBeGreaterThan((placedBox?.x ?? 0) + (placedBox?.width ?? 0) - 2)
  expect((pnl24Box?.x ?? 0)).toBeGreaterThan((wlBox?.x ?? 0) + (wlBox?.width ?? 0) - 2)
  await page.getByTestId('bets-filter-btc').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('bets-filter-ng').click()
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-ng')).toHaveAttribute('aria-pressed', 'true')
  await expect
    .poll(async () => page.evaluate(() => localStorage.getItem('hub.desk.betsFilter.v1')))
    .toMatch(/btc/)
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-24h.png' })
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByTestId('bets-filter-all')).toBeVisible()
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-ng')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('bets-filter-all').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.getByTestId('bot-btc')).not.toBeChecked()
  await expect(page.getByTestId('analyst-toggle')).toBeVisible()
  await expect(page.getByTestId('finance-toggle')).toBeVisible()
  await expect(page.getByTestId('analyst')).toHaveCount(0)
  await expect(page.getByTestId('finance')).toHaveCount(0)
  await expect(page.getByTestId('desk-title')).not.toHaveText(/HUBPREDICTIONS/)

  const saveBox = await page.getByTestId('save-btc').boundingBox()
  const botBox = await page.getByTestId('bot-btc').locator('xpath=ancestor::label[1]').boundingBox()
  expect((saveBox?.height ?? 0)).toBeGreaterThanOrEqual(48)
  expect((botBox?.height ?? saveBox?.height ?? 0)).toBeGreaterThanOrEqual(48)

  const css = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((el) => (el as HTMLLinkElement).href)
    return hrefs
  })
  expect(css.some((h) => h.includes('/hub-app.css') || h.includes('/desk.css'))).toBe(true)
  expect(css.some((h) => /\/assets\/index-.*\.css/.test(h))).toBe(false)

  await page.getByTestId('contracts-btc').fill('17')
  await page.getByTestId('save-btc').click()
  await expect(page.getByTestId('contracts-btc')).toHaveValue('17')
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByTestId('contracts-btc')).toHaveValue('17')
  await expect(page.getByTestId('tape-btc')).toBeVisible()
  await expect(page.getByTestId('live-bets')).not.toBeChecked()

  const serious = errors.filter(
    (e) =>
      !/favicon|Download the React DevTools|hydration/i.test(e) &&
      !/Failed to load resource/i.test(e) &&
      !/Failed to fetch dynamically imported module/i.test(e),
  )
  expect(serious).toEqual([])
})

test('phone desk: 24H bets chips filter placed / W–L / P&L by tape', async ({ page }) => {
  const now = Date.now()
  await page.addInitScript(
    ([ts]) => {
      localStorage.setItem(
        'hub.desk.finance.v1',
        JSON.stringify({
          killed: false,
          paperStartedAt: ts,
          bets: [
            {
              betId: 'bet_btc',
              tape: 'btc',
              ticker: 'KXBTC15M-A',
              clock: '9:00 PM',
              closeAt: ts,
              side: 'up',
              count: 1,
              ask: 70,
              spent: 10,
              orderId: 'ord-btc-aaaaaa',
              status: 'settled',
              pnl: 5,
              filledAt: ts - 1000,
              settledAt: ts,
            },
            {
              betId: 'bet_ng',
              tape: 'ng',
              ticker: 'KXNATGAS15M-A',
              clock: '9:00 PM',
              closeAt: ts,
              side: 'down',
              count: 1,
              ask: 40,
              spent: 20,
              orderId: 'ord-ng-bbbbbb',
              status: 'settled',
              pnl: -20,
              filledAt: ts - 2000,
              settledAt: ts,
            },
          ],
        }),
      )
    },
    [now],
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('bets-filter-all')).toBeVisible()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-placed')).toContainText('$30.00')
  await expect(page.getByTestId('bets-wl')).toContainText('1W–1L')
  await expect(page.getByTestId('bets-pnl')).toContainText('−$15.00')
  await page.getByTestId('bets-filter-btc').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('bets-placed')).toContainText('$10.00')
  await expect(page.getByTestId('bets-wl')).toContainText('1W–0L')
  await expect(page.getByTestId('bets-pnl')).toContainText('+$5.00')
  await page.getByTestId('bets-filter-ng').click()
  await expect(page.getByTestId('bets-placed')).toContainText('$30.00')
  await expect(page.getByTestId('bets-wl')).toContainText('1W–1L')
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-filter.png' })
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.locator('body')).not.toContainText('BITCOIN 15 MINUTE')
})
