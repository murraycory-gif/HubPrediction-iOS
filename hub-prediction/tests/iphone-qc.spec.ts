import { expect, test } from '@playwright/test'

test('phone desk: four tapes, settings persist, live/bots off', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('desk-title')).toHaveText('HUB / PREDICTIONS')
  await expect(page.getByTestId('desk-title')).not.toHaveText(/HUBEB|PREDICTTIONS|HUBPREDICTIONS/)
  await expect(page.locator('.rain-col')).toHaveCount(0)
  await expect(page.getByTestId('rain')).toBeEmpty()
  const rainIso = await page.evaluate(() => {
    const head = document.querySelector('[data-testid="desk-head"]') as HTMLElement
    const rain = document.querySelector('[data-testid="rain"]') as HTMLElement
    const title = document.querySelector('[data-testid="desk-title"]') as HTMLElement
    const plate = document.querySelector('[data-testid="wordmark"]') as HTMLElement
    const cs = (el: HTMLElement) => getComputedStyle(el)
    const before = getComputedStyle(head, '::before').content
    return {
      before,
      rainZ: Number(cs(rain).zIndex) || 0,
      titleZ: Number(cs(title).zIndex) || 0,
      plateZ: Number(cs(plate).zIndex) || 0,
      titleBg: cs(title).backgroundColor,
      plateBg: cs(plate).backgroundColor,
      rainText: (rain.textContent || '').trim(),
    }
  })
  expect(rainIso.before === 'none' || rainIso.before === 'normal').toBeTruthy()
  expect(rainIso.rainText).toBe('')
  expect(rainIso.plateZ).toBeGreaterThan(rainIso.rainZ)
  expect(rainIso.titleZ).toBeGreaterThan(rainIso.rainZ)
  expect(rainIso.titleBg).not.toMatch(/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/i)
  expect(rainIso.plateBg).not.toMatch(/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/i)
  const plates = await page.evaluate(() => {
    const rain = document.querySelector('[data-testid="rain"]') as HTMLElement
    const title = document.querySelector('[data-testid="desk-title"]') as HTMLElement
    const beat = document.querySelector('[data-testid="beat-label-btc"]') as HTMLElement
    const live = document.querySelector('[data-testid="live-plate-btc"]') as HTMLElement
    const rr = rain.getBoundingClientRect()
    const hit = (el: HTMLElement) => {
      const b = el.getBoundingClientRect()
      return !(b.right <= rr.left || b.left >= rr.right || b.bottom <= rr.top || b.top >= rr.bottom)
    }
    const opaque = (el: HTMLElement) => {
      const bg = getComputedStyle(el).backgroundColor
      return !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/i.test(bg)
    }
    return {
      titleText: (title.textContent || '').trim(),
      beatText: (beat.textContent || '').trim(),
      rainHitsBeat: hit(beat),
      rainHitsLive: hit(live),
      rainBottom: rr.bottom,
      beatTop: beat.getBoundingClientRect().top,
      beatPlate: opaque(beat) || opaque(beat.closest('.glyph-plate') as HTMLElement),
      livePlate: opaque(live),
    }
  })
  expect(plates.titleText).toBe('HUB / PREDICTIONS')
  expect(plates.titleText).not.toMatch(/HUBEB|PREDICTTIONS|HUBPREDICTIONS/)
  expect(plates.beatText).toBe('TO BEAT')
  expect(plates.beatText).not.toMatch(/BEATET/)
  expect(plates.rainHitsBeat).toBe(false)
  expect(plates.rainHitsLive).toBe(false)
  expect(plates.rainBottom).toBeLessThan(plates.beatTop)
  expect(plates.beatPlate).toBe(true)
  expect(plates.livePlate).toBe(true)
  await expect(page.getByTestId('bets-filter-all')).toHaveText('All')
  await expect(page.getByTestId('bets-filter-all')).not.toHaveText(/ALLLO/)
  await expect(page.getByTestId('bets-filter-btc')).toHaveText('BTC')
  await expect(page.getByTestId('bets-filter-btc')).not.toHaveText(/BTCC/)
  await expect(page.getByTestId('save-btc')).toHaveText('Save')
  await expect(page.getByTestId('contracts-label-btc')).toHaveText('Contracts')
  await expect(page.getByTestId('contracts-label-btc')).not.toHaveText(/CONTRACTY/)
  const head = page.getByTestId('desk-head')
  const box = await head.boundingBox()
  expect(box?.y).toBeLessThanOrEqual(2)

  for (const id of ['btc', 'ng', 'cu', 'gld']) {
    await expect(page.getByTestId(`tape-${id}`)).toBeVisible()
    await expect(page.getByTestId(`status-${id}`)).toHaveText('WAIT')
    await expect(page.getByTestId(`hit-${id}`)).toContainText(/Hit percent/i)
    await expect(page.getByTestId(`wl-${id}`)).toContainText(/W–L|W-L|\d+W/)
    await expect(page.getByTestId(`bot-${id}`)).toBeChecked()
    await expect(page.getByTestId(`race-${id}`)).toBeVisible()
    await expect(page.getByTestId(`save-${id}`)).toBeVisible()
    await expect(page.getByTestId(`clock-${id}`)).toHaveValue('15m')
  }

  await expect(page.getByTestId('scoreboard')).toBeVisible()
  const boardCss = await page.getByTestId('scoreboard').evaluate((el) => {
    const s = getComputedStyle(el)
    return { display: s.display, cols: s.gridTemplateColumns, dir: s.flexDirection, wrap: s.flexWrap }
  })
  expect(boardCss.display).toBe('grid')
  expect(boardCss.cols.split(' ').length).toBe(3)
  const pnlBox = await page.getByTestId('pnl').boundingBox()
  const ttlBox = await page.getByTestId('ttl').boundingBox()
  const cashBox = await page.getByTestId('kalshi-cash').boundingBox()
  expect(pnlBox && ttlBox && cashBox).toBeTruthy()
  expect((ttlBox?.x ?? 0)).toBeGreaterThan((pnlBox?.x ?? 0) + (pnlBox?.width ?? 0) - 2)
  expect((cashBox?.x ?? 0)).toBeGreaterThan((ttlBox?.x ?? 0) + (ttlBox?.width ?? 0) - 2)
  expect(Math.abs((pnlBox?.y ?? 0) - (ttlBox?.y ?? 0))).toBeLessThan(8)
  expect(Math.abs((ttlBox?.y ?? 0) - (cashBox?.y ?? 0))).toBeLessThan(8)
  for (const id of ['pnl', 'ttl', 'kalshi-cash']) {
    const dir = await page.getByTestId(id).evaluate((el) => getComputedStyle(el).flexDirection)
    expect(dir).toBe('column')
    const labelBox = await page.getByTestId(`${id}-label`).boundingBox()
    const valueBox = await page.getByTestId(`${id}-value`).boundingBox()
    expect(labelBox && valueBox).toBeTruthy()
    expect((valueBox?.y ?? 0)).toBeGreaterThan((labelBox?.y ?? 0) + (labelBox?.height ?? 0) - 2)
  }
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
  await expect(page.getByTestId('bets-24h')).toContainText(/Bets since first deposit/i)
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
  await expect(page.getByTestId('bets-24h')).toHaveAttribute('data-filter', 'btc,ng')
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('hub.desk.settings.v1')
        if (!raw) return localStorage.getItem('hub.desk.betsFilter.v1')
        return JSON.stringify(JSON.parse(raw).betsFilter)
      }),
    )
    .toBe(JSON.stringify(['btc', 'ng']))
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-24h.png' })
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByTestId('bets-filter-all')).toBeVisible()
  await expect(page.getByTestId('bets-24h')).toHaveAttribute('data-filter', 'btc,ng')
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-ng')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('bets-filter-all').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.getByTestId('bot-btc')).toBeChecked()
  await expect(page.getByTestId('live-cash-btc')).not.toBeChecked()
  await expect(page.getByTestId('analyst-toggle')).toBeVisible()
  await expect(page.getByTestId('finance-toggle')).toBeVisible()
  await expect(page.getByTestId('analyst')).toBeVisible()
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
  await page.getByTestId('clock-btc').selectOption('5m')
  await expect(page.getByTestId('clock-btc')).toHaveValue('5m')
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByTestId('clock-btc')).toHaveValue('5m')
  await expect(page.getByTestId('clock-ng')).toHaveValue('15m')
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
        'hub.desk.cash.v1',
        JSON.stringify({ cash: 485, deposits: 500, pnl: -15, firstDepositAt: ts - 60_000, asOf: ts }),
      )
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
            {
              betId: 'bet_cu_paper',
              tape: 'cu',
              ticker: 'KXCOPPER15M-A',
              clock: '15m',
              closeAt: Date.parse('2026-09-18T16:45:00-05:00'),
              side: 'up',
              count: 1,
              ask: 40,
              spent: 8,
              orderId: 'deskfill-cu-aaaaaaaa',
              status: 'settled',
              pnl: -8,
              filledAt: ts - 3000,
              settledAt: ts,
              kind: 'paper',
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
  await expect(page.getByTestId('bets-wl')).toContainText('1W–2L')
  await expect(page.getByTestId('bets-pnl')).toContainText('−$15.00')
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-all.png' })
  await expect(page.getByTestId('bets-log')).toContainText('LIVE')
  await expect(page.getByTestId('bets-log')).toContainText('PAPER')
  await expect(page.getByTestId('bets-log')).toContainText('Sep 18')
  await expect(page.getByTestId('bets-log')).toContainText('CDT')
  await expect(page.getByTestId('bets-mode').first()).toHaveClass(/mode-live|mode-paper/)
  await expect(page.locator('.bets-log-head')).toContainText('WINDOW')
  await expect(page.locator('.bets-log-head')).toContainText('CLOCK')
  await expect(page.locator('.bets-log-head')).toContainText('MODE')
  await expect(page.locator('.bets-log-head')).toContainText('CASH')
  await expect(page.locator('.bets-log-scroll')).toBeVisible()
  await expect(page.locator('.bets-log-wrap')).toHaveCSS('overflow-x', 'auto')
  await expect(page.getByTestId('bets-log')).toHaveCSS('overflow-x', 'hidden')
  await expect(page.locator('[data-kind="live"] [data-testid="bets-cash"]').first()).toContainText('$')
  await expect(page.locator('[data-kind="paper"] [data-testid="bets-cash"]').first()).toContainText('$')
  await expect(page.locator('[data-kind="paper"] [data-testid="bets-cash"]').first()).not.toHaveText('N/A')
  await page.getByTestId('bets-filter-btc').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('bets-placed')).toContainText('$10.00')
  await expect(page.getByTestId('bets-wl')).toContainText('1W–0L')
  await expect(page.getByTestId('bets-pnl')).toContainText('+$5.00')
  await page.getByTestId('bets-filter-ng').click()
  await expect(page.getByTestId('bets-placed')).toContainText('$30.00')
  await expect(page.getByTestId('bets-wl')).toContainText('1W–1L')
  await page.getByTestId('bets-filter-all').click()
  await page.getByTestId('bets-filter-cu').click()
  await expect(page.getByTestId('bets-placed')).toContainText('—')
  await expect(page.getByTestId('bets-wl')).toContainText('0W–1L')
  await expect(page.getByTestId('bets-pnl')).toContainText('$0.00')
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-filter.png' })
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.locator('body')).not.toContainText('BITCOIN 15 MINUTE')
})

test('desktop desk: full bets log + auto analyst, no Accept/Deny', async ({ page }) => {
  const now = Date.now()
  await page.addInitScript(
    ([ts]) => {
      localStorage.setItem(
        'hub.desk.cash.v1',
        JSON.stringify({ cash: 485, deposits: 500, pnl: -15, firstDepositAt: ts - 60_000, asOf: ts }),
      )
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
              clock: '15m',
              closeAt: Date.parse('2026-09-18T16:45:00-05:00'),
              side: 'up',
              count: 1,
              ask: 70,
              spent: 10,
              orderId: 'ord-btc-aaaaaa',
              status: 'settled',
              pnl: 5,
              filledAt: ts - 1000,
              settledAt: ts,
              kind: 'live',
            },
            {
              betId: 'bet_ng',
              tape: 'ng',
              ticker: 'KXNATGAS15M-A',
              clock: '15m',
              closeAt: Date.parse('2026-09-18T16:30:00-05:00'),
              side: 'down',
              count: 1,
              ask: 40,
              spent: 20,
              orderId: 'ord-ng-bbbbbb',
              status: 'settled',
              pnl: -20,
              filledAt: ts - 2000,
              settledAt: ts,
              kind: 'live',
            },
            {
              betId: 'bet_cu_paper',
              tape: 'cu',
              ticker: 'KXCOPPER15M-A',
              clock: '15m',
              closeAt: Date.parse('2026-09-18T16:15:00-05:00'),
              side: 'up',
              count: 1,
              ask: 40,
              spent: 8,
              orderId: 'deskfill-cu-aaaaaaaa',
              status: 'settled',
              pnl: -8,
              filledAt: ts - 3000,
              settledAt: ts,
              kind: 'paper',
            },
          ],
        }),
      )
    },
    [now],
  )
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('bets-log')).toContainText('Sep 18')
  await expect(page.getByTestId('bets-log')).toContainText('CDT')
  await expect(page.getByTestId('bets-log')).toContainText('15m')
  await expect(page.getByTestId('bets-mode').first()).toHaveClass(/mode-live|mode-paper/)
  await expect(page.locator('.bets-log-head')).toContainText('CLOCK')
  await expect(page.locator('.result-win, .result-loss').first()).toBeVisible()
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/desktop-bets-all.png' })
  await expect(page.getByTestId('analyst')).toBeVisible()
  await expect(page.getByTestId('analyst-lock')).toContainText(/No Accept/)
  await expect(page.locator('.rec-accept')).toHaveCount(0)
  await expect(page.locator('.rec-deny')).toHaveCount(0)
  await expect(page.getByTestId('analyst-auto-btc')).toBeVisible()
  await page.getByTestId('analyst').screenshot({ path: '/opt/cursor/artifacts/screenshots/desktop-analyst-auto.png' })
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
})

test('phone desk: MAXIMUM QC every tap — Live and live-cash stay OFF', async ({ page }) => {
  const livePosts: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && /external-api\.kalshi\.com.*\/events\/orders/i.test(req.url())) {
      livePosts.push(req.url())
    }
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('desk-title')).toHaveText('HUB / PREDICTIONS')
  await expect(page.getByTestId('pulse')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('BITCOIN 15 MINUTE')
  await expect(page.getByTestId('bets-24h')).toBeVisible()
  await expect(page.getByTestId('save-btc')).toBeVisible()
  await expect(page.getByTestId('live-bets')).not.toBeChecked()

  const liveLabel = page.locator('label.toggle').filter({ has: page.getByTestId('live-bets') })
  await liveLabel.click()
  await expect(page.getByTestId('live-banner')).toBeVisible()
  await page.getByTestId('cancel-live').click()
  await expect(page.getByTestId('live-banner')).toHaveCount(0)
  await expect(page.getByTestId('live-bets')).not.toBeChecked()

  await liveLabel.click()
  await expect(page.getByTestId('live-banner')).toBeVisible()
  await page.getByTestId('confirm-live').click()
  await expect(page.getByTestId('live-banner')).toHaveCount(0)
  await expect(page.getByTestId('live-bets')).not.toBeChecked()

  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings')).toBeVisible()
  await expect(page.getByTestId('arm-from-btc')).toHaveValue('8')
  await expect(page.getByTestId('through-btc')).toHaveValue('40')
  await expect(page.getByTestId('cent-lo-btc')).toHaveValue('69')
  await page.getByRole('button', { name: 'Refresh cash' }).click()
  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings')).toHaveCount(0)

  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    await page.getByTestId(`bot-${id}`).scrollIntoViewIfNeeded()
    await expect(page.getByTestId(`bot-${id}`)).toBeChecked()
    await expect(page.getByTestId(`live-cash-${id}`)).not.toBeChecked()
    await page.getByTestId(`bot-${id}`).uncheck()
    await expect(page.getByTestId(`bot-${id}`)).not.toBeChecked()
    await page.getByTestId(`bot-${id}`).check()
    await expect(page.getByTestId(`bot-${id}`)).toBeChecked()
    await page.getByTestId(`bot-${id}`).uncheck()
    await expect(page.getByTestId(`bot-${id}`)).not.toBeChecked()
    await page.getByTestId(`live-cash-${id}`).check()
    await expect(page.getByTestId(`live-cash-${id}`)).toBeChecked()
    await page.getByTestId(`live-cash-${id}`).uncheck()
    await expect(page.getByTestId(`live-cash-${id}`)).not.toBeChecked()
  }

  await page.getByTestId('contracts-btc').fill('21')
  await page.getByTestId('save-btc').click()
  await expect(page.getByTestId('contracts-btc')).toHaveValue('21')

  await page.getByTestId('contracts-ng').fill('8')
  await page.getByTestId('contracts-ng').press('Enter')
  await expect(page.getByTestId('contracts-ng')).toHaveValue('8')

  await page.getByTestId('contracts-cu').fill('5')
  await page.getByTestId('contracts-cu').blur()
  await expect(page.getByTestId('contracts-cu')).toHaveValue('5')

  await page.getByTestId('contracts-gld').fill('3')
  await page.getByTestId('save-gld').click()
  await expect(page.getByTestId('contracts-gld')).toHaveValue('3')

  await expect(page.getByTestId('analyst')).toBeVisible()
  await expect(page.getByTestId('analyst-report-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-expert-btc')).toContainText(/BTC desk chief/)
  await expect(page.getByTestId('analyst-rules-btc')).toContainText(/Current rules/)
  await expect(page.getByTestId('analyst-proposed-btc')).toContainText(/Proposed/)
  await expect(page.getByTestId('analyst-profit-btc')).toContainText(/Profit dollars/)
  await expect(page.getByTestId('analyst-lock')).toContainText(/No Accept/)
  await expect(page.locator('.rec-accept')).toHaveCount(0)
  await expect(page.locator('.rec-deny')).toHaveCount(0)
  await expect(page.locator('.bets-log-head')).toContainText('WINDOW')
  await expect(page.locator('.bets-log-head')).toContainText('CLOCK')
  await expect(page.locator('.bets-log-head')).toContainText('CASH')
  await expect(page.getByTestId('analyst-report-ng')).toBeVisible()
  await expect(page.getByTestId('analyst-expert-ng')).toContainText(/NG desk chief/)
  await expect(page.getByTestId('analyst-report-cu')).toBeVisible()
  await expect(page.getByTestId('analyst-report-gld')).toBeVisible()
  await expect(page.getByTestId('analyst-upcoming-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-trend-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-news-focus-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-swing-good-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-swing-bad-btc')).toBeVisible()
  await page.getByTestId('analyst-toggle').click()
  await expect(page.getByTestId('analyst')).toHaveCount(0)
  await page.getByTestId('finance-toggle').click()
  await expect(page.getByTestId('finance')).toBeVisible()
  await expect(page.getByTestId('finance-lock')).toContainText(/Does not send orders/i)
  await page.getByTestId('finance-toggle').click()
  await expect(page.getByTestId('finance')).toHaveCount(0)

  await page.getByTestId('bets-filter-all').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('bets-filter-cu').click()
  await page.getByTestId('bets-filter-gld').click()
  await expect(page.getByTestId('bets-24h')).toHaveAttribute('data-filter', 'cu,gld')
  await page.getByTestId('bets-filter-all').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')

  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-max-qc.png', fullPage: true })

  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByTestId('contracts-btc')).toHaveValue('21')
  await expect(page.getByTestId('contracts-ng')).toHaveValue('8')
  await expect(page.getByTestId('contracts-cu')).toHaveValue('5')
  await expect(page.getByTestId('contracts-gld')).toHaveValue('3')
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    await expect(page.getByTestId(`live-cash-${id}`)).not.toBeChecked()
    await expect(page.getByTestId(`bot-${id}`)).not.toBeChecked()
  }
  await expect(page.getByTestId('pulse')).toHaveCount(0)
  expect(livePosts).toEqual([])
})

test('phone desk: boot first-paints from host creds — no Safari PEM, Live stays OFF', async ({ page }) => {
  const leaked: string[] = []
  const livePosts: string[] = []
  await page.addInitScript(() => {
    localStorage.removeItem('hub.kalshi.keyId')
    localStorage.removeItem('hub.kalshi.pem')
  })
  page.on('request', (req) => {
    const url = req.url()
    const data = req.postData() || ''
    if (req.method() === 'POST' && /external-api\.kalshi\.com.*\/events\/orders/i.test(url)) {
      livePosts.push(url)
    }
    if (/BEGIN (?:RSA |EC )?PRIVATE KEY|qc-boot-key-id/i.test(`${url}\n${data}`)) leaked.push(url)
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('bets-filter-all')).toBeVisible()
  await expect(page.getByTestId('bets-filter-btc')).toBeVisible()
  await expect(page.getByTestId('scoreboard')).toBeVisible()
  await expect(page.getByTestId('kalshi-cash')).toBeVisible()
  await expect(page.getByTestId('settings')).toHaveCount(0)
  await expect(page.getByTestId('key-pem')).toHaveCount(0)
  await expect(page.locator('.rain-col')).toHaveCount(0)
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.getByTestId('desk-title')).toHaveText('HUB / PREDICTIONS')
  await expect(page.getByTestId('desk-title')).not.toHaveText(/HUBEB|PREDICTTIONS/)
  await expect(page.getByTestId('beat-label-btc')).toHaveText('TO BEAT')
  await expect(page.getByTestId('beat-label-btc')).not.toHaveText(/BEATET/)
  await page.waitForTimeout(800)
  expect(leaked).toEqual([])
  expect(livePosts).toEqual([])
  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    await expect(page.getByTestId(`live-cash-${id}`)).not.toBeChecked()
  }
})

test('desktop desk: rain stays behind wordmark and BEAT/LIVE plates — Live OFF', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('desk-title')).toHaveText('HUB / PREDICTIONS')
  await expect(page.getByTestId('desk-title')).not.toHaveText(/HUBEB|PREDICTTIONS|HUBPREDICTIONS/)
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.locator('.rain-col')).toHaveCount(0)
  await expect(page.getByTestId('bets-filter-all')).toHaveText('All')
  await expect(page.getByTestId('bets-filter-all')).not.toHaveText(/ALLLO/)
  await expect(page.getByTestId('bets-filter-btc')).toHaveText('BTC')
  await expect(page.getByTestId('bets-filter-btc')).not.toHaveText(/BTCC/)
  await expect(page.getByTestId('save-btc')).toHaveText('Save')
  await expect(page.getByTestId('contracts-label-btc')).toHaveText('Contracts')
  await expect(page.getByTestId('contracts-label-btc')).not.toHaveText(/CONTRACTY/)
  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    await expect(page.getByTestId(`beat-label-${id}`)).toHaveText('TO BEAT')
    await expect(page.getByTestId(`beat-label-${id}`)).not.toHaveText(/BEATET/)
    await expect(page.getByTestId(`live-cash-${id}`)).not.toBeChecked()
  }
  const iso = await page.evaluate(() => {
    const rain = document.querySelector('[data-testid="rain"]') as HTMLElement
    const rr = rain.getBoundingClientRect()
    const hit = (sel: string) => {
      const el = document.querySelector(sel) as HTMLElement
      const b = el.getBoundingClientRect()
      return !(b.right <= rr.left || b.left >= rr.right || b.bottom <= rr.top || b.top >= rr.bottom)
    }
    const opaque = (sel: string) => {
      const bg = getComputedStyle(document.querySelector(sel) as HTMLElement).backgroundColor
      return !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/i.test(bg)
    }
    return {
      rainHitsTitle: hit('[data-testid="desk-title"]'),
      rainHitsBeat: hit('[data-testid="beat-label-btc"]'),
      rainHitsLive: hit('[data-testid="live-plate-btc"]'),
      titlePlate: opaque('[data-testid="desk-title"]'),
      wordPlate: opaque('[data-testid="wordmark"]'),
      beatPlate: opaque('[data-testid="beat-btc"]'),
      livePlate: opaque('[data-testid="live-plate-btc"]'),
      rainBottom: rr.bottom,
      beatTop: (document.querySelector('[data-testid="beat-label-btc"]') as HTMLElement).getBoundingClientRect().top,
    }
  })
  expect(iso.rainHitsTitle).toBe(false)
  expect(iso.rainHitsBeat).toBe(false)
  expect(iso.rainHitsLive).toBe(false)
  expect(iso.titlePlate).toBe(true)
  expect(iso.wordPlate).toBe(true)
  expect(iso.beatPlate).toBe(true)
  expect(iso.livePlate).toBe(true)
  expect(iso.rainBottom).toBeLessThan(iso.beatTop)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/desk-desktop-isolated.png', fullPage: false })
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
})
