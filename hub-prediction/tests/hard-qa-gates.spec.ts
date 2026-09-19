import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

function seedHostBtc20() {
  const file = resolve('.secrets/desk-state.json')
  const raw = JSON.parse(readFileSync(file, 'utf8')) as {
    settings?: {
      savedAt?: number
      togglesAt?: number
      togglesPicked?: boolean
      tapes?: Record<string, { contracts?: number }>
    }
  }
  const now = Date.now()
  raw.settings = raw.settings ?? {}
  raw.settings.tapes = raw.settings.tapes ?? {}
  raw.settings.tapes.btc = { ...(raw.settings.tapes.btc ?? {}), contracts: 20 }
  raw.settings.savedAt = now
  raw.settings.togglesAt = now
  raw.settings.togglesPicked = true
  writeFileSync(file, JSON.stringify(raw))
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
    yesAsk: 31,
    noAsk: 70,
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

test('two clients: BTC 20 on A is host book — B and reload stay 20', async ({ browser }) => {
  test.setTimeout(45_000)
  const aCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const bCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const a = await aCtx.newPage()
  const b = await bCtx.newPage()
  try {
    seedHostBtc20()
    await a.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(a)
    await allowLiveArm(a)
    const current = Number(await a.getByTestId('contracts-btc').inputValue())
    if (current !== 20) {
      await a.getByTestId('contracts-btc').fill('20')
      await a.getByTestId('contracts-btc').blur()
    }
    await expect(a.getByTestId('contracts-btc')).toHaveValue('20')
    await expect.poll(async () => a.getByTestId('contracts-btc').inputValue(), { timeout: 8_000 }).toBe('20')
    await a.waitForTimeout(2000)
    await b.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(b)
    await expect(b.getByTestId('contracts-btc')).toHaveValue('20', { timeout: 15_000 })
    await a.reload({ waitUntil: 'domcontentloaded' })
    await waitHost(a)
    await expect(a.getByTestId('contracts-btc')).toHaveValue('20', { timeout: 15_000 })
    await expect(b.getByTestId('contracts-btc')).toHaveValue('20')
  } finally {
    await a.close()
    await b.close()
    await aCtx.close()
    await bCtx.close()
  }
})

test('HARD QA 6 persist Live cash/contracts + WTI/Silver paper only', async ({ browser }) => {
  test.setTimeout(60_000)
  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const desk = await pc.newPage()
  const hand = await phone.newPage()
  try {
    await desk.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(desk)
    await allowLiveArm(desk)
    await setToggle(desk, 'live-cash-btc', true)
    const current = Number(await desk.getByTestId('contracts-btc').inputValue())
    const cur = Number.isFinite(current) && current > 0 ? current : 1
    const next = String(cur >= 20 ? 19 : Math.max(2, cur + 1))
    await desk.getByTestId('contracts-btc').fill(next)
    await desk.getByTestId('contracts-btc').blur()
    await expect(desk.getByTestId('contracts-btc')).toHaveValue(next)
    await expect(desk.getByTestId('live-cash-btc')).toBeChecked()
    await desk.reload({ waitUntil: 'domcontentloaded' })
    await waitHost(desk)
    await expect(desk.getByTestId('live-cash-btc')).toBeChecked({ timeout: 15_000 })
    await expect(desk.getByTestId('contracts-btc')).toHaveValue(next)
    await hand.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(hand)
    await expect(hand.getByTestId('live-cash-btc')).toBeChecked({ timeout: 15_000 })
    await expect(hand.getByTestId('contracts-btc')).toHaveValue(next, { timeout: 15_000 })
    await expect(desk.getByTestId('tape-wti')).toBeVisible()
    await expect(desk.getByTestId('tape-slv')).toBeVisible()
    await expect(desk.getByTestId('live-cash-wti')).not.toBeChecked()
    await expect(desk.getByTestId('live-cash-slv')).not.toBeChecked()
    await expect(desk.getByTestId('live-cash-wti')).toBeDisabled()
    await expect(desk.getByTestId('live-cash-slv')).toBeDisabled()
    await desk.getByTestId('tape-wti').scrollIntoViewIfNeeded()
    await desk.locator('label').filter({ has: desk.getByTestId('live-cash-wti') }).click({ force: true })
    await expect(desk.getByTestId('live-cash-wti')).not.toBeChecked()
    await expect(desk.getByTestId('desk-msg')).toContainText(/paper desk/i)
  } finally {
    await desk.close()
    await hand.close()
    await pc.close()
    await phone.close()
  }
})

test('BTC Live ON in-arm 70¢ ask calls placeKalshi Soft FAIL sit', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await allowLiveArm(page)
  const closeAt = Date.now() + 6 * 60_000
  const ticker = `KXBTC15M-PRINT70-${closeAt}`
  await page.evaluate(({ at, ticker }) => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: unknown[]
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_LIVE_QUOTE?: Record<string, unknown>
    }
    w.__HUB_PLACE_CALLS = []
    w.__HUB_PLACE = async (p) => {
      w.__HUB_PLACE_CALLS!.push(p)
      return {
        order: {
          order_id: '01print-btc-70-filled',
          status: 'executed',
          fill_count: 20,
          fill_count_fp: '20.00',
        },
      }
    }
    w.__HUB_TEST_LIVE_QUOTE = {
      btc: {
        ticker,
        clock: '15m',
        clockId: '15m',
        closeAt: at,
        tradingActive: true,
        openMarkets: 1,
        live: 80080,
        beat: 80000,
        yesAsk: 70,
        noAsk: 31,
        fetchedAt: Date.now(),
        points: [
          { t: Date.now() - 4000, px: 80040 },
          { t: Date.now(), px: 80080 },
        ],
      },
    }
  }, { at: closeAt, ticker })
  await setToggle(page, 'bot-btc', true)
  await setToggle(page, 'live-cash-btc', true)
  const contracts = page.getByTestId('contracts-btc')
  if ((await contracts.inputValue()) !== '20' && (await contracts.isEnabled())) {
    await contracts.fill('20')
    await contracts.blur()
  }
  await setToggle(page, 'bot-btc', false)
  await setToggle(page, 'bot-btc', true)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const w = window as Window & { __HUB_TEST_SEND?: unknown; __HUB_PLACE?: unknown }
        return Boolean(w.__HUB_TEST_SEND && w.__HUB_PLACE && (w as { __HUB_TEST_LIVE_QUOTE?: { btc?: unknown } }).__HUB_TEST_LIVE_QUOTE?.btc)
      }),
    )
    .toBe(true)
  await page.evaluate(async () => {
    const w = window as Window & {
      __HUB_TEST_SEND?: (tape: string, side: string, quote: unknown) => Promise<void>
      __HUB_TEST_LIVE_QUOTE?: Record<string, unknown>
    }
    const quote = w.__HUB_TEST_LIVE_QUOTE?.btc
    if (quote && w.__HUB_TEST_SEND) await w.__HUB_TEST_SEND('btc', 'up', quote)
  })
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const w = window as Window & { __HUB_PLACE_CALLS?: unknown[] }
        return w.__HUB_PLACE_CALLS?.length ?? 0
      })
    }, { timeout: 12_000 })
    .toBeGreaterThan(0)
  const placed = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: Array<{ count?: number; side?: string; yesAsk?: number; ticker?: string; liveOn?: boolean }>
    }
    return w.__HUB_PLACE_CALLS?.[0] ?? null
  })
  expect(placed?.ticker).toBe(ticker)
  expect(placed?.yesAsk).toBe(70)
  expect(placed?.liveOn).toBe(true)
  expect(placed?.count).toBeGreaterThanOrEqual(1)
  const msg = (await page.getByTestId('desk-msg').textContent()) ?? ''
  expect(msg).not.toMatch(/After-fee EV|lock-in|Clock spend|paper 48|Sit —/)
  await expect(page.getByTestId('desk-msg')).not.toContainText(/Sit —|After-fee EV|lock-in sit/i)
})

test('BTC liveOn sit→send: in-arm 70¢ lean-up Soft FAIL sit (bot loop, not TEST_SEND)', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await allowLiveArm(page)
  const closeAt = Date.now() + 6 * 60_000
  const ticker = `KXBTC15M-SITSEND-${closeAt}`
  await page.evaluate(({ at, ticker }) => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: unknown[]
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_LIVE_QUOTE?: Record<string, unknown>
    }
    w.__HUB_PLACE_CALLS = []
    w.__HUB_PLACE = async (p) => {
      w.__HUB_PLACE_CALLS!.push(p)
      return {
        order: {
          order_id: '01print-btc-sit-send',
          status: 'executed',
          fill_count: 20,
          fill_count_fp: '20.00',
        },
      }
    }
    w.__HUB_TEST_LIVE_QUOTE = {
      btc: {
        ticker,
        clock: '15m',
        clockId: '15m',
        closeAt: at,
        tradingActive: true,
        openMarkets: 1,
        live: 80080,
        beat: 80000,
        yesAsk: 70,
        noAsk: 31,
        fetchedAt: Date.now(),
        points: [
          { t: Date.now() - 4000, px: 80040 },
          { t: Date.now(), px: 80080 },
        ],
      },
    }
  }, { at: closeAt, ticker })
  await setToggle(page, 'bot-btc', true)
  await setToggle(page, 'live-cash-btc', true)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const w = window as Window & { __HUB_TEST_BOTS?: { scan: () => void }; __HUB_PLACE_CALLS?: unknown[] }
        w.__HUB_TEST_BOTS?.scan()
        return w.__HUB_PLACE_CALLS?.length ?? 0
      }),
    { timeout: 12_000 },
    )
    .toBeGreaterThan(0)
  const placed = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: Array<{ count?: number; side?: string; yesAsk?: number; ticker?: string; liveOn?: boolean }>
    }
    return w.__HUB_PLACE_CALLS?.[0] ?? null
  })
  expect(placed?.ticker).toBe(ticker)
  expect(placed?.yesAsk).toBe(70)
  expect(placed?.liveOn).toBe(true)
  expect(placed?.count).toBeGreaterThanOrEqual(1)
  const msg = (await page.getByTestId('desk-msg').textContent()) ?? ''
  expect(msg).not.toMatch(/After-fee EV|lock-in|Clock spend|paper 48h/)
})

test('BTC liveOn sit→send: 50¢ lean-through Soft FAIL sit', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await allowLiveArm(page)
  const closeAt = Date.now() + 6 * 60_000
  const ticker = `KXBTC15M-PRINT50-${closeAt}`
  await page.evaluate(({ at, ticker }) => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: unknown[]
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_LIVE_QUOTE?: Record<string, unknown>
    }
    w.__HUB_PLACE_CALLS = []
    w.__HUB_PLACE = async (p) => {
      w.__HUB_PLACE_CALLS!.push(p)
      return {
        order: {
          order_id: '01print-btc-50-filled',
          status: 'executed',
          fill_count: 20,
        },
      }
    }
    w.__HUB_TEST_LIVE_QUOTE = {
      btc: {
        ticker,
        clock: '15m',
        clockId: '15m',
        closeAt: at,
        tradingActive: true,
        openMarkets: 1,
        live: 80080,
        beat: 80000,
        yesAsk: 50,
        noAsk: 51,
        fetchedAt: Date.now(),
      },
    }
  }, { at: closeAt, ticker })
  await setToggle(page, 'bot-btc', true)
  await setToggle(page, 'live-cash-btc', true)
  await page.evaluate(() => {
    const w = window as Window & { __HUB_TEST_BOTS?: { scan: () => void } }
    w.__HUB_TEST_BOTS?.scan()
  })
  await page.waitForTimeout(800)
  const placed = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: Array<{ yesAsk?: number; ticker?: string; liveOn?: boolean }>
    }
    return w.__HUB_PLACE_CALLS ?? []
  })
  expect(placed).toEqual([])
})

test('NG/CU/GLD paper tickets fire in bets strip when rules fire', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  const closeAt = Date.now() + 5 * 60_000
  await page.evaluate(({ at }) => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: unknown[]
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_LIVE_QUOTE?: Record<string, unknown>
    }
    w.__HUB_PLACE_CALLS = []
    w.__HUB_PLACE = async (p) => {
      w.__HUB_PLACE_CALLS!.push(p)
      return { order: { order_id: 'should-not-post', status: 'executed', fill_count: 1 } }
    }
    w.__HUB_TEST_LIVE_QUOTE = {
      ng: {
        ticker: `KXNATGAS15M-PAPER-${at}`,
        clock: '15m',
        clockId: '15m',
        closeAt: at,
        tradingActive: true,
        openMarkets: 1,
        live: 3.12,
        beat: 3.1,
        yesAsk: 50,
        noAsk: 51,
        fetchedAt: Date.now(),
      },
      cu: {
        ticker: `KXCOPPER15M-PAPER-${at}`,
        clock: '15m',
        clockId: '15m',
        closeAt: at,
        tradingActive: true,
        openMarkets: 1,
        live: 4.12,
        beat: 4.1,
        yesAsk: 48,
        noAsk: 53,
        fetchedAt: Date.now(),
      },
      gld: {
        ticker: `KXGOLD15M-PAPER-${at}`,
        clock: '15m',
        clockId: '15m',
        closeAt: at,
        tradingActive: true,
        openMarkets: 1,
        live: 4362,
        beat: 4358,
        yesAsk: 46,
        noAsk: 55,
        fetchedAt: Date.now(),
      },
    }
  }, { at: closeAt })
  await setToggle(page, 'bot-ng', true)
  await setToggle(page, 'live-cash-ng', false)
  await setToggle(page, 'bot-cu', true)
  await setToggle(page, 'live-cash-cu', false)
  await setToggle(page, 'bot-gld', true)
  await setToggle(page, 'live-cash-gld', false)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const w = window as Window & { __HUB_TEST_BOTS?: { scan: () => void } }
        w.__HUB_TEST_BOTS?.scan()
        const rows = [...document.querySelectorAll('[data-testid="bets-log"] [data-kind="paper"]')]
        const tapes = rows.map((el) => (el.textContent || '').toUpperCase())
        return {
          places: (w as Window & { __HUB_PLACE_CALLS?: unknown[] }).__HUB_PLACE_CALLS?.length ?? 0,
          ng: tapes.some((t) => t.includes('NG')),
          cu: tapes.some((t) => t.includes('CU')),
          gld: tapes.some((t) => t.includes('GLD')),
        }
      }),
    { timeout: 12_000 },
    )
    .toMatchObject({ places: 0, ng: true, cu: true, gld: true })
})

test('BTC liveOn arm-cross: out of arm sits, in-arm tick posts', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await allowLiveArm(page)
  const outAt = Date.now() + 14 * 60_000
  const inAt = Date.now() + 6 * 60_000
  const ticker = `KXBTC15M-ARMCROSS-${inAt}`
  await page.evaluate(({ at, ticker }) => {
    const w = window as Window & {
      __HUB_PLACE_CALLS?: unknown[]
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_LIVE_QUOTE?: Record<string, unknown>
    }
    w.__HUB_PLACE_CALLS = []
    w.__HUB_PLACE = async (p) => {
      w.__HUB_PLACE_CALLS!.push(p)
      return {
        order: {
          order_id: '01print-btc-arm-cross',
          status: 'executed',
          fill_count: 8,
        },
      }
    }
    w.__HUB_TEST_LIVE_QUOTE = {
      btc: {
        ticker,
        clock: '15m',
        clockId: '15m',
        closeAt: at,
        tradingActive: true,
        openMarkets: 1,
        live: 80080,
        beat: 80000,
        yesAsk: 70,
        noAsk: 31,
        fetchedAt: Date.now(),
      },
    }
  }, { at: outAt, ticker })
  await setToggle(page, 'bot-btc', true)
  await setToggle(page, 'live-cash-btc', true)
  await page.evaluate(() => {
    const w = window as Window & { __HUB_TEST_BOTS?: { scan: () => void } }
    w.__HUB_TEST_BOTS?.scan()
  })
  await page.waitForTimeout(400)
  const before = await page.evaluate(() => {
    const w = window as Window & { __HUB_PLACE_CALLS?: unknown[] }
    return w.__HUB_PLACE_CALLS?.length ?? 0
  })
  expect(before).toBe(0)
  await page.evaluate((at) => {
    const w = window as Window & { __HUB_TEST_LIVE_QUOTE?: { btc?: { closeAt?: number } } }
    if (w.__HUB_TEST_LIVE_QUOTE?.btc) w.__HUB_TEST_LIVE_QUOTE.btc.closeAt = at
  }, inAt)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const w = window as Window & { __HUB_TEST_BOTS?: { scan: () => void }; __HUB_PLACE_CALLS?: unknown[] }
        w.__HUB_TEST_BOTS?.scan()
        return w.__HUB_PLACE_CALLS?.length ?? 0
      }),
    { timeout: 12_000 },
    )
    .toBeGreaterThan(0)
})

test('24H bets table one book — hist dump Soft FAIL flicker', async ({ page }) => {
  test.setTimeout(60_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await page.evaluate(() => {
    ;(window as Window & { __HUB_HOLD_BETS24?: boolean }).__HUB_HOLD_BETS24 = true
  })
  await expect.poll(async () => page.evaluate(() => Boolean((window as Window & { __HUB_TEST_BETS?: unknown }).__HUB_TEST_BETS))).toBe(true)
  const ts = Date.now()
  await page.evaluate((at) => {
    ;(window as Window & { __HUB_TEST_BETS?: { replace: (bets: unknown[]) => void } }).__HUB_TEST_BETS?.replace([
      {
        betId: 'bet_ord-live-freeze-a',
        tape: 'btc',
        ticker: 'KXBTC15M-FREEZEA',
        clock: '15m',
        closeAt: at,
        side: 'up',
        count: 1,
        ask: 70,
        spent: 25,
        orderId: 'ord-live-freeze-aaaa',
        status: 'settled',
        pnl: 10,
        filledAt: at - 1000,
        settledAt: at,
        kind: 'live',
      },
      {
        betId: 'paper:freeze-a',
        tape: 'btc',
        ticker: 'KXBTC15M-FREEZEP',
        clock: '15m',
        closeAt: at,
        side: 'down',
        count: 1,
        ask: 40,
        spent: 8,
        orderId: 'paper-btc-freezea',
        status: 'settled',
        pnl: -8,
        filledAt: at - 500,
        settledAt: at,
        kind: 'paper',
      },
      {
        betId: 'bet_deskfill-ghost-a',
        tape: 'btc',
        ticker: 'KXBTC15M-GHOSTA',
        clock: '15m',
        closeAt: at,
        side: 'down',
        count: 1,
        ask: 40,
        spent: 99,
        orderId: 'deskfill-btc-ghosta',
        status: 'settled',
        pnl: -99,
        filledAt: at - 200,
        settledAt: at,
        kind: 'live',
      },
    ])
  }, ts)
  const snapshot = async () =>
    page.evaluate(() => ({
      placed: document.querySelector('[data-testid="bets-placed"]')?.textContent?.trim() || '',
      wl: document.querySelector('[data-testid="bets-wl"]')?.textContent?.trim() || '',
      rows: document.querySelectorAll('[data-testid="bets-log"] li').length,
    }))
  await expect(page.locator('[data-order-id="ord-live-freeze-aaaa"]')).toBeVisible({ timeout: 8_000 })
  await expect(page.locator('[data-order-id="paper-btc-freezea"]')).toBeVisible()
  await expect(page.locator('[data-order-id^="deskfill-"]')).toHaveCount(0)
  await expect.poll(async () => (await snapshot()).placed, { timeout: 8_000 }).toMatch(/\$33/)
  const frozen = await snapshot()
  expect(frozen.rows).toBe(2)
  expect(frozen.wl).toMatch(/1W–1L/)
  await page.evaluate((ts) => {
    const hist = Array.from({ length: 200 }, (_, i) => ({
      betId: `kalshi:KXBTC15M-H${i}`,
      tape: 'btc',
      ticker: `KXBTC15M-H${i}`,
      clock: '15m',
      closeAt: ts,
      side: 'up',
      count: 1,
      ask: 50,
      spent: 50,
      orderId: `settled-KXBTC15M-H${i}`,
      status: 'settled',
      pnl: 0.5,
      filledAt: ts,
      settledAt: ts,
      kind: 'hist',
    }))
    ;(window as Window & { __HUB_TEST_BETS?: { inject: (bets: unknown[]) => void } }).__HUB_TEST_BETS?.inject(hist)
  }, Date.now())
  const start = Date.now()
  while (Date.now() - start < 5000) {
    const cur = await snapshot()
    expect(cur.placed).toBe(frozen.placed)
    expect(cur.wl).toBe(frozen.wl)
    expect(cur.rows).toBe(frozen.rows)
    expect(cur.placed).not.toMatch(/11,?784/)
    expect(cur.wl).not.toMatch(/255W/)
    await page.waitForTimeout(400)
  }
  const now = Date.now()
  await page.evaluate((ts) => {
    const w = window as Window & { __HUB_TEST_BETS?: { add: (bet: unknown) => void } }
    w.__HUB_TEST_BETS?.add({
      betId: 'bet_deskfill-24h-add',
      tape: 'btc',
      ticker: 'KXBTC15M-GHOSTADD',
      clock: '15m',
      closeAt: ts,
      side: 'down',
      count: 1,
      ask: 40,
      spent: 4,
      orderId: 'deskfill-btc-24hadd',
      status: 'settled',
      pnl: -4,
      filledAt: ts,
      settledAt: ts,
      kind: 'live',
    })
    w.__HUB_TEST_BETS?.add({
      betId: 'bet_live-24h-add',
      tape: 'btc',
      ticker: 'KXBTC15M-LIVEADD',
      clock: '15m',
      closeAt: ts,
      side: 'up',
      count: 1,
      ask: 70,
      spent: 7,
      orderId: 'ord-live-24hadd-aaaa',
      status: 'settled',
      pnl: 3,
      filledAt: ts,
      settledAt: ts,
      kind: 'live',
    })
  }, now)
  await expect.poll(async () => (await snapshot()).rows, { timeout: 8_000 }).toBe(frozen.rows + 1)
  const after = await snapshot()
  expect(after.placed).not.toBe(frozen.placed)
  await expect(page.locator('[data-order-id="deskfill-btc-24hadd"]')).toHaveCount(0)
  await expect(page.locator('[data-order-id^="deskfill-"]')).toHaveCount(0)
  await expect(page.locator('[data-order-id^="deskfill-"] [data-testid="bets-mode"]', { hasText: 'LIVE' })).toHaveCount(0)
  await expect(page.locator('[data-order-id="ord-live-24hadd-aaaa"] [data-testid="bets-mode"]')).toHaveText('LIVE')
  await expect(page.locator('[data-testid="bets-mode"]', { hasText: 'HIST' })).toHaveCount(0)
  await page.waitForTimeout(1200)
  const hold = await snapshot()
  expect(hold.placed).toBe(after.placed)
  expect(hold.wl).toBe(after.wl)
  expect(hold.rows).toBe(after.rows)
})

test('BTC news + hour + same-clock Soft FAIL Accept', async ({ page }) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('analyst-news-focus-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-hour-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-clock-prior-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-hour-btc')).toContainText(/Hour|Sat hour/)
  await expect(page.getByTestId('analyst-clock-prior-btc')).toContainText(/Same-clock prior/)
  await expect(page.getByTestId('analyst-lock')).toContainText(/drafts stay paper/)
  await expect(page.getByTestId('analyst-accept-btc')).toHaveCount(0)
  await expect(page.locator('[data-testid^="chief-accept-"]')).toHaveCount(0)
  await expect(page.locator('[data-order-id^="deskfill-"]')).toHaveCount(0)
})

test('EXIT WATCH fade-to-beat paper EXIT; no-fade holds to settle', async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(() => {
    ;(window as Window & { __HUB_HOLD_EXIT?: boolean }).__HUB_HOLD_EXIT = true
  })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect
    .poll(async () => page.evaluate(() => Boolean((window as Window & { __HUB_TEST_EXIT?: unknown }).__HUB_TEST_EXIT)), {
      timeout: 20_000,
    })
    .toBe(true)
  const now = Date.now()
  const out = await page.evaluate((at) => {
    const w = window as Window & {
      __HUB_HOLD_EXIT?: boolean
      __HUB_TEST_EXIT?: {
        apply: (input: Record<string, unknown>) => { action: string; locked: number; liveSell: boolean; paper: boolean; why: string }
        logs: () => Array<{ orderId: string; action: string; why: string; locked: number; liveSell: boolean }>
      }
      __HUB_PLACE_CALLS?: unknown[]
    }
    w.__HUB_HOLD_EXIT = true
    w.__HUB_PLACE_CALLS = []
    const fadePts = Array.from({ length: 8 }, (_, i) => ({
      t: at - 45_000 + (i * 45_000) / 7,
      px: 80_120 + ((80_040 - 80_120) * i) / 7,
    }))
    const holdPts = Array.from({ length: 8 }, (_, i) => ({
      t: at - 45_000 + (i * 45_000) / 7,
      px: 80_100 + ((80_130 - 80_100) * i) / 7,
    }))
    const fade = w.__HUB_TEST_EXIT!.apply({
      tape: 'btc',
      ticker: 'KXBTC15M-EXITFADE',
      orderId: '01exit-btc-fill-aaaa',
      side: 'up',
      contracts: 20,
      entryAsk: 70,
      beat: 80_000,
      live: 80_040,
      closeAt: at + 6 * 60_000,
      points: fadePts,
      yesAsk: 75,
      noAsk: 22,
      fillCount: 20,
      now: at,
    })
    const hold = w.__HUB_TEST_EXIT!.apply({
      tape: 'btc',
      ticker: 'KXBTC15M-EXITHOLD',
      orderId: '01exit-btc-hold-bbbb',
      side: 'up',
      contracts: 20,
      entryAsk: 70,
      beat: 80_000,
      live: 80_120,
      closeAt: at + 6 * 60_000,
      points: holdPts,
      yesAsk: 75,
      noAsk: 22,
      fillCount: 20,
      now: at,
    })
    const logs = w.__HUB_TEST_EXIT!.logs()
    return {
      fade,
      hold,
      sells: w.__HUB_PLACE_CALLS ?? [],
      lock: document.querySelector('[data-testid="exit-watch-lock"]')?.textContent ?? '',
      accepts: document.querySelectorAll('[data-testid="analyst-accept-btc"], [data-testid^="chief-accept-"]').length,
      ghosts: document.querySelectorAll('[data-order-id^="deskfill-"]').length,
      fadeLog: logs.find((l) => l.orderId === '01exit-btc-fill-aaaa') ?? null,
      holdLog: logs.find((l) => l.orderId === '01exit-btc-hold-bbbb') ?? null,
    }
  }, now)
  expect(out.fade.action).toBe('exit')
  expect(out.fade.locked).toBeGreaterThanOrEqual(0.4)
  expect(out.fade.liveSell).toBe(false)
  expect(out.fade.paper).toBe(true)
  expect(out.fade.why).toMatch(/Profit lock/)
  expect(out.hold.action).toBe('hold')
  expect(out.hold.liveSell).toBe(false)
  expect(out.sells).toEqual([])
  expect(out.lock).toMatch(/no Live sell/)
  expect(out.lock).toMatch(/drafts stay paper/)
  expect(out.accepts).toBe(0)
  expect(out.ghosts).toBe(0)
  expect(out.fadeLog?.action).toBe('exit')
  expect(out.fadeLog?.why).toMatch(/Profit lock/)
  expect(out.fadeLog?.locked).toBeGreaterThanOrEqual(0.4)
  expect(out.fadeLog?.liveSell).toBe(false)
  expect(out.holdLog?.action).toBe('hold')
  expect(out.holdLog?.liveSell).toBe(false)
})

test('live tick + prints keep moving; stale banner then recover', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect
    .poll(async () => page.evaluate(() => Boolean((window as Window & { __HUB_TEST_FEED?: unknown }).__HUB_TEST_FEED)), {
      timeout: 20_000,
    })
    .toBe(true)
  const before = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_TEST_FEED?: { tickAt: () => number; printFetches: () => number }
    }
    return { tick: w.__HUB_TEST_FEED!.tickAt(), fetches: w.__HUB_TEST_FEED!.printFetches() }
  })
  await page.waitForTimeout(3_200)
  const after = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_TEST_FEED?: { tickAt: () => number; printFetches: () => number }
    }
    return { tick: w.__HUB_TEST_FEED!.tickAt(), fetches: w.__HUB_TEST_FEED!.printFetches() }
  })
  expect(after.tick - before.tick).toBeGreaterThanOrEqual(2_500)
  expect(after.fetches).toBeGreaterThan(before.fetches)
  await expect(page.getByTestId('desk')).toHaveAttribute('data-desk-tick', '100')
  await expect(page.getByTestId('desk')).toHaveAttribute('data-print-ms', '250')
  await expect(page.getByTestId('desk')).toHaveAttribute('data-exit-scan', '400')
  await expect(page.getByTestId('feed-stale')).toHaveCount(0)
  await page.evaluate(() => {
    ;(window as Window & { __HUB_TEST_FEED?: { forceStale: (on?: boolean) => void } }).__HUB_TEST_FEED!.forceStale(true)
  })
  await expect(page.getByTestId('feed-reconnect')).toBeVisible()
  await expect(page.getByTestId('feed-reconnect')).toHaveText('reconnecting')
  await page.evaluate(() => {
    ;(window as Window & { __HUB_TEST_FEED?: { forceStale: (on?: boolean) => void } }).__HUB_TEST_FEED!.forceStale(false)
  })
  await expect(page.getByTestId('feed-reconnect')).toHaveCount(0)
})

test('prints soak ≥10s keeps the clock live with no FEED STALE banner', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect
    .poll(async () => page.evaluate(() => Boolean((window as Window & { __HUB_TEST_FEED?: unknown }).__HUB_TEST_FEED)), {
      timeout: 20_000,
    })
    .toBe(true)
  const start = await page.evaluate(() => {
    const w = window as Window & { __HUB_TEST_FEED?: { printFetches: () => number; stale: () => boolean } }
    return { fetches: w.__HUB_TEST_FEED!.printFetches(), stale: w.__HUB_TEST_FEED!.stale() }
  })
  expect(start.stale).toBe(false)
  await page.waitForTimeout(10_200)
  const end = await page.evaluate(() => {
    const w = window as Window & { __HUB_TEST_FEED?: { printFetches: () => number; stale: () => boolean } }
    return {
      fetches: w.__HUB_TEST_FEED!.printFetches(),
      stale: w.__HUB_TEST_FEED!.stale(),
      banner: Boolean(document.querySelector('[data-testid="feed-stale"]')),
      flag: document.querySelector('[data-testid="desk"]')?.getAttribute('data-feed-stale'),
    }
  })
  expect(end.fetches).toBeGreaterThan(start.fetches)
  expect(end.stale).toBe(false)
  expect(end.banner).toBe(false)
  expect(end.flag).toBe('0')
})

test('clock advances 5s wall time with a 4s print delay and no FEED STALE banner', async ({ page }) => {
  test.setTimeout(45_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect
    .poll(async () => page.evaluate(() => Boolean((window as Window & { __HUB_TEST_FEED?: unknown }).__HUB_TEST_FEED)), {
      timeout: 20_000,
    })
    .toBe(true)
  await expect(page.getByTestId('desk')).toHaveAttribute('data-feed-stale-ms', '15000')
  await expect(page.getByTestId('desk')).toHaveAttribute('data-print-ms', '250')
  const closeAt = Date.now() + 8 * 60_000
  await page.evaluate((at) => {
    const w = window as Window & {
      __HUB_TEST_CLOSE_CLOCK?: { tradingActive: boolean; stale: boolean; closeAt: number }
      __HUB_TEST_OPEN_MARKETS?: Record<string, number>
      __HUB_TEST_FEED?: { delayPrints: (ms: number) => void }
    }
    w.__HUB_TEST_OPEN_MARKETS = { btc: 1, ng: 1, cu: 1, gld: 1, wti: 1, slv: 1 }
    w.__HUB_TEST_CLOSE_CLOCK = { tradingActive: true, stale: false, closeAt: at }
    w.__HUB_TEST_FEED!.delayPrints(4000)
  }, closeAt)
  await expect(page.getByTestId('close-clock-btc')).toHaveAttribute('data-clock-kind', 'live')
  const startText = (await page.getByTestId('close-clock-btc').textContent()) ?? ''
  const parse = (t: string) => {
    const m = t.trim().match(/^(\d+):(\d{2})$/)
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }
  const startSec = parse(startText)
  expect(startSec).toBeGreaterThan(60)
  await page.waitForTimeout(5_200)
  const endText = (await page.getByTestId('close-clock-btc').textContent()) ?? ''
  const endSec = parse(endText)
  expect(endSec).not.toBeNull()
  expect(startSec! - endSec!).toBeGreaterThanOrEqual(4)
  expect(startSec! - endSec!).toBeLessThanOrEqual(7)
  await expect(page.getByTestId('feed-stale')).toHaveCount(0)
  await expect(page.getByTestId('feed-reconnect')).toHaveCount(0)
  await expect(page.getByTestId('desk')).toHaveAttribute('data-feed-stale', '0')
  await expect(page.getByTestId('live-btc')).not.toHaveText('')
})
