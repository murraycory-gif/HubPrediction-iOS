import { expect, test } from '@playwright/test'

test('finance manager: deposit, paper fill persist, floor, KILL', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/', { waitUntil: 'networkidle' })
  await expect(page.getByTestId('finance-panel')).toBeVisible()

  await expect(page.getByTestId('desk-title')).toHaveText(/HUB PREDICTIONS/)
  await expect(page.getByTestId('mode-line')).toContainText(/PAPER/)
  await expect(page.getByTestId('mode-line')).toContainText(/Live bets OFF/i)
  await expect(page.getByTestId('live-bets')).not.toBeChecked()
  await expect(page.getByTestId('cash-strip')).toBeVisible()
  await expect(page.getByTestId('strip-floor')).toContainText('$50.00')
  await expect(page.getByTestId('strip-cash')).toContainText('$10,000.00')

  await page.getByTestId('deposit-amount').fill('760')
  await page.getByTestId('deposit-note').fill('wire')
  await expect(page.getByTestId('deposit-note')).toHaveValue('wire')
  await page.getByTestId('log-deposit').click({ force: true })
  await expect(page.getByTestId('deposit-row').first()).toContainText('$760.00')
  await expect(page.getByTestId('strip-deposits')).toContainText('$760.00')
  await expect(page.getByTestId('strip-pnl-vs-dep')).toContainText('$10,000.00')

  await expect(page.getByTestId('place')).toBeEnabled()
  await page.getByTestId('place').click()
  await page.getByTestId('confirm').click()
  await expect(page.getByTestId('bet-row').first()).toContainText(/PAPER-|KXBTC|paper/)
  await expect(page.getByTestId('bet-row').first()).toContainText(/open|settled/)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('bet-row').first()).toContainText(/PAPER-|KXBTC|paper/)
  await expect(page.getByTestId('deposit-row').first()).toContainText('$760.00')
  await expect(page.getByTestId('live-bets')).not.toBeChecked()

  await page.getByTestId('kill').click()
  await expect(page.getByTestId('kill')).toHaveText(/KILL ON/)
  await expect(page.getByTestId('place')).toBeDisabled()
  await expect(page.getByTestId('place-block')).toContainText(/KILL/)
  await expect(page.getByTestId('bot-btc')).not.toBeChecked()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('kill')).toHaveText(/KILL ON/)
  await expect(page.getByTestId('place')).toBeDisabled()
})
