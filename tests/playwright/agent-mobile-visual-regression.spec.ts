import { expect, test, type Page } from "@playwright/test"
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { AGENT_SCREEN_TEST_IDS } from "../../apps/agent-mobile/src/screens/agent-screen-ids"

const agentBaseUrl = "http://127.0.0.1:19007"
const stablePlaceholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7f1d1d"/><stop offset="100%" stop-color="#0d9488"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><text x="320" y="190" font-family="Arial, sans-serif" font-size="38" text-anchor="middle" fill="#ffffff" opacity="0.88">AWAWDA</text></svg>`

const loginResponse = {
	accessToken: "agent-visual-token",
	expiresIn: 28_800,
	agentProfile: {
		id: "agent-visual-1",
		name: "יוסי כהן",
		phone: "054-9876543",
		email: "yossi@example.com",
	},
}

const customersResponse = {
	customers: [
		{ customerId: "אטליז-האחים-כהן", approvedItemsCount: 3, lastOrderAt: "2026-04-12T10:30:00.000Z" },
		{ customerId: "מעדניית-גורמה", approvedItemsCount: 2, lastOrderAt: "2026-04-11T09:00:00.000Z" },
		{ customerId: "מסעדת-הבשרים", approvedItemsCount: 1, lastOrderAt: "2026-04-10T08:00:00.000Z" },
		{ customerId: "סופר-מרקט-העיר", approvedItemsCount: 0, lastOrderAt: null },
	],
	total: 4,
	generatedAt: "2026-04-12T10:35:00.000Z",
}

const approvedItemsResponse = {
	customerId: "אטליז-האחים-כהן",
	items: [
		{ hashItemId: "אנטריקוט-פרימיום", addedByAgentId: "agent-visual-1", createdAt: "2026-04-12T10:00:00.000Z" },
		{ hashItemId: "צלעות-טלה-טרי", addedByAgentId: "agent-visual-1", createdAt: "2026-04-12T09:45:00.000Z" },
		{ hashItemId: "פילה-בקר-ישראלי", addedByAgentId: "agent-visual-1", createdAt: "2026-04-12T09:30:00.000Z" },
	],
	total: 3,
	generatedAt: "2026-04-12T10:35:00.000Z",
}

const ordersResponse = {
	orders: [
		{
			orderId: "order-visual-1",
			orderRef: "ORD-2026-00942",
			customerId: "אטליז-האחים-כהן",
			customerName: "אטליז האחים כהן",
			submittedAt: "2026-04-12T08:00:00.000Z",
			status: "submitted",
			estimatedTotal: 895,
			currency: "ILS",
			canCancel: true,
			items: [{ itemId: "אנטריקוט-פרימיום", itemName: "אנטריקוט פרימיום", quantity: 2, unit: "kg", lineTotal: 370 }],
		},
	],
	page: 1,
	pageSize: 6,
	total: 1,
	totalPages: 1,
	generatedAt: "2026-04-12T10:35:00.000Z",
}

let agentWebServer: ChildProcessWithoutNullStreams

test.beforeAll(async () => {
	agentWebServer = spawn(
		"pnpm",
		["--filter", "@awawda/agent-mobile", "start", "--web", "--non-interactive", "--port", "19007"],
		{
			cwd: process.cwd(),
			stdio: "pipe",
			env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
		},
	)

	await waitForServer(agentBaseUrl)
})

test.afterAll(async () => {
	if (!agentWebServer.killed) {
		agentWebServer.kill("SIGTERM")
	}

	await new Promise<void>((resolve) => {
		agentWebServer.once("exit", () => resolve())
		setTimeout(() => resolve(), 5_000)
	})
})

test.describe("agent mobile awawda visual coverage", () => {
	test.setTimeout(90_000)

	test.use({
		viewport: { width: 412, height: 884 },
		isMobile: true,
		hasTouch: true,
		locale: "he-IL",
		timezoneId: "UTC",
	})

	test("captures dashboard, customers, detail, and settings screens", async ({ page }) => {
		await stabilizeVisuals(page)
		await mockAgentApi(page)

		await page.goto(agentBaseUrl)
		await page.getByLabel("טלפון או דוא״ל").fill("agent@example.test")
		await page.getByLabel("סיסמה").fill("Password123")
		await page.getByRole("button", { name: "התחברות למערכת" }).click()

		await expect(page.getByText("ביצועים היום")).toBeVisible()
		await assertMobileAwawdaScreenshot(page, AGENT_SCREEN_TEST_IDS.dashboard, "agent-dashboard")

		await page.getByRole("button", { name: "לקוחות" }).click()
		await expect(page.getByTestId(AGENT_SCREEN_TEST_IDS.customersList)).toBeVisible()
		await assertMobileAwawdaScreenshot(page, AGENT_SCREEN_TEST_IDS.customersList, "agent-customers-list")

		await page.getByTestId("customer-list-card").first().click()
		await expect(page.getByTestId(AGENT_SCREEN_TEST_IDS.customerDetail).first()).toBeVisible()
		await assertMobileAwawdaScreenshot(page, AGENT_SCREEN_TEST_IDS.customerDetail, "agent-customer-detail")

		await page.getByRole("button", { name: "הגדרות" }).click()
		await expect(page.getByTestId(AGENT_SCREEN_TEST_IDS.settingsSync)).toBeVisible()
		await assertMobileAwawdaScreenshot(page, AGENT_SCREEN_TEST_IDS.settingsSync, "agent-settings-sync")
	})
})

async function stabilizeVisuals(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const fixed = new Date("2026-04-12T14:30:00.000Z").valueOf()
		Date.now = () => fixed
	})
	await page.emulateMedia({ reducedMotion: "reduce" })
	await page.route("https://picsum.photos/**", async (route) => {
		await route.fulfill({ status: 200, contentType: "image/svg+xml", body: stablePlaceholderSvg })
	})
}

async function assertMobileAwawdaScreenshot(page: Page, screenTestId: string, snapshotBase: string): Promise<void> {
	const screen = page.getByTestId(screenTestId).first()
	const screenshotOptions = { animations: "disabled" as const, caret: "hide" as const, scale: "css" as const }

	await expect(screen).toBeVisible()
	await expect(screen).toHaveScreenshot(`${snapshotBase}-mobile-surface.png`, { ...screenshotOptions, maxDiffPixels: 250 })
	await expect(page).toHaveScreenshot(`${snapshotBase}-mobile.png`, { ...screenshotOptions, maxDiffPixels: 500 })
}

async function mockAgentApi(page: Page): Promise<void> {
	await page.route("**/v1/agent/auth/login", async (route) => {
		await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(loginResponse) })
	})

	await page.route("**/v1/agent/customers", async (route) => {
		await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(customersResponse) })
	})

	await page.route("**/v1/agent/customers/**/approved-items", async (route) => {
		await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(approvedItemsResponse) })
	})

	await page.route("**/v1/agent/customers/**/magic-links", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				linkUrl: "https://portal.example.com/m/visual-token",
				expiresAt: "2026-04-13T10:35:00.000Z",
				expiresInSeconds: 86_400,
				lifecycle: "issued",
			}),
		})
	})

	await page.route("**/v1/agent/orders**", async (route) => {
		await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ordersResponse) })
	})

	await page.route("**/v1/agent/orders/**/cancel", async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				orderId: "order-visual-1",
				removed: true,
				status: "cancelled",
				canceledAt: "2026-04-12T10:40:00.000Z",
				mode: "testing_local_delete",
			}),
		})
	})
}

async function waitForServer(url: string): Promise<void> {
	for (let attempt = 0; attempt < 120; attempt += 1) {
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

	throw new Error("Timed out waiting for agent mobile web server: " + url)
}
