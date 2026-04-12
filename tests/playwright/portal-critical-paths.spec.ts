import { expect, test, type Page } from "@playwright/test"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"

const portalBaseUrl = "http://127.0.0.1:4173"
const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

const activationResponse = {
	sessionToken: "session-token-77",
	customer: {
		customerId: "cust-777",
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
	priceListVersion: "v-1",
}

const portalDataResponse = {
	customer: {
		customerId: "cust-777",
	},
	sessionExpiresAt,
	recentItems: activationResponse.recentItems,
	approvedItems: activationResponse.approvedItems,
	pricing: activationResponse.pricing,
	priceListVersion: "v-1",
}

let portalDevServer: ChildProcessWithoutNullStreams

test.describe("customer portal browser critical paths", () => {
	test.beforeAll(async () => {
		portalDevServer = spawn(
			"pnpm",
			["--filter", "@meatland/customer-portal", "dev", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
			{
				cwd: process.cwd(),
				stdio: "pipe",
			},
		)

		await waitForServer(`${portalBaseUrl}/order`)
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

	test("activation route supports mismatch recovery and success confirmation", async ({ page }) => {
		await stabilizeVisuals(page)
		let activationRequestToken: string | undefined
		let activationCallCount = 0
		let portalDataCallCount = 0
		const idempotencyKeys: string[] = []
		let submitCallCount = 0

		await page.route("**/v1/customer/sessions/activate", async (route) => {
			activationCallCount += 1
			activationRequestToken = route.request().postDataJSON()?.token
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(activationResponse),
			})
		})

		await page.route("**/v1/customer/portal-data", async (route) => {
			portalDataCallCount += 1
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(portalDataResponse),
			})
		})

		await page.route("**/v1/customer/orders", async (route) => {
			submitCallCount += 1
			idempotencyKeys.push(route.request().headers()["idempotency-key"] ?? "")
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
					orderId: "order-77",
					orderRef: "ORD-2026-00077",
					status: "submitted",
				}),
			})
		})

		const activationResponseWait = page.waitForResponse((response) =>
			response.url().includes("/v1/customer/sessions/activate"),
		)
		const portalDataResponseWait = page.waitForResponse((response) =>
			response.url().includes("/v1/customer/portal-data"),
		)

		await page.goto(`${portalBaseUrl}/m/token-abc`)

		await activationResponseWait
		await portalDataResponseWait
		await expect(page).toHaveURL(`${portalBaseUrl}/order`)
		expect(activationRequestToken).toBe("token-abc")
		expect(activationCallCount).toBe(1)
		expect(portalDataCallCount).toBeGreaterThan(0)
		await expect(page.getByTestId("portal-heading")).toContainText("Meatland")
		await expect(page.getByTestId("screen-portal-order-composer")).toHaveAttribute("dir", "rtl")
		await expect(page.getByTestId("screen-portal-order-composer")).toHaveAttribute("lang", "he")
		await expect(page.getByTestId("screen-portal-order-composer")).toContainText("חשבון מאומת")
		await assertCriticalScreenshot(page, page.getByTestId("screen-portal-order-composer"), "portal-critical-order-composer.png")

		await page.getByRole("button", { name: "הגדלת כמות אנטריקוט פרימיום" }).click()
		await expect(page.getByLabel("סיכום הזמנה")).toContainText("פריטים")
		await expect(page.getByLabel("סיכום הזמנה")).toContainText("42.50")

		await page.getByRole("button", { name: "שליחת הזמנה למפעל (1 יחידות)" }).click()
		await expect(page.getByTestId("screen-portal-order-mismatch")).toContainText("מחיר יחידה ב-ERP עודכן מ־42.50 ל־49.90")
		await expect(page.getByTestId("screen-portal-order-mismatch")).toContainText("נמצאו פערי מחיר בהזמנה")
		await expect(page.getByRole("button", { name: /(?:רענון|עדכון) מחירים/ })).toBeVisible()
		await assertCriticalScreenshot(page, page.getByTestId("screen-portal-order-mismatch"), "portal-critical-order-mismatch.png")

		await page.getByRole("button", { name: /(?:אישור מחדש ושליחה|אשר ושדר הזמנה)/ }).click()
		await expect(page.getByTestId("screen-portal-order-success")).toContainText("אסמכתא: ORD-2026-00077")
		await expect(page.getByTestId("screen-portal-order-success")).toContainText("ההזמנה נקלטה בהצלחה!")
		await expect(page.getByTestId("screen-portal-order-success")).toContainText("ההזמנה ננעלה לאחר אישור כדי למנוע שליחה כפולה")
		await expect(page.locator('[data-testid="screen-portal-order-success"] bdi').first()).toHaveAttribute("dir", "ltr")
		await expect(page.getByRole("button", { name: "שליחת הזמנה למפעל (1 יחידות)" })).toBeDisabled()
		await assertCriticalScreenshot(page, page.getByTestId("screen-portal-order-success"), "portal-critical-order-success.png")

		expect(submitCallCount).toBe(2)
		expect(idempotencyKeys[0]).toBeTruthy()
		expect(idempotencyKeys[1]).toBeTruthy()
		expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1])
	})

	test("submit shows ERP outage guidance and allows retry without reload", async ({ page }) => {
		await stabilizeVisuals(page)
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
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ code: "CUSTOMER_ORDER_ERP_UNAVAILABLE" }),
				})
				return
			}

			await route.fulfill({
				status: 201,
				contentType: "application/json",
				body: JSON.stringify({
					orderId: "order-78",
					orderRef: "ORD-2026-00078",
					status: "submitted",
				}),
			})
		})

		await page.goto(`${portalBaseUrl}/m/token-erp-outage`)
		await expect(page).toHaveURL(`${portalBaseUrl}/order`)
		await expect(page.getByTestId("portal-heading")).toContainText("Meatland")

		await page.getByRole("button", { name: "הגדלת כמות אנטריקוט פרימיום" }).click()
		await page.getByRole("button", { name: "שליחת הזמנה למפעל (1 יחידות)" }).click()

		await expect(page.getByTestId("submit-error")).toContainText(
			'המערכת עמוסה זמנית ולא ניתן להשלים את ההזמנה כרגע. נסו שוב בעוד דקה באמצעות "נסו לשלוח שוב".',
		)
		await expect(page.getByRole("button", { name: "נסו לשלוח שוב" })).toBeVisible()
		await expect(page.getByRole("button", { name: "שליחת הזמנה למפעל (1 יחידות)" })).toBeEnabled()

		await page.getByRole("button", { name: "נסו לשלוח שוב" }).click()

		await expect(page.getByTestId("screen-portal-order-success")).toContainText("אסמכתא: ORD-2026-00078")
		expect(submitCallCount).toBe(2)
	})

	test("activation route accepts query-token links", async ({ page }) => {
		await stabilizeVisuals(page)
		let activationRequestToken: string | undefined

		await page.route("**/v1/customer/sessions/activate", async (route) => {
			activationRequestToken = route.request().postDataJSON()?.token
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

		await page.goto(`${portalBaseUrl}/m?token=query-token-123`)

		await expect(page).toHaveURL(`${portalBaseUrl}/order`)
		await expect(page.getByTestId("portal-heading")).toContainText("Meatland")
		expect(activationRequestToken).toBe("query-token-123")
	})

	test("order route shows weak-network and resilient error UI on load failure", async ({ page }) => {
		await stabilizeVisuals(page)
		await page.addInitScript(
			(session) => {
				window.sessionStorage.setItem("customer-portal-session", JSON.stringify(session))
			},
			{
				sessionToken: activationResponse.sessionToken,
				customerId: activationResponse.customer.customerId,
				sessionExpiresAt: activationResponse.sessionExpiresAt,
				payload: portalDataResponse,
			},
		)

		await page.route("**/v1/customer/portal-data", async (route) => {
			await page.waitForTimeout(4_500)
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ code: "SERVICE_UNAVAILABLE" }),
			})
		})

		await page.goto(`${portalBaseUrl}/order`)

		await expect(page.getByTestId("order-weak-network")).toContainText("הרשת איטית", { timeout: 10_000 })
		await expect(page.getByRole("heading", { name: "לא הצלחנו לטעון את ההזמנה" })).toBeVisible({ timeout: 10_000 })
		await expect(page.getByText("לא ניתן לטעון את נתוני ההזמנה כרגע. נסו שוב בעוד רגע.")).toBeVisible({ timeout: 10_000 })
	})

	test("logout clears active session and routes back to activation state", async ({ page }) => {
		let logoutCalls = 0

		await page.addInitScript(
			(session) => {
				window.sessionStorage.setItem("customer-portal-session", JSON.stringify(session))
			},
			{
				sessionToken: activationResponse.sessionToken,
				customerId: activationResponse.customer.customerId,
				sessionExpiresAt: activationResponse.sessionExpiresAt,
				payload: portalDataResponse,
			},
		)

		await page.route("**/v1/customer/portal-data", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(portalDataResponse),
			})
		})

		await page.route("**/v1/customer/session/logout", async (route) => {
			logoutCalls += 1
			await route.fulfill({
				status: 204,
			})
		})

		await stabilizeVisuals(page)
		await page.goto(`${portalBaseUrl}/order`)

		await expect(page.getByTestId("portal-heading")).toContainText("Meatland")
		await page.getByRole("button", { name: "התנתקות" }).click()

		await expect(page).toHaveURL(`${portalBaseUrl}/m`)
		await expect(page.getByRole("heading", { name: "שגיאת הפעלה" })).toBeVisible()
		await expect(page.getByTestId("screen-portal-session-error")).toContainText("זקוק לעזרה?")
		await assertCriticalScreenshot(page, page.getByTestId("screen-portal-session-error"), "portal-critical-session-error.png")
		expect(logoutCalls).toBe(1)
	})
})

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

	throw new Error(`Timed out waiting for dev server: ${url}`)
}

async function stabilizeVisuals(page: Page): Promise<void> {
	await page.emulateMedia({ reducedMotion: "reduce" })
	await page.route("https://fonts.googleapis.com/**", async (route) => {
		await route.fulfill({ status: 200, contentType: "text/css", body: "" })
	})
	await page.route("https://fonts.gstatic.com/**", async (route) => {
		await route.abort()
	})
}

async function assertCriticalScreenshot(
	page: Page,
	locator: ReturnType<Page["locator"]>,
	name: string,
): Promise<void> {
	await expect(locator).toHaveScreenshot(name, {
		animations: "disabled",
		caret: "hide",
	})
}
