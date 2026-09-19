import { expect, type Page, test } from '@playwright/test'

async function waitHost(page: Page) {
  await expect(page.getByTestId('desk-head')).toHaveAttribute('data-host-ready', '1', { timeout: 20_000 })
}

async function allowLiveArm(page: Page) {
  await page.evaluate(() => {
    ;(window as Window & { __HUB_TEST_LIVE_ARM?: { ok: true } }).__HUB_TEST_LIVE_ARM = { ok: true }
  })
}

async function allowTapeLive(page: Page, ids: readonly string[] = ['btc', 'ng', 'cu']) {
  await page.evaluate((tapes) => {
    const w = window as Window & {
      __HUB_TEST_TAPE_QUOTE?: Record<string, { tradingActive: boolean; stale: boolean }>
    }
    w.__HUB_TEST_TAPE_QUOTE = Object.fromEntries(tapes.map((id) => [id, { tradingActive: true, stale: false }]))
  }, ids)
}

async function setToggle(page: Page, testId: string, on: boolean) {
  const box = page.getByTestId(testId)
  if ((await box.isChecked()) === on) return
  await page.locator('label').filter({ has: box }).click({ force: true })
  await expect(box).toBeChecked({ checked: on })
}

async function assertNoMasterLive(page: Page) {
  await expect(page.getByTestId('live-bets')).toHaveCount(0)
  await expect(page.getByTestId('live-banner')).toHaveCount(0)
  await expect(page.getByTestId('confirm-live')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('master Live OFF · paper only')
  await expect(page.getByTestId('desk-head')).not.toContainText('Live OFF')
  await expect(page.getByTestId('desk-head')).not.toContainText(/Kalshi keys/i)
  await expect(page.getByTestId('desk-head').getByRole('button')).toHaveCount(0)
  await expect(page.getByTestId('under-desk').getByTestId('settings-toggle')).toBeVisible()
  await expect(page.getByTestId('desk-head').getByTestId('settings-toggle')).toHaveCount(0)
}

async function assertHeaderClean(page: Page) {
  const title = page.getByTestId('desk-title')
  await expect(title).toHaveText('HUB Predictions')
  await expect(title).not.toHaveText(/HUB\s*\/\s*PREDICTIONS|HUBEB|PREDICTTIONS|HUBPREDICTIONS/)
  await expect(page.getByTestId('kalshi-link')).toHaveCount(0)
  const head = page.getByTestId('desk-head')
  await expect(head).not.toContainText(/Kalshi keys/i)
  await expect(head).not.toContainText(/keys on this PC/i)
  await expect(head).not.toContainText(/host keys missing/i)
  await expect(page.getByTestId('pnl-label')).toHaveText('P&L')
  await expect(page.getByTestId('ttl-label')).toHaveText('TTL 24H')
  await expect(page.getByTestId('kalshi-cash-label')).toHaveText('KALSHI CASH')
  const layout = await page.evaluate(() => {
    const headEl = document.querySelector('[data-testid="desk-head"]') as HTMLElement
    const titleEl = document.querySelector('[data-testid="desk-title"]') as HTMLElement
    const hr = headEl.getBoundingClientRect()
    const tr = titleEl.getBoundingClientRect()
    const labels = (['pnl', 'ttl', 'kalshi-cash'] as const).map((id) => {
      const lab = document.querySelector(`[data-testid="${id}-label"]`) as HTMLElement
      const val = document.querySelector(`[data-testid="${id}-value"]`) as HTMLElement
      const stat = document.querySelector(`[data-testid="${id}"]`) as HTMLElement
      return {
        id,
        text: (lab.textContent || '').trim(),
        fontSize: parseFloat(getComputedStyle(lab).fontSize),
        labelBottom: lab.getBoundingClientRect().bottom,
        valueTop: val.getBoundingClientRect().top,
        flexDir: getComputedStyle(stat).flexDirection,
      }
    })
    return {
      titleCenter: (tr.left + tr.right) / 2,
      headCenter: (hr.left + hr.right) / 2,
      titleColor: getComputedStyle(titleEl).color,
      labels,
    }
  })
  expect(Math.abs(layout.titleCenter - layout.headCenter)).toBeLessThan(24)
  expect(layout.titleColor).toMatch(/rgb\(\s*0\s*,\s*229\s*,\s*122\s*\)|#00e57a/i)
  for (const lab of layout.labels) {
    expect(lab.fontSize).toBeGreaterThanOrEqual(11)
    expect(lab.labelBottom).toBeLessThanOrEqual(lab.valueTop + 1)
    expect(lab.flexDir).toBe('column')
  }
  expect(layout.labels.map((l) => l.text)).toEqual(['P&L', 'TTL 24H', 'KALSHI CASH'])
}

async function assertCashColumnClear(page: Page) {
  const head = page.getByTestId('bets-cash-head')
  await expect(head).toBeVisible()
  await expect(head).toHaveText('CASH')
  const cell = page.getByTestId('bets-cash').first()
  await expect(cell).toBeVisible()
  const vis = await page.evaluate(() => {
    const wrap = document.querySelector('.bets-log-wrap') as HTMLElement
    const list = document.querySelector('[data-testid="bets-log"]') as HTMLElement
    const headEl = document.querySelector('[data-testid="bets-cash-head"]') as HTMLElement
    const cellEl = document.querySelector('[data-testid="bets-cash"]') as HTMLElement
    const wr = wrap.getBoundingClientRect()
    const hr = headEl.getBoundingClientRect()
    const cr = cellEl.getBoundingClientRect()
    const clientRight = wr.left + wrap.clientWidth
    return {
      headText: (headEl.textContent || '').trim(),
      cellText: (cellEl.textContent || '').trim(),
      headW: hr.width,
      cellW: cr.width,
      headRight: hr.right,
      cellRight: cr.right,
      clientRight,
      listOverflowX: getComputedStyle(list).overflowX,
      listOverflowY: getComputedStyle(list).overflowY,
      wrapBar: getComputedStyle(wrap).scrollbarWidth,
    }
  })
  expect(vis.headText).toBe('CASH')
  expect(vis.headW).toBeGreaterThan(28)
  expect(vis.cellW).toBeGreaterThan(28)
  expect(vis.headRight).toBeLessThanOrEqual(vis.clientRight + 1)
  expect(vis.cellRight).toBeLessThanOrEqual(vis.clientRight + 1)
  expect(vis.cellText.length).toBeGreaterThan(1)
  expect(vis.cellText).not.toMatch(/^\$\s*$/)
  expect(vis.listOverflowX).toBe('visible')
  expect(vis.listOverflowY).toBe('visible')
  expect(vis.wrapBar).toBe('thin')
}

async function resetGoldDesk(page: Page) {
  await waitHost(page)
  await page.evaluate(() => window.scrollTo(0, 0))
  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    if ((await page.getByTestId(`clock-${id}`).inputValue()) !== '15m') {
      await page.getByTestId(`clock-${id}`).selectOption('15m')
    }
    if (await page.getByTestId(`live-cash-${id}`).isEnabled()) {
      await setToggle(page, `live-cash-${id}`, false)
    }
    if (!(await page.getByTestId(`bot-${id}`).isChecked())) {
      await setToggle(page, `bot-${id}`, true)
    }
  }
  await assertNoMasterLive(page)
  await page.evaluate(() => window.scrollTo(0, 0))
}

test('phone desk: four tapes, settings persist, live/bots off', async ({ page }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('desk-title')).toHaveText('HUB Predictions')
  await resetGoldDesk(page)
  await assertHeaderClean(page)
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
  expect(plates.titleText).toBe('HUB Predictions')
  expect(plates.titleText).not.toMatch(/HUBEB|PREDICTTIONS|HUBPREDICTIONS|HUB\s*\/\s*PREDICTIONS/)
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
  await expect(page.getByTestId('save-btc')).toHaveCount(0)
  await expect(page.getByTestId('contracts-label-btc')).toHaveText('Contracts')
  await expect(page.getByTestId('contracts-label-btc')).not.toHaveText(/CONTRACTY/)
  const head = page.getByTestId('desk-head')
  const box = await head.boundingBox()
  expect(box?.y).toBeLessThanOrEqual(2)

  for (const id of ['btc', 'ng', 'cu', 'gld']) {
    await expect(page.getByTestId(`tape-${id}`)).toBeVisible()
    await expect(page.getByTestId(`status-${id}`)).toHaveText(/WAIT|UP|DOWN|WIN|LOSS/)
    await expect(page.getByTestId(`hit-${id}`)).toContainText(/Hit · 80% goal/)
    await expect(page.getByTestId(`wl-${id}`)).toContainText(/W–L|W-L|\d+W/)
    await expect(page.getByTestId(`bot-${id}`)).toBeChecked()
    await expect(page.getByTestId(`race-${id}`)).toBeVisible()
    await expect(page.getByTestId(`save-${id}`)).toHaveCount(0)
    await expect(page.getByTestId(`clock-${id}`)).toHaveValue('15m')
  }

  await expect(page.getByTestId('scoreboard')).toBeVisible()
  const boardCss = await page.getByTestId('scoreboard').evaluate((el) => {
    const s = getComputedStyle(el)
    return { display: s.display, cols: s.gridTemplateColumns, dir: s.flexDirection, wrap: s.flexWrap }
  })
  expect(boardCss.display).toBe('grid')
  expect(boardCss.cols.split(/\s+/).filter(Boolean).length).toBe(1)
  const pnlBox = await page.getByTestId('pnl').boundingBox()
  const ttlBox = await page.getByTestId('ttl').boundingBox()
  const cashBox = await page.getByTestId('kalshi-cash').boundingBox()
  expect(pnlBox && ttlBox && cashBox).toBeTruthy()
  expect((ttlBox?.y ?? 0)).toBeGreaterThan((pnlBox?.y ?? 0) + (pnlBox?.height ?? 0) - 4)
  expect((cashBox?.y ?? 0)).toBeGreaterThan((ttlBox?.y ?? 0) + (ttlBox?.height ?? 0) - 4)
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
  if ((await page.getByTestId('bets-filter-all').getAttribute('aria-pressed')) !== 'true') {
    await page.getByTestId('bets-filter-all').click({ force: true })
  }
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
  await page.getByTestId('bets-filter-btc').click({ force: true })
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('bets-filter-ng').click({ force: true })
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
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('bets-filter-all')).toBeVisible()
  await expect(page.getByTestId('bets-24h')).toHaveAttribute('data-filter', 'btc,ng')
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-ng')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await page.getByTestId('bets-filter-all').click({ force: true })
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')
  await assertNoMasterLive(page)
  await expect(page.getByTestId('bot-btc')).toBeChecked()
  await expect(page.getByTestId('live-cash-btc')).not.toBeChecked()
  await expect(page.getByTestId('analyst-toggle')).toBeVisible()
  await expect(page.getByTestId('finance-toggle')).toBeVisible()
  await expect(page.getByTestId('analyst')).toBeVisible()
  await expect(page.getByTestId('finance')).toHaveCount(0)
  await expect(page.getByTestId('desk-title')).not.toHaveText(/HUBPREDICTIONS/)

  const contractsBox = await page.getByTestId('contracts-btc').boundingBox()
  const botBox = await page.getByTestId('bot-btc').locator('xpath=ancestor::label[1]').boundingBox()
  expect((contractsBox?.height ?? 0)).toBeGreaterThanOrEqual(44)
  expect((botBox?.height ?? 0)).toBeGreaterThanOrEqual(48)

  const css = await page.evaluate(() => {
    const hrefs = [...document.querySelectorAll('link[rel="stylesheet"]')].map((el) => (el as HTMLLinkElement).href)
    return hrefs
  })
  expect(css.some((h) => h.includes('/hub-app.css') || h.includes('/desk.css'))).toBe(true)
  expect(css.some((h) => /\/assets\/index-.*\.css/.test(h))).toBe(false)

  const contractsOpen = await page.getByTestId('contracts-btc').isEnabled()
  if (contractsOpen) {
    await page.getByTestId('contracts-btc').fill('17')
    await page.getByTestId('contracts-btc').blur()
    await expect(page.getByTestId('contracts-btc')).toHaveValue('17')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitHost(page)
    await expect(page.getByTestId('contracts-btc')).toHaveValue('17')
  }
  await expect(page.getByTestId('tape-btc')).toBeVisible()
  await assertNoMasterLive(page)
  await page.getByTestId('clock-btc').selectOption('5m')
  await expect(page.getByTestId('clock-btc')).toHaveValue('5m')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('clock-btc')).toHaveValue('5m')
  await expect(page.getByTestId('clock-ng')).toHaveValue('15m')
  await assertNoMasterLive(page)
  await page.getByTestId('clock-btc').selectOption('15m')

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
            {
              betId: 'kalshi:KXBTC15M-HISTQA',
              tape: 'btc',
              ticker: 'KXBTC15M-HISTQA',
              clock: '15m',
              closeAt: ts - 86_400_000,
              side: 'down',
              count: 1,
              ask: 50,
              spent: 19.06,
              orderId: 'settled-KXBTC15M-HISTQA',
              status: 'settled',
              pnl: -19.06,
              filledAt: ts - 86_400_000,
              settledAt: ts - 86_400_000,
              kind: 'live',
            },
          ],
        }),
      )
    },
    [now],
  )

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  if ((await page.getByTestId('bets-filter-all').getAttribute('aria-pressed')) !== 'true') {
    await page.getByTestId('bets-filter-all').click()
  }

  await expect(page.getByTestId('bets-filter-all')).toBeVisible()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-placed')).toContainText(/\$/)
  await expect(page.getByTestId('bets-wl')).toContainText(/\d+W/)
  await expect(page.getByTestId('bets-pnl')).toContainText(/\$/)
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-all.png' })
  await expect(page.getByTestId('bets-log')).toContainText('PAPER')
  await assertNoMasterLive(page)
  const modes = await page.getByTestId('bets-mode').allInnerTexts()
  expect(modes.some((m) => /PAPER/i.test(m))).toBeTruthy()
  expect(modes.length === 0 || modes.every((m) => /LIVE/i.test(m))).toBe(false)
  await expect(page.getByTestId('bets-mode').first()).toBeVisible()
  await expect(page.getByTestId('bets-log')).toContainText(/Sep 18|HIST/)
  await expect(page.getByTestId('bets-log')).toContainText('CDT')
  await expect(page.getByTestId('bets-mode').first()).toHaveClass(/mode-live|mode-paper|mode-hist/)
  await expect(page.locator('.bets-log-head')).toContainText('WINDOW')
  await expect(page.locator('.bets-log-head')).toContainText('CLOCK')
  await expect(page.locator('.bets-log-head')).toContainText('MODE')
  await expect(page.locator('.bets-log-head')).toContainText('CASH')
  await expect(page.locator('.bets-log-scroll')).toBeVisible()
  await expect(page.locator('.bets-log-wrap')).toHaveCSS('overflow-x', 'hidden')
  await expect(page.getByTestId('bets-log')).toHaveCSS('overflow-x', 'visible')
  await assertCashColumnClear(page)
  if (await page.locator('[data-kind="live"]').count()) {
    await expect(page.locator('[data-kind="live"] [data-testid="bets-cash"]').first()).toContainText('$')
  }
  await expect(page.locator('[data-kind="paper"] [data-testid="bets-cash"]').first()).toHaveText(/N\/A|—/)
  if (await page.locator('[data-kind="hist"]').count()) {
    await expect(page.locator('[data-kind="hist"] [data-testid="bets-cash"]').first()).toHaveText(/N\/A|—/)
  }
  await page.getByTestId('bets-filter-btc').click()
  await expect(page.getByTestId('bets-filter-all')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-placed')).toBeVisible()
  await page.getByTestId('bets-filter-ng').click()
  await expect(page.getByTestId('bets-filter-btc')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-filter-ng')).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('bets-filter-all').click()
  await page.getByTestId('bets-filter-cu').click()
  await expect(page.getByTestId('bets-filter-cu')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('bets-log')).toContainText('PAPER')
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-bets-filter.png' })
  await assertNoMasterLive(page)
  await expect(page.locator('body')).not.toContainText('BITCOIN 15 MINUTE')
})

test('desktop desk: full bets log + analyst drafts, Accept gated', async ({ page }) => {
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
  await expect(page.getByTestId('bets-mode').first()).toHaveClass(/mode-live|mode-paper|mode-hist/)
  await expect(page.getByTestId('bets-log')).toContainText('PAPER')
  await expect(page.locator('.bets-log-head')).toContainText('CASH')
  await expect(page.locator('.bets-log-head')).toContainText('CLOCK')
  await expect(page.locator('.result-win, .result-loss').first()).toBeVisible()
  await assertCashColumnClear(page)
  await page.getByTestId('bets-24h').screenshot({ path: '/opt/cursor/artifacts/screenshots/desktop-bets-all.png' })
  await expect(page.getByTestId('analyst')).toBeVisible()
  await expect(page.getByTestId('analyst-lock')).toContainText(/proposes paper drafts only/)
  await expect(page.getByTestId('analyst-lock')).toContainText(/Soft FAIL Accept/)
  await expect(page.getByTestId('analyst-lock')).not.toContainText(/auto-apply/)
  await expect(page.getByTestId('analyst-accept-btc')).toHaveCount(0)
  await expect(page.locator('.rec-deny')).toHaveCount(0)
  await expect(page.getByTestId('analyst-auto-btc')).toBeVisible()
  await page.getByTestId('analyst').screenshot({ path: '/opt/cursor/artifacts/screenshots/desktop-analyst-drafts.png' })
  await assertNoMasterLive(page)
})

test('phone desk: MAXIMUM QC every tap — no master Live; Live cash OFF is paper', async ({ page }) => {
  const livePosts: string[] = []
  page.on('request', (req) => {
    if (req.method() === 'POST' && /external-api\.kalshi\.com.*\/events\/orders/i.test(req.url())) {
      livePosts.push(req.url())
    }
  })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await expect(page.getByTestId('desk-title')).toHaveText('HUB Predictions')
  await expect(page.getByTestId('pulse')).toHaveCount(0)
  await expect(page.locator('body')).not.toContainText('BITCOIN 15 MINUTE')
  await expect(page.getByTestId('bets-24h')).toBeVisible()
  await expect(page.getByTestId('save-btc')).toHaveCount(0)
  await assertNoMasterLive(page)
  await waitHost(page)
  await resetGoldDesk(page)
  await expect(page.getByTestId('bot-note-btc')).toContainText(/Live cash OFF — paper only|Kalshi window closed|Bot OFF/)
  await allowLiveArm(page)
  await setToggle(page, 'live-cash-btc', true)
  if (await page.getByTestId('stale-btc').count()) {
    await expect(page.getByTestId('bot-note-btc')).toContainText(
      /Live cash ON — next through|Sit —|Kalshi keys missing|Kalshi window closed|STALE/,
    )
  } else {
    await expect(page.getByTestId('bot-note-btc')).toContainText(/Live cash ON — next through|Sit —|Kalshi keys missing|Kalshi window closed/)
    await expect(page.getByTestId('bot-note-btc')).not.toContainText('Live cash OFF — paper only')
  }
  await setToggle(page, 'live-cash-btc', false)
  await expect(page.getByTestId('bot-note-btc')).toContainText(/Live cash OFF — paper only|Kalshi window closed|Bot OFF/)
  await assertNoMasterLive(page)

  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings')).toBeVisible()
  await expect(page.getByTestId('arm-from-btc')).toHaveValue('12')
  await expect(page.getByTestId('through-btc')).toHaveValue(/^(15|17)$/)
  await expect(page.getByTestId('cent-lo-btc')).toHaveValue('45')
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

  if (await page.getByTestId('contracts-btc').isEnabled()) {
    await page.getByTestId('contracts-btc').fill('21')
    await page.getByTestId('contracts-btc').blur()
    await expect(page.getByTestId('contracts-btc')).toHaveValue('21')
    await page.getByTestId('contracts-ng').fill('8')
    await page.getByTestId('contracts-ng').press('Enter')
    await expect(page.getByTestId('contracts-ng')).toHaveValue('8')
    await page.getByTestId('contracts-cu').fill('5')
    await page.getByTestId('contracts-cu').blur()
    await expect(page.getByTestId('contracts-cu')).toHaveValue('5')
    await page.getByTestId('contracts-gld').fill('3')
    await page.getByTestId('contracts-gld').press('Enter')
    await expect(page.getByTestId('contracts-gld')).toHaveValue('3')
  }

  await expect(page.getByTestId('analyst')).toBeVisible()
  await expect(page.getByTestId('analyst-report-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-expert-btc')).toContainText(/BTC desk chief/)
  await expect(page.getByTestId('analyst-rules-btc')).toContainText(/Current rules/)
  await expect(page.getByTestId('analyst-proposed-btc')).toContainText(/Proposed/)
  await expect(page.getByTestId('analyst-profit-btc')).toContainText(/Profit dollars/)
  await expect(page.getByTestId('analyst-lock')).toContainText(/proposes paper drafts only/)
  await expect(page.getByTestId('analyst-lock')).toContainText(/Soft FAIL Accept/)
  await expect(page.getByTestId('analyst-accept-btc')).toHaveCount(0)
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
  await expect(page.getByTestId('analyst-hour-btc')).toBeVisible()
  await expect(page.getByTestId('analyst-clock-prior-btc')).toBeVisible()
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

  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitHost(page)
  if (await page.getByTestId('contracts-btc').isEnabled()) {
    await expect(page.getByTestId('contracts-btc')).toHaveValue('21')
    await expect(page.getByTestId('contracts-ng')).toHaveValue('8')
    await expect(page.getByTestId('contracts-cu')).toHaveValue('5')
    await expect(page.getByTestId('contracts-gld')).toHaveValue('3')
  }
  await assertNoMasterLive(page)
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
  await assertNoMasterLive(page)
  await waitHost(page)
  await resetGoldDesk(page)
  await expect(page.getByTestId('desk-title')).toHaveText('HUB Predictions')
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
  await expect(page.getByTestId('desk-title')).toHaveText('HUB Predictions')
  await expect(page.getByTestId('desk-title')).not.toHaveText(/HUBEB|PREDICTTIONS|HUBPREDICTIONS/)
  await assertHeaderClean(page)
  await assertNoMasterLive(page)
  await expect(page.locator('.rain-col')).toHaveCount(0)
  await expect(page.getByTestId('bets-filter-all')).toHaveText('All')
  await expect(page.getByTestId('bets-filter-all')).not.toHaveText(/ALLLO/)
  await expect(page.getByTestId('bets-filter-btc')).toHaveText('BTC')
  await expect(page.getByTestId('bets-filter-btc')).not.toHaveText(/BTCC/)
  await expect(page.getByTestId('save-btc')).toHaveCount(0)
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
  await assertNoMasterLive(page)
})

test('hit goal is 80% — Soft FAIL leftover 83%', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('ttl-value')).toContainText(/80% goal|<80%/)
  await expect(page.getByTestId('ttl-value')).not.toContainText('83% goal')
  await expect(page.getByTestId('desk')).not.toContainText('83% goal')
  await expect(page.locator('.hud-label', { hasText: 'Analyst' })).toContainText('80%')
  await expect(page.locator('.hud-label', { hasText: 'Analyst' })).not.toContainText('83%')
  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('settings')).toContainText(/toward 80%/)
  await expect(page.getByTestId('settings')).not.toContainText('83%')
  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    await expect(page.getByTestId(`hit-${id}`)).toContainText(/Hit · 80% goal/)
    await expect(page.getByTestId(`hit-${id}`)).not.toContainText('83% goal')
    await expect(page.getByTestId(`analyst-${id}`)).toContainText(/80%/)
    await expect(page.getByTestId(`analyst-${id}`)).not.toContainText('83% goal')
  }
})

test('header: HUB Predictions centered, no keys chrome, readable labels — 390', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await assertHeaderClean(page)
  const stacked = await page.evaluate(() => {
    const pnl = (document.querySelector('[data-testid="pnl"]') as HTMLElement).getBoundingClientRect()
    const ttl = (document.querySelector('[data-testid="ttl"]') as HTMLElement).getBoundingClientRect()
    const cash = (document.querySelector('[data-testid="kalshi-cash"]') as HTMLElement).getBoundingClientRect()
    return { pnlTop: pnl.top, ttlTop: ttl.top, cashTop: cash.top }
  })
  expect(stacked.ttlTop).toBeGreaterThan(stacked.pnlTop + 8)
  expect(stacked.cashTop).toBeGreaterThan(stacked.ttlTop + 8)
})

test('header: HUB Predictions centered, no keys chrome, readable labels — desktop', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await assertHeaderClean(page)
  const row = await page.evaluate(() => {
    const pnl = (document.querySelector('[data-testid="pnl"]') as HTMLElement).getBoundingClientRect()
    const ttl = (document.querySelector('[data-testid="ttl"]') as HTMLElement).getBoundingClientRect()
    const cash = (document.querySelector('[data-testid="kalshi-cash"]') as HTMLElement).getBoundingClientRect()
    return {
      pnlLeft: pnl.left,
      ttlLeft: ttl.left,
      cashLeft: cash.left,
      pnlTop: pnl.top,
      ttlTop: ttl.top,
      cashTop: cash.top,
    }
  })
  expect(row.ttlLeft).toBeGreaterThan(row.pnlLeft + 40)
  expect(row.cashLeft).toBeGreaterThan(row.ttlLeft + 40)
  expect(Math.abs(row.ttlTop - row.pnlTop)).toBeLessThan(8)
  expect(Math.abs(row.cashTop - row.pnlTop)).toBeLessThan(8)
})

test('analyst proposes drafts only — Accept gated, no auto Live rewrite', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('analyst-lock')).toContainText(/proposes paper drafts only/)
  await expect(page.getByTestId('analyst-lock')).toContainText(/Soft FAIL Accept/)
  await expect(page.getByTestId('analyst-lock')).not.toContainText(/Auto-applying|auto-updated|retune automatically/)
  await expect(page.getByTestId('analyst-accept-btc')).toHaveCount(0)
  await expect(page.getByTestId('analyst-accept-ng')).toHaveCount(0)
  await expect(page.locator('.rec-deny')).toHaveCount(0)
  await page.getByTestId('settings-toggle').click()
  await expect(page.getByTestId('through-btc')).toHaveValue(/^(15|17)$/)
})

test('Live cash ON toggle runs liveArmGate — Soft FAIL enable if !ok', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await resetGoldDesk(page)
  await expect(page.getByTestId('live-cash-btc')).not.toBeChecked()
  await page.evaluate(() => {
    ;(window as Window & { __HUB_TEST_LIVE_ARM?: { ok: false; reason: string } }).__HUB_TEST_LIVE_ARM = {
      ok: false,
      reason: 'LIVE needs keys',
    }
  })
  await page.locator('label').filter({ has: page.getByTestId('live-cash-btc') }).click({ force: true })
  await expect(page.getByTestId('live-cash-btc')).not.toBeChecked()
  await expect(page.getByTestId('desk-msg')).toContainText(/LIVE needs keys/)
  await allowLiveArm(page)
  await setToggle(page, 'live-cash-btc', true)
  await expect(page.getByTestId('live-cash-btc')).toBeChecked()
  await setToggle(page, 'live-cash-btc', false)
})

test('Live send skips ask ≥80 unlocked', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  const gate = await page.evaluate(() => {
    const api = (
      window as Window & {
        __HUB_LIVE_ASK?: {
          askAllowedByGold: (tape: string, ask: number, opts?: { locked?: boolean }) => boolean
          liveSendGate: (
            state: { killed: boolean; paperStartedAt: number; bets: unknown[] },
            opts: { tape: string; ticker: string; ask: number; cash: number; deposits: number; spent: number; locked?: boolean },
          ) => { ok: true } | { ok: false; reason: string }
          emptyFinance: () => { killed: boolean; paperStartedAt: number; bets: unknown[] }
          ASK_CAP: number
        }
      }
    ).__HUB_LIVE_ASK
    if (!api) return null
    const book = api.emptyFinance()
    return {
      cap: api.ASK_CAP,
      unlocked79: api.askAllowedByGold('btc', 79),
      unlocked80: api.askAllowedByGold('btc', 80),
      unlocked82: api.askAllowedByGold('btc', 82),
      locked82: api.askAllowedByGold('btc', 82, { locked: true }),
      ng80: api.askAllowedByGold('ng', 80),
      cu80: api.askAllowedByGold('cu', 80),
      gld80: api.askAllowedByGold('gld', 80),
      send82: api.liveSendGate(book, {
        tape: 'btc',
        ticker: 'KXBTC15M-ASK80',
        ask: 82,
        cash: 400,
        deposits: 760,
        spent: 0.82,
      }),
      send79: api.liveSendGate(book, {
        tape: 'btc',
        ticker: 'KXBTC15M-ASK79',
        ask: 79,
        cash: 400,
        deposits: 760,
        spent: 0.79,
      }),
    }
  })
  expect(gate).toBeTruthy()
  expect(gate?.cap).toBe(80)
  expect(gate?.unlocked79).toBe(true)
  expect(gate?.unlocked80).toBe(false)
  expect(gate?.unlocked82).toBe(false)
  expect(gate?.locked82).toBe(true)
  expect(gate?.ng80).toBe(false)
  expect(gate?.cu80).toBe(false)
  expect(gate?.gld80).toBe(false)
  expect(gate?.send82.ok).toBe(false)
  if (gate && !gate.send82.ok) expect(gate.send82.reason).toMatch(/skip/)
  expect(gate?.unlocked79).toBe(true)
  expect(gate?.send79.ok).toBe(false)
  if (gate && !gate.send79.ok) expect(gate.send79.reason).toMatch(/EV/)
})

test('Live cash ON survives reload; no master Live switch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await resetGoldDesk(page)
  await assertNoMasterLive(page)
  await allowLiveArm(page)
  await allowTapeLive(page)
  await setToggle(page, 'live-cash-btc', true)
  await setToggle(page, 'live-cash-ng', true)
  await setToggle(page, 'live-cash-cu', true)
  await page.getByTestId('clock-btc').selectOption('5m')
  await expect(page.getByTestId('live-cash-btc')).toBeChecked()
  await expect(page.getByTestId('live-cash-ng')).toBeChecked()
  await expect(page.getByTestId('live-cash-cu')).toBeChecked()
  await assertNoMasterLive(page)
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const raw = localStorage.getItem('hub.desk.settings.v1')
        if (!raw) return false
        const s = JSON.parse(raw) as {
          tapes?: { btc?: { liveOn?: boolean }; ng?: { liveOn?: boolean }; cu?: { liveOn?: boolean } }
          clocks?: { btc?: string }
        }
        return (
          s.tapes?.btc?.liveOn === true &&
          s.tapes?.ng?.liveOn === true &&
          s.tapes?.cu?.liveOn === true &&
          s.clocks?.btc === '5m'
        )
      }),
    )
    .toBe(true)
  await page.waitForTimeout(400)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('live-cash-btc')).toBeChecked({ timeout: 15_000 })
  await expect(page.getByTestId('live-cash-ng')).toBeChecked()
  await expect(page.getByTestId('live-cash-cu')).toBeChecked()
  await expect(page.getByTestId('clock-btc')).toHaveValue('5m')
  await assertNoMasterLive(page)
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('live-cash-btc')).toBeChecked({ timeout: 15_000 })
  await expect(page.getByTestId('live-cash-ng')).toBeChecked()
  await expect(page.getByTestId('live-cash-cu')).toBeChecked()
  await expect(page.getByTestId('clock-btc')).toHaveValue('5m')
  await assertNoMasterLive(page)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/live-cash-persist.png', clip: { x: 0, y: 0, width: 390, height: 844 } })
  await setToggle(page, 'live-cash-btc', false)
  await setToggle(page, 'live-cash-ng', false)
  await setToggle(page, 'live-cash-cu', false)
  await page.getByTestId('clock-btc').selectOption('15m')
  await expect(page.getByTestId('live-cash-btc')).not.toBeChecked()
  await assertNoMasterLive(page)
})

async function sampleLivePaint(page: Page) {
  const tapes = ['btc', 'ng', 'cu', 'gld'] as const
  const rows: string[] = []
  for (const id of tapes) {
    rows.push(
      [
        (await page.getByTestId(`beat-value-${id}`).innerText()).trim(),
        (await page.getByTestId(`live-${id}`).innerText()).trim(),
        (await page.getByTestId(`ask-${id}`).innerText()).trim(),
      ].join('|'),
    )
  }
  rows.push((await page.getByTestId('close-clock').first().innerText()).trim())
  return rows.join('||')
}

function paintLooksFull(sample: string) {
  return !/--:--/.test(sample) && /\$|¢|\d/.test(sample) && !/NOW\s*$|TO BEAT\s*$/.test(sample)
}

test('live numbers stay painted without empty glitch frames', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('desk-head')).toHaveAttribute('data-host-ready', '1', { timeout: 20_000 })
  await expect(page.getByTestId('live-btc')).toBeVisible()
  const samples: string[] = []
  const started = Date.now()
  while (Date.now() - started < 30_000) {
    samples.push(await sampleLivePaint(page))
    await page.waitForTimeout(1000)
  }
  expect(samples.length).toBeGreaterThanOrEqual(28)
  expect(samples.every((s) => paintLooksFull(s))).toBeTruthy()
  expect(samples.some((s) => /\$|¢|\d/.test(s))).toBeTruthy()
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-live-numbers.png', clip: { x: 0, y: 0, width: 390, height: 520 } })
  await assertNoMasterLive(page)
})

test('desktop live paint stays full for 30s — no empty NOW/ask/timer', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('desk-head')).toHaveAttribute('data-host-ready', '1', { timeout: 20_000 })
  await expect(page.getByTestId('live-btc')).toBeVisible()
  const samples: string[] = []
  const started = Date.now()
  while (Date.now() - started < 30_000) {
    samples.push(await sampleLivePaint(page))
    await page.waitForTimeout(1000)
  }
  expect(samples.every((s) => paintLooksFull(s))).toBeTruthy()
  await expect
    .poll(async () => page.locator('[data-testid="race-btc"] .race-path').count(), { timeout: 15_000 })
    .toBeGreaterThan(0)
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/desktop-live-numbers.png', fullPage: false })
  await assertNoMasterLive(page)
})

test('LIVE chart has a continuous series, not one NOW dot', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('race-btc')).toBeVisible()
  await expect
    .poll(async () => {
      return page.locator('[data-testid="race-btc"] .race-path').count()
    }, { timeout: 20_000 })
    .toBeGreaterThan(0)
  const d = await page.locator('[data-testid="race-btc"] .race-path').getAttribute('d')
  const commands = (d || '').match(/[CLc]/g) ?? []
  expect((d || '').length).toBeGreaterThan(40)
  expect(commands.length).toBeGreaterThan(1)
  await page.locator('[data-testid="race-btc"]').screenshot({ path: '/opt/cursor/artifacts/screenshots/btc-live-chart.png' })
  await assertNoMasterLive(page)
})

test('all four tapes stay Kalshi-smooth — multi-Hz NOW, continuous path, no empty snap', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await expect(page.getByTestId('desk')).toHaveAttribute('data-desk-tick', '100')
  await expect(page.getByTestId('desk')).toHaveAttribute('data-print-ms', '100')
  const ids = ['btc', 'ng', 'cu', 'gld'] as const
  for (const id of ids) {
    await expect(page.getByTestId(`live-${id}`)).toBeVisible()
    await expect
      .poll(async () => page.locator(`[data-testid="race-${id}"] .race-path`).count(), { timeout: 20_000 })
      .toBeGreaterThan(0)
  }
  const samples: string[] = []
  for (let i = 0; i < 8; i++) {
    const row: string[] = []
    for (const id of ids) {
      row.push((await page.getByTestId(`live-${id}`).innerText()).trim())
      row.push((await page.getByTestId(`beat-value-${id}`).innerText()).trim())
      row.push((await page.getByTestId(`ask-${id}`).innerText()).trim())
    }
    samples.push(row.join('|'))
    await page.waitForTimeout(100)
  }
  expect(samples.length).toBe(8)
  for (const s of samples) {
    expect(s).toMatch(/\$|¢|\d/)
    expect(s).not.toMatch(/NOW\s*$|TO BEAT\s*$/)
    expect(s.split('|').filter((_, i) => i % 3 === 0).some((v) => /\$|\d/.test(v))).toBeTruthy()
  }
  const hz = await page.evaluate(async () => {
    const tapeIds = ['btc', 'ng', 'cu', 'gld'] as const
    const bags = Object.fromEntries(
      tapeIds.map((id) => [id, { paths: new Set<string>(), empty: 0 }]),
    ) as Record<(typeof tapeIds)[number], { paths: Set<string>; empty: number }>
    const start = performance.now()
    while (performance.now() - start < 1200) {
      for (const id of tapeIds) {
        const d = document.querySelector(`[data-testid="race-${id}"] .race-path`)?.getAttribute('d') || ''
        if (!d || d.length < 20) bags[id].empty += 1
        else bags[id].paths.add(d)
      }
      await new Promise((r) => setTimeout(r, 50))
    }
    return Object.fromEntries(
      tapeIds.map((id) => [id, { pathChanges: bags[id].paths.size, empty: bags[id].empty }]),
    ) as Record<(typeof tapeIds)[number], { pathChanges: number; empty: number }>
  })
  for (const id of ids) {
    expect(hz[id].empty, `${id} empty path frames`).toBe(0)
    expect(hz[id].pathChanges, `${id} path Hz`).toBeGreaterThanOrEqual(4)
    const d = await page.locator(`[data-testid="race-${id}"] .race-path`).getAttribute('d')
    const commands = (d || '').match(/[CLc]/g) ?? []
    expect((d || '').length).toBeGreaterThan(40)
    expect(commands.length).toBeGreaterThan(1)
  }
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/four-tape-kalshi-smooth.png', fullPage: false })
  await assertNoMasterLive(page)
})

test('phone desk: paper deskfill shows in BETS as MODE PAPER / CASH N/A — no master Live', async ({ page }) => {
  const now = Date.now()
  await page.addInitScript(
    ([ts]) => {
      localStorage.setItem(
        'hub.desk.tickets.v1',
        JSON.stringify([
          {
            tape: 'cu',
            ticker: 'KXCOPPER15M-PAPERQA',
            side: 'down',
            orderId: 'deskfill-cu-f8bmwqhq',
            contracts: 1,
            beat: 6.7,
            filledAt: ts,
          },
        ]),
      )
      localStorage.setItem(
        'hub.desk.finance.v1',
        JSON.stringify({
          killed: false,
          paperStartedAt: ts,
          bets: [
            {
              betId: 'kalshi:KXCOPPER15M-HISTOPEN',
              tape: 'cu',
              ticker: 'KXCOPPER15M-PAPERQA',
              clock: '15m',
              closeAt: ts + 60_000,
              side: 'up',
              count: 1,
              ask: 50,
              spent: 19,
              orderId: 'pos-cu-hist-open',
              status: 'open',
              pnl: null,
              filledAt: ts - 1000,
              settledAt: null,
              kind: 'hist',
            },
          ],
        }),
      )
    },
    [now],
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  if ((await page.getByTestId('bets-filter-all').getAttribute('aria-pressed')) !== 'true') {
    await page.getByTestId('bets-filter-all').click()
  }
  await expect(page.locator('[data-order-id="deskfill-cu-f8bmwqhq"]')).toHaveCount(0)
  await expect(page.locator('[data-order-id^="deskfill-"]')).toHaveCount(0)
  await expect(page.locator('[data-order-id^="deskfill-"] [data-testid="bets-mode"]', { hasText: 'LIVE' })).toHaveCount(0)
  await assertNoMasterLive(page)
  await assertCashColumnClear(page)
})

test('any tape Live cash HALT is orange, not grey', async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now()
    localStorage.setItem(
      'hub.desk.analyst.rehab.v1',
      JSON.stringify({
        tapes: {
          btc: { id: 'btc', status: 'paper', haltedAt: now, liveWasOn: true, paperTarget: 12, fromMs: now, token: 't' },
          cu: { id: 'cu', status: 'paper', haltedAt: now, liveWasOn: true, paperTarget: 12, fromMs: now, token: 't' },
        },
      }),
    )
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  for (const id of ['btc', 'cu'] as const) {
    const box = page.getByTestId(`live-cash-box-${id}`)
    await expect(box).toHaveAttribute('data-halt', '1')
    await expect(box).toContainText('HALT')
    const paint = await box.evaluate((el) => {
      const s = getComputedStyle(el)
      return { color: s.color, border: s.borderTopColor, bg: s.backgroundColor, opacity: s.opacity }
    })
    expect(paint.opacity).toBe('1')
    expect(paint.color).toMatch(/rgb\(\s*255,\s*138,\s*61\s*\)/i)
    expect(paint.border).toMatch(/rgb\(\s*255,\s*138,\s*61\s*\)/i)
    expect(paint.bg).not.toMatch(/rgb\(\s*(12,\s*17,\s*16|0,\s*0,\s*0)\s*\)/)
    await box.screenshot({ path: `/opt/cursor/artifacts/screenshots/halt-orange-${id}.png` })
  }
  await assertNoMasterLive(page)
})

test('LIVE clock settle flips OPEN to WIN and walks cash without reload', async ({ page }) => {
  const now = Date.now()
  const startUrl = 'http://127.0.0.1:8080/'
  await page.addInitScript(
    ([ts]) => {
      localStorage.setItem(
        'hub.desk.cash.v1',
        JSON.stringify({ cash: 500, deposits: 500, pnl: 0, firstDepositAt: ts - 86_400_000, asOf: ts }),
      )
      localStorage.setItem(
        'hub.desk.finance.v1',
        JSON.stringify({
          killed: false,
          paperStartedAt: ts,
          bets: [
            {
              betId: 'bet_ord-btc-settle-01',
              tape: 'btc',
              ticker: 'KXBTC15M-SETTLEQA',
              clock: '15m',
              closeAt: ts - 2000,
              side: 'up',
              count: 1,
              ask: 72,
              spent: 0.72,
              orderId: 'ord-btc-settle-01',
              status: 'open',
              pnl: null,
              filledAt: ts - 60_000,
              settledAt: null,
              kind: 'live',
            },
          ],
        }),
      )
      ;(window as Window & { __HUB_CLOCK_SETTLE?: unknown }).__HUB_CLOCK_SETTLE = {
        cash: 500.28,
        deposits: 500,
        tickers: ['KXBTC15M-SETTLEQA'],
        settlements: {
          settlements: [
            {
              ticker: 'KXBTC15M-SETTLEQA',
              market_result: 'yes',
              yes_count_fp: '1',
              no_count_fp: '0',
              yes_total_cost_dollars: 0.72,
              revenue_dollars: 1,
              settled_time: new Date(ts).toISOString(),
            },
          ],
        },
        markets: [{ ticker: 'KXBTC15M-SETTLEQA', result: 'yes' }],
        fetchedAt: ts,
        hostCreds: true,
      }
    },
    [now],
  )
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  if ((await page.getByTestId('bets-filter-all').getAttribute('aria-pressed')) !== 'true') {
    await page.getByTestId('bets-filter-all').click()
  }
  const row = page.locator('[data-order-id="ord-btc-settle-01"]')
  await expect(row).toHaveCount(1)
  await expect(row.getByTestId('bets-result')).toHaveText('WIN')
  await expect(row.getByTestId('bets-row-pnl')).toHaveText(/\+\$0\.28/)
  await expect(row.getByTestId('bets-cash')).toHaveText(/\$500\.28/)
  await expect(row.getByTestId('bets-mode')).toHaveText('LIVE')
  await expect(page.getByTestId('kalshi-cash')).toContainText('$500.28')
  expect(page.url().replace(/\/$/, '')).toBe(startUrl.replace(/\/$/, ''))
  await assertNoMasterLive(page)
})

test('phone 390: ticket line is contracts + ¢ + cost + win, not a 36-char uuid', async ({ page }) => {
  const now = Date.now()
  const uuid = '01a0b74f-e288-7687-8399-a6f10015a68a'
  await page.addInitScript(
    ([ts, orderId]) => {
      const tickets = (['btc', 'ng', 'cu', 'gld'] as const).map((tape, i) => ({
        tape,
        ticker: `KX${tape.toUpperCase()}15M-STRIP`,
        side: i === 0 ? 'down' : 'up',
        orderId: tape === 'btc' ? orderId : `ord-${tape}-fill-strip01`,
        contracts: 1,
        beat: 1,
        filledAt: ts,
        ask: tape === 'btc' ? 98 : 70,
      }))
      localStorage.setItem('hub.desk.tickets.v1', JSON.stringify(tickets))
    },
    [now, uuid],
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await page.evaluate(
    ([ts, orderId]) => {
      const tickets = (['btc', 'ng', 'cu', 'gld'] as const).map((tape, i) => {
        const ticker =
          document.querySelector(`[data-testid="tape-${tape}"]`)?.getAttribute('data-ticker') ||
          `KX${tape.toUpperCase()}15M-STRIP`
        return {
          tape,
          ticker,
          side: i === 0 ? 'down' : 'up',
          orderId: tape === 'btc' ? orderId : `ord-${tape}-fill-strip01`,
          contracts: 1,
          beat: 1,
          filledAt: ts,
          ask: tape === 'btc' ? 98 : 70,
        }
      })
      localStorage.setItem('hub.desk.tickets.v1', JSON.stringify(tickets))
    },
    [now, uuid],
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitHost(page)
  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    const line = page.getByTestId(`ticket-${id}`)
    await expect(line).toBeVisible()
    await expect(page.getByTestId(`hours-${id}`)).toContainText(/Hours/)
    const text = (await line.innerText()).replace(/\s+/g, ' ')
    expect(text).toMatch(/contract/)
    expect(text).toMatch(/¢/)
    expect(text).toMatch(/cost \$/)
    expect(text).toMatch(/win \$/)
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    expect(text).not.toContain(uuid)
  }
  const btc = (await page.getByTestId('ticket-btc').innerText()).replace(/\s+/g, ' ')
  if (btc.includes('98¢')) {
    expect(btc).toContain('DOWN · 1 contract · 98¢ · cost $0.98 · win $0.02')
  } else {
    expect(btc).toMatch(/· \d+ contracts? · \d+¢ · cost \$\d+\.\d{2} · win \$\d+\.\d{2}/)
  }
  await expect(page.getByTestId('ticket-id-btc')).toHaveText(/LIVE|PAPER/)
  await assertNoMasterLive(page)
})

test('phone 390: TO BEAT and NOW are not same-line; tape cards do not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  const boardCss = await page.getByTestId('scoreboard').evaluate((el) => getComputedStyle(el).gridTemplateColumns)
  expect(boardCss.split(/\s+/).filter(Boolean).length).toBe(1)
  const pnlBox = await page.getByTestId('pnl').boundingBox()
  const ttlBox = await page.getByTestId('ttl').boundingBox()
  const cashBox = await page.getByTestId('kalshi-cash').boundingBox()
  expect((ttlBox?.y ?? 0)).toBeGreaterThan((pnlBox?.y ?? 0) + (pnlBox?.height ?? 0) - 4)
  expect((cashBox?.y ?? 0)).toBeGreaterThan((ttlBox?.y ?? 0) + (ttlBox?.height ?? 0) - 4)
  for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
    const tape = page.getByTestId(`tape-${id}`)
    await expect(tape).toBeVisible()
    const hit = await page.evaluate((tapeId) => {
      const card = document.querySelector(`[data-testid="tape-${tapeId}"]`) as HTMLElement
      const beat = document.querySelector(`[data-testid="beat-${tapeId}"]`) as HTMLElement
      const nowEl = document.querySelector(`[data-testid="live-plate-${tapeId}"]`) as HTMLElement
      const beatR = beat.getBoundingClientRect()
      const nowR = nowEl.getBoundingClientRect()
      const overlap = !(nowR.right <= beatR.left + 2 || nowR.left >= beatR.right - 2 || nowR.bottom <= beatR.top + 2 || nowR.top >= beatR.bottom - 2)
      const sameLine = Math.abs(nowR.top - beatR.top) < 8 && nowR.left < beatR.right - 4 && beatR.left < nowR.right - 4
      return {
        overflow: card.scrollWidth - card.clientWidth,
        nowBelow: nowR.top > beatR.bottom - 4,
        nowClearRight: nowR.left > beatR.right - 2,
        overlap,
        sameLine,
        clock: (document.querySelector(`[data-testid="close-clock-${tapeId}"]`) as HTMLElement | null)?.textContent || '',
        kind: (document.querySelector(`[data-testid="close-clock-${tapeId}"]`) as HTMLElement | null)?.getAttribute('data-clock-kind') || '',
        liveFlag: Boolean(card.querySelector('.tape-live-flag')),
        staleFlag: Boolean(card.querySelector(`[data-testid="stale-${tapeId}"]`)),
      }
    }, id)
    expect(hit.sameLine).toBe(false)
    expect(hit.overlap).toBe(false)
    expect(hit.nowBelow || hit.nowClearRight).toBe(true)
    expect(hit.overflow).toBeLessThanOrEqual(1)
    expect(hit.clock).not.toMatch(/\d{3,}:/)
    if (hit.liveFlag && !hit.staleFlag) {
      expect(hit.kind).toBe('live')
      expect(hit.clock).not.toMatch(/CLOSED/)
      expect(hit.clock.trim()).toMatch(/^(\d{1,2}:\d{2}|--:--)$/)
    }
    if (hit.kind === 'closed') expect(hit.clock).toMatch(/CLOSED/)
    if (hit.kind === 'live') expect(hit.clock.trim()).toMatch(/^(\d{1,2}:\d{2}|--:--)$/)
    await expect(page.getByTestId(`beat-label-${id}`)).toHaveText('TO BEAT')
    await expect(page.getByTestId(`hours-${id}`)).toContainText(/Hours/)
  }
  await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/phone-390-tape-stack.png', fullPage: false })
  await assertNoMasterLive(page)
})

test('two browsers share host contracts — A saves, B hydrates the same number', async ({ browser }) => {
  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const pageA = await pc.newPage()
  const pageB = await phone.newPage()
  try {
    await pageA.goto('/', { waitUntil: 'domcontentloaded' })
    await pageB.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(pageA)
    await waitHost(pageB)
    await expect(pageA.getByTestId('desk')).toHaveAttribute('data-settings-latch', '1000')
    if (!(await pageA.getByTestId('contracts-btc').isEnabled())) return
    await pageA.getByTestId('contracts-btc').fill('23')
    await pageA.getByTestId('contracts-btc').blur()
    await expect(pageA.getByTestId('contracts-btc')).toHaveValue('23')
    await expect(pageB.getByTestId('contracts-btc')).toHaveValue('23', { timeout: 12_000 })
    await pageB.getByTestId('contracts-ng').fill('11')
    await pageB.getByTestId('contracts-ng').press('Enter')
    await expect(pageB.getByTestId('contracts-ng')).toHaveValue('11')
    await expect(pageA.getByTestId('contracts-ng')).toHaveValue('11', { timeout: 12_000 })
    await pageA.getByTestId('contracts-btc').fill('1')
    await pageA.getByTestId('contracts-btc').blur()
    await pageB.getByTestId('contracts-ng').fill('1')
    await pageB.getByTestId('contracts-ng').blur()
  } finally {
    await pageA.close()
    await pageB.close()
    await pc.close()
    await phone.close()
  }
})

test('desktop + 390: Live cash and contracts survive reload and a second client', async ({ browser }) => {
  test.setTimeout(90_000)
  const pc = await browser.newContext({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false })
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const desk = await pc.newPage()
  const hand = await phone.newPage()
  try {
    await desk.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(desk)
    await resetGoldDesk(desk)
    await allowLiveArm(desk)
    await allowTapeLive(desk)
    await setToggle(desk, 'live-cash-btc', true)
    await setToggle(desk, 'live-cash-ng', true)
    await setToggle(desk, 'live-cash-cu', true)
    if (await desk.getByTestId('contracts-btc').isEnabled()) {
      await desk.getByTestId('contracts-btc').fill('17')
      await desk.getByTestId('contracts-btc').blur()
      await expect(desk.getByTestId('contracts-btc')).toHaveValue('17')
    }
    await expect(desk.getByTestId('live-cash-btc')).toBeChecked()
    await desk.reload({ waitUntil: 'domcontentloaded' })
    await waitHost(desk)
    await expect(desk.getByTestId('live-cash-btc')).toBeChecked({ timeout: 15_000 })
    await expect(desk.getByTestId('live-cash-ng')).toBeChecked()
    await expect(desk.getByTestId('live-cash-cu')).toBeChecked()
    if (await desk.getByTestId('contracts-btc').isEnabled()) {
      await expect(desk.getByTestId('contracts-btc')).toHaveValue('17')
    }
    await hand.goto('/', { waitUntil: 'domcontentloaded' })
    await waitHost(hand)
    await expect(hand.getByTestId('live-cash-btc')).toBeChecked({ timeout: 15_000 })
    await expect(hand.getByTestId('live-cash-ng')).toBeChecked()
    await expect(hand.getByTestId('live-cash-cu')).toBeChecked()
    if (await hand.getByTestId('contracts-btc').isEnabled()) {
      await expect(hand.getByTestId('contracts-btc')).toHaveValue('17')
    }
    await hand.evaluate(() => localStorage.clear())
    await hand.reload({ waitUntil: 'domcontentloaded' })
    await waitHost(hand)
    await expect(hand.getByTestId('live-cash-btc')).toBeChecked({ timeout: 15_000 })
    await expect(hand.getByTestId('live-cash-ng')).toBeChecked()
    await expect(hand.getByTestId('live-cash-cu')).toBeChecked()
    if (await hand.getByTestId('contracts-btc').isEnabled()) {
      await expect(hand.getByTestId('contracts-btc')).toHaveValue('17')
    }
    await setToggle(desk, 'live-cash-btc', false)
    await setToggle(desk, 'live-cash-ng', false)
    await setToggle(desk, 'live-cash-cu', false)
    if (await desk.getByTestId('contracts-btc').isEnabled()) {
      await desk.getByTestId('contracts-btc').fill('1')
      await desk.getByTestId('contracts-btc').blur()
    }
  } finally {
    await desk.close()
    await hand.close()
    await pc.close()
    await phone.close()
  }
})

test('tradingActive true + forced STALE stays countdown — no CLOSED flash for 5s', async ({ page }) => {
  test.setTimeout(30_000)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  const closeAt = Date.now() + 8 * 60_000
  await page.evaluate((at) => {
    ;(window as Window & { __HUB_TEST_CLOSE_CLOCK?: { tradingActive: boolean; stale: boolean; closeAt: number } }).__HUB_TEST_CLOSE_CLOCK =
      { tradingActive: true, stale: true, closeAt: at }
  }, closeAt)
  await expect(page.getByTestId('stale-btc')).toBeVisible()
  const started = Date.now()
  while (Date.now() - started < 5_000) {
    for (const id of ['btc', 'ng', 'cu', 'gld'] as const) {
      const clock = page.getByTestId(`close-clock-${id}`)
      await expect(clock).toHaveAttribute('data-clock-kind', 'live')
      await expect(clock).not.toContainText('CLOSED')
      await expect(clock).toHaveText(/^\d{1,2}:\d{2}$/)
    }
    await page.waitForTimeout(250)
  }
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await page.evaluate((at) => {
    ;(window as Window & { __HUB_TEST_CLOSE_CLOCK?: { tradingActive: boolean; stale: boolean; closeAt: number } }).__HUB_TEST_CLOSE_CLOCK =
      { tradingActive: true, stale: true, closeAt: at }
  }, closeAt)
  await expect(page.getByTestId('close-clock-btc')).toHaveAttribute('data-clock-kind', 'live')
  await expect(page.getByTestId('close-clock-btc')).not.toContainText('CLOSED')
  await page.evaluate(() => {
    ;(window as Window & { __HUB_TEST_CLOSE_CLOCK?: { tradingActive: boolean; stale: boolean; closeAt: number } }).__HUB_TEST_CLOSE_CLOCK =
      { tradingActive: false, stale: false, closeAt: Date.now() + 8 * 60_000 }
  })
  await expect(page.getByTestId('close-clock-btc')).toHaveAttribute('data-clock-kind', 'closed')
  await expect(page.getByTestId('close-clock-btc')).toContainText('CLOSED')
  await page.waitForTimeout(800)
  await expect(page.getByTestId('close-clock-btc')).toHaveAttribute('data-clock-kind', 'closed')
  await expect(page.getByTestId('close-clock-btc')).toContainText('CLOSED')
})

test('Last 24H strip stays on LIVE + today paper — Soft FAIL hist dump flicker', async ({ page }) => {
  const now = Date.now()
  await page.addInitScript(
    ([ts]) => {
      const hist = Array.from({ length: 80 }, (_, i) => ({
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
        filledAt: ts - i * 1000,
        settledAt: ts - i * 1000,
        kind: 'hist',
      }))
      localStorage.setItem(
        'hub.desk.finance.v1',
        JSON.stringify({
          killed: false,
          paperStartedAt: ts,
          bets: [
            {
              betId: 'bet_ord-live-strip',
              tape: 'btc',
              ticker: 'KXBTC15M-LIVESTRIP',
              clock: '15m',
              closeAt: ts,
              side: 'up',
              count: 1,
              ask: 70,
              spent: 25,
              orderId: 'ord-live-strip-aaaa',
              status: 'settled',
              pnl: 10,
              filledAt: ts - 1000,
              settledAt: ts,
              kind: 'live',
            },
            {
              betId: 'bet_deskfill-btc-today',
              tape: 'btc',
              ticker: 'KXBTC15M-PAPERTODAY',
              clock: '15m',
              closeAt: ts,
              side: 'down',
              count: 1,
              ask: 40,
              spent: 8,
              orderId: 'deskfill-btc-today01',
              status: 'settled',
              pnl: -8,
              filledAt: ts - 500,
              settledAt: ts,
              kind: 'paper',
            },
            ...hist,
          ],
        }),
      )
      localStorage.setItem(
        'hub.desk.cash.v1',
        JSON.stringify({ cash: 293.93, deposits: 760, pnl: -466.07, firstDepositAt: ts - 200 * 86_400_000, asOf: ts }),
      )
    },
    [now],
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  const placed = page.getByTestId('bets-placed')
  const wl = page.getByTestId('bets-wl')
  const pnl = page.getByTestId('bets-pnl')
  await expect(placed).not.toContainText('11,784')
  await expect(wl).not.toContainText('255W')
  await expect(pnl).not.toContainText('−$466')
  await expect(pnl).not.toContainText('-$466')
  const first = {
    placed: (await placed.innerText()).trim(),
    wl: (await wl.innerText()).trim(),
    pnl: (await pnl.innerText()).trim(),
  }
  expect(first.placed).not.toMatch(/11,?784/)
  await page.waitForTimeout(2500)
  const later = {
    placed: (await placed.innerText()).trim(),
    wl: (await wl.innerText()).trim(),
    pnl: (await pnl.innerText()).trim(),
  }
  expect(later.placed).toBe(first.placed)
  expect(later.pnl).toBe(first.pnl)
  expect(later.wl.match(/(\d+)W–(\d+)L/)?.slice(1)).toEqual(first.wl.match(/(\d+)W–(\d+)L/)?.slice(1))
  expect(later.wl).not.toMatch(/255W/)
  await expect(page.locator('[data-testid="bets-mode"]', { hasText: 'HIST' })).toHaveCount(0)
  await expect(page.locator('[data-order-id="deskfill-btc-today01"]')).toHaveCount(0)
  await expect(page.locator('[data-order-id^="deskfill-"]')).toHaveCount(0)
})

test('Live ON place fail Soft FAIL deskfill LIVE — success needs real Kalshi order id', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await allowLiveArm(page)
  await setToggle(page, 'live-cash-btc', true)
  const quote = {
    ticker: 'KXBTC15M-GHOSTQA',
    clock: '15m',
    clockId: '15m',
    closeAt: Date.now() + 8 * 60_000,
    tradingActive: true,
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
    }
    w.__HUB_PLACE = async () => {
      throw new Error('Kalshi reject — IOC miss')
    }
    await w.__HUB_TEST_SEND?.('btc', 'up', q)
  }, quote)
  await expect(page.getByTestId('desk-msg')).toContainText(/Kalshi reject|IOC miss|no order id|not sent/)
  await expect(page.getByTestId('ticket-btc')).toContainText('No ticket this clock')
  await expect(page.getByTestId('banner-btc')).toHaveCount(0)
  await expect(page.locator('[data-order-id^="deskfill-btc-"] [data-testid="bets-mode"]', { hasText: 'LIVE' })).toHaveCount(0)
  await expect(page.getByTestId('status-btc')).not.toHaveText('UP')

  await page.evaluate(async (q) => {
    const w = window as Window & {
      __HUB_PLACE?: (p: unknown) => Promise<unknown>
      __HUB_TEST_SEND?: (tape: string, side: string, quote: unknown) => Promise<void>
    }
    w.__HUB_PLACE = async () => ({
      order: { order_id: '01a0b7af-7b30-701f-8eb6-fa1303b858ad', status: 'executed', fill_count: 1 },
    })
    await w.__HUB_TEST_SEND?.('btc', 'up', q)
  }, quote)
  await expect(page.getByTestId('ticket-btc')).toContainText(/70¢|cost/)
  await expect(page.getByTestId('ticket-id-btc')).toHaveText('LIVE')
  await expect(page.locator('[data-order-id="01a0b7af-7b30-701f-8eb6-fa1303b858ad"] [data-testid="bets-mode"]')).toHaveText(
    'LIVE',
  )
  await expect(page.getByTestId('status-btc')).toHaveText('UP')
})

test('Desk Chief paper size shift Soft FAIL Live flip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await resetGoldDesk(page)
  await page.getByTestId('finance-toggle').click()
  await expect(page.getByTestId('desk-chief')).toBeVisible()
  await expect(page.getByTestId('chief-lock')).toContainText(/Soft FAIL Live ON/)
  await expect(page.locator('body')).not.toContainText(/Live ALL|master Live/)
  const result = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_TEST_CHIEF?: {
        run: (over: Record<string, unknown>) => {
          paperApplies: Array<{ tape: string; contracts: number }>
          liveOnWrites: Record<string, boolean>
        }
      }
    }
    const now = Date.now()
    const settings = JSON.parse(localStorage.getItem('hub.desk.settings.v1') || 'null') as {
      tapes?: { btc?: { liveOn?: boolean; contracts?: number } }
    }
    if (settings?.tapes?.btc) {
      settings.tapes.btc.liveOn = false
      settings.tapes.btc.contracts = 1
    }
    return w.__HUB_TEST_CHIEF?.run({
      settings,
      book: {
        killed: false,
        paperStartedAt: now,
        bets: [1, 2, 3].map((i) => ({
          betId: `paper:btc-${i}`,
          tape: 'btc',
          ticker: `KXBTC15M-P${i}`,
          clock: '15m',
          closeAt: now,
          side: 'up',
          count: 1,
          ask: 70,
          spent: 0.7,
          orderId: `deskfill-btc-w${i}`,
          status: 'settled',
          pnl: 0.3,
          filledAt: now,
          settledAt: now,
          kind: 'paper',
        })),
      },
      cash: 293.93,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now,
    })
  })
  expect(result?.paperApplies.some((a) => a.tape === 'btc' && a.contracts >= 2)).toBe(true)
  expect(result?.liveOnWrites ?? {}).toEqual({})
  await expect(page.getByTestId('live-cash-btc')).not.toBeChecked()
  await expect(page.getByTestId('chief-alloc-btc')).toContainText(/BTC/)
})

test('cash floor Soft FAIL Live size-up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await resetGoldDesk(page)
  const result = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_TEST_CHIEF?: {
        run: (over: Record<string, unknown>) => {
          paperApplies: unknown[]
          liveOnWrites: Record<string, boolean>
          state: { proposals: Array<{ kind: string; reason: string }> }
        }
      }
    }
    const now = Date.now()
    const settings = JSON.parse(localStorage.getItem('hub.desk.settings.v1') || 'null') as {
      tapes?: { btc?: { liveOn?: boolean; contracts?: number } }
    }
    if (settings?.tapes?.btc) {
      settings.tapes.btc.liveOn = true
      settings.tapes.btc.contracts = 2
    }
    return w.__HUB_TEST_CHIEF?.run({
      settings,
      book: {
        killed: false,
        paperStartedAt: now - 49 * 3600_000,
        bets: [1, 2, 3].map((i) => ({
          betId: `bet_ord-live-btc-${i}`,
          tape: 'btc',
          ticker: `KXBTC15M-L${i}`,
          clock: '15m',
          closeAt: now,
          side: 'up',
          count: 1,
          ask: 70,
          spent: 0.7,
          orderId: `ord-live-btc-aaaa${i}`,
          status: 'settled',
          pnl: 0.3,
          filledAt: now,
          settledAt: now,
          kind: 'live',
        })),
      },
      cash: 50,
      deposits: 760,
      quotes: { btc: { tradingActive: true, stale: false, yesAsk: 70 } },
      now,
    })
  })
  expect(result?.paperApplies).toEqual([])
  expect(result?.liveOnWrites ?? {}).toEqual({})
  expect(result?.state.proposals.some((p) => p.kind === 'block' && /floor/i.test(p.reason))).toBe(true)
  await expect(page.getByTestId('live-cash-btc')).not.toBeChecked()
})

test('Desk Chief clock pick persists paper Soft FAIL Live flip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await resetGoldDesk(page)
  await page.getByTestId('clock-gld').selectOption('5m')
  await expect(page.getByTestId('clock-gld')).toHaveValue('5m')
  await expect(page.getByTestId('live-cash-gld')).not.toBeChecked()
  const result = await page.evaluate(() => {
    const w = window as Window & {
      __HUB_TEST_CHIEF?: {
        run: (over: Record<string, unknown>) => {
          paperApplies: Array<{ tape: string; contracts: number; clock?: string }>
          liveOnWrites: Record<string, boolean>
        }
      }
    }
    const now = Date.now()
    const raw = JSON.parse(localStorage.getItem('hub.desk.settings.v1') || 'null') as {
      tapes?: Record<string, { liveOn?: boolean; botOn?: boolean; contracts?: number }>
      clocks?: Partial<Record<string, string>>
    } | null
    const settings = raw && typeof raw === 'object' ? raw : { tapes: {}, clocks: {} }
    settings.tapes = settings.tapes || {}
    settings.tapes.gld = { ...(settings.tapes.gld || {}), liveOn: false, botOn: true, contracts: 1 }
    settings.clocks = { btc: '15m', ng: '15m', cu: '15m', ...(settings.clocks || {}), gld: '5m' }
    return w.__HUB_TEST_CHIEF?.run({
      settings,
      book: { killed: false, paperStartedAt: now, bets: [] },
      cash: 293.93,
      deposits: 760,
      quotes: { gld: { tradingActive: false, stale: true, yesAsk: 40 } },
      now,
      prev: {
        asOf: 0,
        lastRunAt: 0,
        sleeves: {},
        progress: {},
        proposals: [],
        actions: [],
        dailyPnl: 0,
        lockIn: false,
        cash: null,
        cashFloor: 150,
      },
    })
  })
  expect(result?.paperApplies.some((a) => a.tape === 'gld' && a.clock === '15m')).toBe(true)
  expect(result?.liveOnWrites ?? {}).toEqual({})
  await expect(page.getByTestId('live-cash-gld')).not.toBeChecked()
  await expect(page.getByTestId('clock-gld')).toHaveValue('15m')
})

test('GLD STALE Soft FAIL Live arm', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await resetGoldDesk(page)
  await page.evaluate(() => {
    ;(window as Window & { __HUB_TEST_TAPE_QUOTE?: { gld: { tradingActive: boolean; stale: boolean } } }).__HUB_TEST_TAPE_QUOTE =
      { gld: { tradingActive: false, stale: true } }
  })
  await page.locator('label').filter({ has: page.getByTestId('live-cash-gld') }).click({ force: true })
  await expect(page.getByTestId('live-cash-gld')).not.toBeChecked()
  await expect(page.getByTestId('desk-msg')).toContainText(/GLD STALE/)
})

test('canceled IOC Soft FAIL LIVE / BOT BOUGHT without fill', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await waitHost(page)
  await allowLiveArm(page)
  await setToggle(page, 'live-cash-btc', true)
  const quote = {
    ticker: 'KXBTC15M-CXLQA',
    clock: '15m',
    clockId: '15m',
    closeAt: Date.now() + 8 * 60_000,
    tradingActive: true,
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
    await w.__HUB_TEST_SEND?.('btc', 'up', q)
    w.__HUB_APPLY_BOOK?.({
      cash: 293.93,
      fills: { fills: [] },
      settlements: { settlements: [] },
      orders: {
        orders: [
          {
            order_id: '01a0b7af-7b30-701f-8eb6-fa1303b858ad',
            status: 'canceled',
            fill_count: 0,
            action: 'sell',
            side: 'yes',
          },
        ],
      },
      fetchedAt: Date.now(),
      hostCreds: true,
    })
  }, quote)
  await expect(page.getByTestId('desk-msg')).toContainText(/no order id|not sent|canceled/i)
  await expect(page.getByTestId('ticket-btc')).toContainText('No ticket this clock')
  await expect(page.getByTestId('banner-btc')).toHaveCount(0)
  await expect(page.locator('[data-order-id="01a0b7af-7b30-701f-8eb6-fa1303b858ad"] [data-testid="bets-mode"]', { hasText: 'LIVE' })).toHaveCount(0)
  await expect(page.getByTestId('status-btc')).not.toHaveText('UP')
  await expect(page.locator('body')).not.toContainText('BOT BOUGHT')
})
