import { expect, type Page, test } from '@playwright/test'

const FIRST_PAINT_MS = 2000
const LIVE_NUMBERS_MS = 4000

async function waitHost(page: Page) {
  await expect(page.getByTestId('desk-head')).toHaveAttribute('data-host-ready', '1', { timeout: 20_000 })
}

async function allowLiveArm(page: Page) {
  await page.evaluate(() => {
    ;(window as Window & { __HUB_TEST_LIVE_ARM?: { ok: true } }).__HUB_TEST_LIVE_ARM = { ok: true }
  })
}

async function setToggle(page: Page, testId: string, on: boolean) {
  const box = page.getByTestId(testId)
  if ((await box.isChecked()) === on) return
  await page.locator('label').filter({ has: box }).click({ force: true })
  await expect(box).toBeChecked({ checked: on })
}

test('HARD QA 4 first paint + live numbers under budget', async ({ page }) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const t0 = Date.now()
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('desk-head')).toBeVisible({ timeout: FIRST_PAINT_MS })
  await expect(page.getByTestId('desk-title')).toHaveText('HUB Predictions', { timeout: FIRST_PAINT_MS })
  const painted = Date.now() - t0
  expect(painted).toBeLessThan(FIRST_PAINT_MS)
  await expect(page.getByTestId('live-btc')).toBeVisible({ timeout: LIVE_NUMBERS_MS })
  await expect(page.getByTestId('live-btc')).not.toHaveText('')
  await expect(page.getByTestId('beat-value-btc')).not.toHaveText('')
  const numbers = Date.now() - t0
  expect(numbers).toBeLessThan(LIVE_NUMBERS_MS)
})

test('HARD QA 1 CLOSED only when series has 0 open markets', async ({ page }) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  const closeAt = Date.now() + 8 * 60_000
  await page.evaluate((at) => {
    const w = window as Window & {
      __HUB_TEST_OPEN_MARKETS?: Record<string, number>
      __HUB_TEST_CLOSE_CLOCK?: { tradingActive: boolean; stale: boolean; closeAt: number }
    }
    w.__HUB_TEST_OPEN_MARKETS = { btc: 1, ng: 0, cu: 0, gld: 0, wti: 0, slv: 0 }
    w.__HUB_TEST_CLOSE_CLOCK = { tradingActive: true, stale: true, closeAt: at }
  }, closeAt)
  await expect(page.getByTestId('close-clock-btc')).toHaveAttribute('data-clock-kind', 'live')
  await expect(page.getByTestId('close-clock-btc')).not.toContainText('CLOSED')
  for (const id of ['ng', 'cu', 'gld'] as const) {
    await expect(page.getByTestId(`close-clock-${id}`)).toHaveAttribute('data-clock-kind', 'closed')
    await expect(page.getByTestId(`close-clock-${id}`)).toContainText('CLOSED')
  }
})

test('HARD QA 2+3+5 strip / fill / DOWN rest — no ghost LIVE', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await allowLiveArm(page)
  await setToggle(page, 'live-cash-btc', true)
  const quote = {
    ticker: 'KXBTC15M-26SEP190015-15',
    clock: '15m',
    clockId: '15m',
    closeAt: Date.now() + 8 * 60_000,
    tradingActive: true,
    openMarkets: 1,
    live: 80040,
    beat: 80000,
    yesAsk: 70,
    noAsk: 30,
    fetchedAt: Date.now(),
    points: [
      { t: Date.now() - 8000, px: 80020 },
      { t: Date.now() - 4000, px: 80030 },
      { t: Date.now(), px: 80040 },
    ],
  }
  await page.evaluate(async (q) => {
    const w = window as Window & {
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_SEND?: (tape: string, side: string, quote: unknown) => Promise<void>
      __HUB_APPLY_BOOK?: (payload: unknown) => void
    }
    w.__HUB_PLACE = async () => ({
      order: {
        order_id: '01a0b7af-7b30-701f-8eb6-fa1303b858ad',
        status: 'canceled',
        fill_count: 0,
        action: 'sell',
        side: 'yes',
      },
    })
    await w.__HUB_TEST_SEND?.('btc', 'down', q)
  }, quote)
  await expect(page.getByTestId('desk-msg')).toContainText(/canceled 0-fill|RESTING|not bought/i)
  await expect(page.locator('body')).not.toContainText('BOT BOUGHT')
  await expect(page.getByTestId('status-btc')).not.toHaveText('DOWN')
  await page.evaluate(async (q) => {
    const w = window as Window & {
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_SEND?: (tape: string, side: string, quote: unknown) => Promise<void>
    }
    w.__HUB_PLACE = async () => ({
      order: { order_id: '01resting-buy-no-0001', status: 'resting', fill_count: 0 },
    })
    await w.__HUB_TEST_SEND?.('btc', 'down', { ...q, ticker: 'KXBTC15M-RESTQA' })
  }, quote)
  await expect(page.getByTestId('desk-msg')).toContainText(/RESTING/i)
  await expect(page.locator('body')).not.toContainText('BOT BOUGHT')
  await expect(page.getByTestId('status-btc')).not.toHaveText('DOWN')
})

test('HARD QA 6 persist Live cash/contracts + WTI/Silver paper only', async ({ browser }) => {
  test.setTimeout(60_000)
  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const desk = await pc.newPage()
  const hand = await phone.newPage()
  try {
    await desk.goto('/', { waitUntil: 'domcontentloaded' })
    await hand.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(desk)
    await waitHost(hand)
    await allowLiveArm(desk)
    await setToggle(desk, 'live-cash-btc', true)
    await desk.getByTestId('contracts-btc').fill('6')
    await desk.getByTestId('contracts-btc').blur()
    await expect(desk.getByTestId('live-cash-btc')).toBeChecked()
    await expect(hand.getByTestId('live-cash-btc')).toBeChecked({ timeout: 8_000 })
    await expect(hand.getByTestId('contracts-btc')).toHaveValue('6', { timeout: 8_000 })
    await desk.reload({ waitUntil: 'domcontentloaded' })
    await waitHost(desk)
    await expect(desk.getByTestId('live-cash-btc')).toBeChecked()
    await expect(desk.getByTestId('contracts-btc')).toHaveValue('6')
    await expect(desk.getByTestId('tape-wti')).toBeVisible()
    await expect(desk.getByTestId('tape-slv')).toBeVisible()
    await expect(desk.getByTestId('live-cash-wti')).not.toBeChecked()
    await expect(desk.getByTestId('live-cash-slv')).not.toBeChecked()
    await expect(desk.getByTestId('live-cash-wti')).toBeDisabled()
    await expect(desk.getByTestId('live-cash-slv')).toBeDisabled()
    await desk.locator('label').filter({ has: desk.getByTestId('live-cash-wti') }).click({ force: true })
    await expect(desk.getByTestId('live-cash-wti')).not.toBeChecked()
    await expect(desk.getByTestId('desk-msg')).toContainText(/paper desk|Soft FAIL Live/i)
  } finally {
    await desk.close()
    await hand.close()
    await pc.close()
    await phone.close()
  }
})
