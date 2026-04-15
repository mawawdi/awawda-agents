import { expect, test, type Page } from "@playwright/test"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { PORTAL_SCREEN_TEST_IDS } from "../../apps/customer-portal/src/portal-screen-ids"

const portalBaseUrl = "http://127.0.0.1:4173"
const sessionExpiresAt = "2030-01-01T00:00:00.000Z"

const activationResponse = {
sessionToken: "session-token-visual",
customer: {
customerId: "cust-visual",
},
sessionExpiresAt,
recentItems: [
{
itemId: "item-1",
name: "אנטריקוט פרימיום",
lastOrderedAt: "2026-04-07T10:00:00.000Z",
},
],
approvedItems: [
{
hashItemId: "item-2",
addedByAgentId: "agent-9",
createdAt: "2026-04-06T09:00:00.000Z",
},
],
pricing: [
{ itemId: "item-1", unitPrice: 42.5, currency: "ILS" },
{ itemId: "item-2", unitPrice: 50, currency: "ILS" },
],
priceListVersion: "visual-v1",
}

const portalDataResponse = {
customer: {
customerId: "cust-visual",
},
sessionExpiresAt,
recentItems: activationResponse.recentItems,
approvedItems: activationResponse.approvedItems,
pricing: activationResponse.pricing,
priceListVersion: "visual-v1",
}

let portalDevServer: ChildProcessWithoutNullStreams

test.beforeAll(async () => {
portalDevServer = spawn(
"pnpm",
["--filter", "@awawda/customer-portal", "dev", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
{
cwd: process.cwd(),
stdio: "pipe",
},
)

await waitForServer(portalBaseUrl + "/order")
})

test.afterAll(async () => {
if (!portalDevServer.killed) {
portalDevServer.kill("SIGTERM")
}

await new Promise<void>((resolve) => {
portalDevServer.once("exit", () => resolve())
setTimeout(() => resolve(), 5_000)
})
})

test.describe("portal visual coverage - desktop", () => {
test.use({
viewport: { width: 1440, height: 1024 },
locale: "he-IL",
timezoneId: "UTC",
})

test("captures order composer, mismatch, success, and session error", async ({ page }) => {
await stabilizeVisuals(page)
await mockPortalJourney(page)

await page.goto(portalBaseUrl + "/m/visual-desktop-token")
await expect(page).toHaveURL(portalBaseUrl + "/order")
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderComposer)).toBeVisible()
await assertComposerParity(page)

await page.getByRole("button", { name: "הגדלת כמות אנטריקוט פרימיום" }).click()
await captureScenario(page, "portal-order-composer-desktop.png")

await page.getByRole("button", { name: "שליחת הזמנה למפעל (1 יחידות)" }).click()
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderMismatch)).toBeVisible()
await assertMismatchParity(page)
await captureScenario(page, "portal-order-mismatch-desktop.png")

await page.getByRole("button", { name: "אשר ושדר הזמנה" }).click()
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderSuccess)).toBeVisible()
await assertSuccessParity(page)
await captureScenario(page, "portal-order-success-desktop.png")
})

test("captures activation session error state", async ({ page }) => {
await stabilizeVisuals(page)
await page.route("**/v1/customer/sessions/activate", async (route) => {
await route.fulfill({
status: 401,
contentType: "application/json",
body: JSON.stringify({ code: "CUSTOMER_SESSION_INVALID_TOKEN" }),
})
})

await page.goto(portalBaseUrl + "/m/invalid-desktop-token")
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.sessionError)).toBeVisible()
await assertSessionErrorParity(page)
await captureScenario(page, "portal-session-error-desktop.png")
})
})

test.describe("portal visual coverage - mobile web", () => {
test.use({
viewport: { width: 390, height: 844 },
isMobile: true,
hasTouch: true,
locale: "he-IL",
timezoneId: "UTC",
})

test("captures order composer, mismatch, success, and session error", async ({ page }) => {
await stabilizeVisuals(page)
await mockPortalJourney(page)

await page.goto(portalBaseUrl + "/m/visual-mobile-token")
await expect(page).toHaveURL(portalBaseUrl + "/order")
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderComposer)).toBeVisible()
await assertComposerParity(page)

await page.getByRole("button", { name: "הגדלת כמות אנטריקוט פרימיום" }).click()
 await captureMobileAwawdaScenario(page, PORTAL_SCREEN_TEST_IDS.orderComposer, "portal-order-composer-mobile.png")

await page.getByRole("button", { name: "שליחת הזמנה למפעל (1 יחידות)" }).click()
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderMismatch)).toBeVisible()
await assertMismatchParity(page)
 await captureMobileAwawdaScenario(page, PORTAL_SCREEN_TEST_IDS.orderMismatch, "portal-order-mismatch-mobile.png")

await page.getByRole("button", { name: "אשר ושדר הזמנה" }).click()
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderSuccess)).toBeVisible()
await assertSuccessParity(page)
 await captureMobileAwawdaScenario(page, PORTAL_SCREEN_TEST_IDS.orderSuccess, "portal-order-success-mobile.png")
})

test("captures activation session error state", async ({ page }) => {
await stabilizeVisuals(page)
await page.route("**/v1/customer/sessions/activate", async (route) => {
await route.fulfill({
status: 401,
contentType: "application/json",
body: JSON.stringify({ code: "CUSTOMER_SESSION_INVALID_TOKEN" }),
})
})

await page.goto(portalBaseUrl + "/m/invalid-mobile-token")
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.sessionError)).toBeVisible()
await assertSessionErrorParity(page)
 await captureMobileAwawdaScenario(page, PORTAL_SCREEN_TEST_IDS.sessionError, "portal-session-error-mobile.png")
})
})

async function stabilizeVisuals(page: Page): Promise<void> {
await page.emulateMedia({ reducedMotion: "reduce" })
await page.route("https://fonts.googleapis.com/**", async (route) => {
await route.fulfill({ status: 200, contentType: "text/css", body: "" })
})
	await page.route("https://fonts.gstatic.com/**", async (route) => {
	await route.abort()
	})
	 await page.addStyleTag({
	 content: `
	 * {
 backdrop-filter: none !important;
 -webkit-backdrop-filter: none !important;
 }
 `,
 })
}

async function mockPortalJourney(page: Page): Promise<void> {
let submitCallCount = 0

await page.route("**/v1/customer/sessions/activate", async (route) => {
await route.fulfill({
status: 200,
contentType: "application/json",
body: JSON.stringify(activationResponse),
})
})

await page.route("**/v1/customer/portal-data", async (route) => {
await route.fulfill({
status: 200,
contentType: "application/json",
body: JSON.stringify(portalDataResponse),
})
})

await page.route("**/v1/customer/orders", async (route) => {
submitCallCount += 1
if (submitCallCount === 1) {
await route.fulfill({
status: 409,
contentType: "application/json",
body: JSON.stringify({
code: "ORDER_LINES_MISMATCH",
lines: [
{
lineIndex: 0,
itemId: "item-1",
 reason: "מחיר יחידה ב-ERP עודכן מ־42.50 ל־49.90",
submittedUnitPrice: 42.5,
currentUnitPrice: 49.9,
},
],
}),
})
return
}

await route.fulfill({
status: 201,
contentType: "application/json",
body: JSON.stringify({
orderId: "order-visual-1",
orderRef: "ORD-VISUAL-001",
status: "submitted",
}),
})
})
}

async function captureScenario(page: Page, fileName: string): Promise<void> {
await page.evaluate(() => {
window.scrollTo({ top: 0, behavior: "auto" })
})
await expect(page).toHaveScreenshot(fileName, {
fullPage: true,
animations: "disabled",
caret: "hide",
})
}

async function captureMobileAwawdaScenario(page: Page, screenTestId: string, fileName: string): Promise<void> {
 const screen = page.getByTestId(screenTestId)
 const screenshotOptions = {
 animations: "disabled" as const,
 caret: "hide" as const,
 scale: "css" as const,
 }

 await page.evaluate(() => {
 window.scrollTo({ top: 0, behavior: "auto" })
 })
 await expect(screen).toBeVisible()
 await expect(screen).toHaveScreenshot(fileName.replace(".png", "-surface.png"), {
 ...screenshotOptions,
 maxDiffPixels: 600,
 })
 await expect(page).toHaveScreenshot(fileName, {
 ...screenshotOptions,
 fullPage: true,
 maxDiffPixels: 2_000,
 })
}

async function assertComposerParity(page: Page): Promise<void> {
await expect(page.getByTestId("portal-heading")).toContainText("עואודה לשיווק בע״מ")
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderComposer)).toHaveAttribute("dir", "rtl")
 await expect(page.getByRole("heading", { name: "סיכום הזמנה" })).toBeVisible()
}

async function assertMismatchParity(page: Page): Promise<void> {
  await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderMismatch)).toContainText("נמצאו פערי מחיר בהזמנה")
await expect(page.getByRole("button", { name: "עדכון מחירים" })).toBeVisible()
await expect(page.getByRole("button", { name: "אשר ושדר הזמנה" })).toBeVisible()
}

async function assertSuccessParity(page: Page): Promise<void> {
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderSuccess)).toContainText("ההזמנה נקלטה בהצלחה!")
  await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderSuccess)).toContainText("ההזמנה ננעלה לאחר אישור כדי למנוע שליחה כפולה")
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.orderSuccess)).toContainText("תודה שבחרת בעואודה לשיווק בע״מ")
}

async function assertSessionErrorParity(page: Page): Promise<void> {
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.sessionError)).toContainText("שגיאת הפעלה")
await expect(page.getByRole("button", { name: "נסה הפעלה מחדש" })).toBeVisible()
 await expect(page.getByTestId(PORTAL_SCREEN_TEST_IDS.sessionError)).toContainText("זקוק לעזרה?")
}

async function waitForServer(url: string): Promise<void> {
for (let attempt = 0; attempt < 60; attempt += 1) {
try {
const response = await fetch(url)
if (response.ok || response.status === 404) {
return
}
} catch {
// retry
}

await new Promise((resolve) => setTimeout(resolve, 500))
}

throw new Error("Timed out waiting for dev server: " + url)
}
