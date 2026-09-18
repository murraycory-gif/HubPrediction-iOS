import { expect, test } from '@playwright/test'

test('phone desk: four tapes, settings persist, live/bots off', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('desk-title')).toHaveText(/HUB PREDICTIONS/)
  const head = page.getByTestId('desk-head')
  const box = await head.boundingBox()
  expect(box?.y).toBeLessThanOrEqual(2)

  for (const id of ['btc', 'ng', 'cu', 'gld']) {
    await expect(page.getByTestId(`tape-${id}`)).toBeVisible()
    await expect(page.getByTestId(`status-${id}`)).toHaveText('WAIT')
  }

  await expect(page.getByTestId('ttl')).toContainText('TTL')
  await expect(page.getByTestId('pulse')).toContainText(/quiet|PULSE|BITCOIN|LINE/i)
  await expect(page.getByTestId('mode-line')).toContainText(/Live bets OFF/i)
  await expect(page.getByTestId('mode-line')).toContainText(/PAPER/i)
  await expect(page.getByTestId('cash-strip')).toBeVisible()
  await expect(page.getByTestId('strip-floor')).toContainText('$50.00')
  await expect(page.getByTestId('kill')).toHaveText(/KILL/)
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.getByTestId('bot-btc')).not.toBeChecked()

  const css = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((el) => (el as HTMLLinkElement).href)
    return hrefs
  })
  expect(css.some((h) => h.includes('/desk.css'))).toBe(true)
  expect(css.some((h) => /\/assets\/index-.*\.css/.test(h))).toBe(false)

  await page.getByTestId('contracts-btc').fill('17')
  await expect(page.getByTestId('contracts-btc')).toHaveValue('17')
  await page.reload({ waitUntil: 'domcontentloaded' })
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
