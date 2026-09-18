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
  const placedBox = await page.getByTestId('bets-placed').boundingBox()
  const wlBox = await page.getByTestId('bets-wl').boundingBox()
  const pnl24Box = await page.getByTestId('bets-pnl').boundingBox()
  expect((wlBox?.x ?? 0)).toBeGreaterThan((placedBox?.x ?? 0) + (placedBox?.width ?? 0) - 2)
  expect((pnl24Box?.x ?? 0)).toBeGreaterThan((wlBox?.x ?? 0) + (wlBox?.width ?? 0) - 2)
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-24h.png' })
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
