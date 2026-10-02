// Drives the real UI against a running antd (Vite at ANT_WEB, default 5181) and screenshots each step.
import { chromium } from 'playwright'
const out = process.argv[2] ?? '/tmp'
const url = process.env.ANT_WEB ?? 'http://127.0.0.1:5181/'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => m.type() === 'error' && !/502|504/.test(m.text()) && errors.push('console: ' + m.text()))
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await shot('l1-welcome')
await page.getByRole('button', { name: /Hatch your first ant/ }).click()
await page.waitForTimeout(500)
await page.locator('input[placeholder="Nova"]').fill('Juniper')
await page.getByRole('button', { name: 'Researcher' }).click()
await page.getByRole('button', { name: /Hatch Juniper/ }).click()
await page.waitForTimeout(1200)
await shot('l2-hatched')
await page.locator('[data-composer]').fill('Hi! In two short bullet points, what can you do for me? Then write workspace/hello.md with a one-line greeting and share it.')
await page.keyboard.press('Enter')
await page.waitForTimeout(2500)
await shot('l3-working')
await page.waitForFunction(() => !document.querySelector('.typing'), null, { timeout: 120000 }).catch(() => {})
await page.waitForTimeout(1500)
await shot('l4-done')
console.log(errors.join('\n') || 'no errors')
await browser.close()
