import { expect, test } from '@playwright/test'

test('iPhone 390×844 first paint, layout, chart, roulette', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('call-side')).toHaveText(/BUY UP|BUY DOWN|SIT/, { timeout: 2000 })

  const slot = page.getByTestId('overlay-slot')
  const slotBox = await slot.boundingBox()
  expect(slotBox?.height).toBe(56)

  const pill = page.getByTestId('call-bar')
  const pillBox = await pill.boundingBox()
  expect(pillBox).toBeTruthy()
  expect(pillBox!.y).toBeGreaterThanOrEqual(56)
  expect(pillBox!.width).toBeGreaterThan(300)

  await page.waitForTimeout(3000)
  await expect(page.getByText('HUB Opening')).toHaveCount(0)
  await expect(page.getByText('15m window')).toHaveCount(0)

  const forecast = page.getByTestId('forecast-pts')
  await expect(forecast).toHaveAttribute('data-pts', /[0-9]/, { timeout: 12_000 })
  const pts = (await forecast.getAttribute('data-pts')) ?? ''
  const nums = pts.split(',').map(Number).filter((n) => Number.isFinite(n))
  for (let i = 1; i < nums.length; i++) {
    expect(Math.abs(nums[i] - nums[i - 1])).toBeLessThan(80)
  }

  await expect(page.getByTestId('roulette-cell').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Now + rest of day')).toBeVisible()
  await expect(page.getByText('Theory').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('actual-line')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('next-line')).toBeVisible()

  const clock = page.locator('.clock-col').first()
  await expect(clock).toBeVisible({ timeout: 15_000 })
  const clockBox = await clock.boundingBox()
  expect(clockBox?.width).toBeGreaterThanOrEqual(100)

  const serious = errors.filter(
    (e) =>
      !/favicon|Download the React DevTools|hydration/i.test(e) &&
      !/Failed to load resource/i.test(e) &&
      !/Failed to fetch dynamically imported module/i.test(e) &&
      !/AsyncLocalStorage is not a constructor/i.test(e),
  )
  expect(serious).toEqual([])
})
