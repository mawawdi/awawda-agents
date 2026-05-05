import argon2 from "argon2"
import { spawnSync } from "node:child_process"
import { PrismaClient } from "@prisma/client"

import { buildTestingCatalogItems } from "../src/catalog/data/testing-cuts-catalog"

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:55432/awawda_test?schema=public"

if (!process.env.DATABASE_URL) {
	process.env.DATABASE_URL = DEFAULT_DATABASE_URL
}

function assertUnambiguousDatabaseUrl(databaseUrl: string): void {
	const parsed = new URL(databaseUrl)
	if (parsed.hostname.trim().toLowerCase() === "localhost") {
		throw new Error(
			'DATABASE_URL must not use "localhost". Use 127.0.0.1 with an explicit port (local infra: 55432, deploy stack: 55433).',
		)
	}
}

function maskDatabaseUrl(databaseUrl: string): string {
	const parsed = new URL(databaseUrl)
	if (parsed.password.length > 0) {
		parsed.password = "***"
	}
	return parsed.toString()
}

const isProductionNodeRuntime = process.env.NODE_ENV?.trim().toLowerCase() === "production"
const isProductionHashRuntime = process.env.HASH_ENV?.trim().toLowerCase() === "production"
if (isProductionNodeRuntime || isProductionHashRuntime) {
	throw new Error("seed:testing is blocked in production runtime/config. Use only in testing or local environments.")
}

const prisma = new PrismaClient()

const TEST_AGENTS: Array<{
	name: string
	phone: string
	email: string
	password: string
	role: "FIELD_AGENT" | "SUPERVISOR"
	hashAgentId?: string
}> = [
	{ name: "Parpar", phone: "+972500000000", email: "parpar@awawda.test", password: "Password123", role: "FIELD_AGENT", hashAgentId: "test-agent-1" },
	{
		name: "Mohammed Jabarin",
		phone: "+972501100001",
		email: "mohammed.jabarin@awawda.test",
		password: "Password123",
		role: "FIELD_AGENT",
		hashAgentId: "test-agent-2",
	},
	{
		name: "Keneret",
		phone: "+972501100002",
		email: "keneret@awawda.test",
		password: "Password123",
		role: "FIELD_AGENT",
		hashAgentId: "test-agent-3",
	},
	{
		name: "Supervisor Omar",
		phone: "+972501100099",
		email: "omar@awawda.test",
		password: "Password123",
		role: "SUPERVISOR",
	},
]

const TEST_CUSTOMERS: string[] = [
	"cust-אטליז-האחים-כהן-תל-אביב",
	"cust-עואודה-פרימיום-איתן",
	"cust-מעדניית-הבשרים-גבעתיים",
	"cust-שולחן-השף-ירושלים",
	"cust-מעשנת-הכרמל-חיפה",
	"cust-מעבדת-ההמבורגר-הרצליה",
	"cust-האב-נקניקים-פתח-תקווה",
	"cust-שוק-הבשר-המרכזי-ראשון",
	"cust-בחירת-הכשר-נתניה",
	"cust-גריל-הנמל-אשדוד",
	"cust-מעשנת-המדבר-באר-שבע",
	"cust-הקצבייה-המשפחתית-מודיעין",
	"cust-קפה-פארק-המדע-רחובות",
	"cust-מטבח-פרימיום-רעננה",
	"cust-מעדניית-העיר-כפר-סבא",
	"cust-קפטריית-המפעל-חולון",
	"cust-ביסטרו-הבשר-בת-ים",
	"cust-סטייק-מרינה-הרצליה",
	"cust-מועדון-הקצבים-זכרון",
	"cust-מעדניית-הכפר-רמת-השרון",
	"cust-חווה-לגריל-חדרה",
	"cust-חלבון-העמק-עפולה",
	"cust-שוק-לילה-רמלה",
	"cust-סטודיו-שף-לוד",
	"cust-מטבח-ריזורט-אילת",
	"cust-בשר-על-הים-נהריה",
	"cust-מטבח-תעשייה-קריית-גת",
	"cust-מחסן-הצפון-קריית-שמונה",
	"cust-בשר-הגליל-נצרת",
	"cust-גריל-הכנרת-טבריה",
]

const TEST_CATALOG_ITEM_IDS: string[] = buildTestingCatalogItems().map((item) => item.itemId)

const PROFILE_STATUSES = ["ACTIVE", "INACTIVE", "ON_HOLD"] as const

if (TEST_CATALOG_ITEM_IDS.length === 0) {
	throw new Error("No testing cut images were found. Expected files under apps/api/public/testing-cuts-images.")
}

function hasLatinCustomerSlug(customerId: string): boolean {
	return /[A-Za-z]/.test(customerId.replace(/^cust-/i, ""))
}

function buildCustomerNameFromId(customerId: string): string {
	return customerId.replace(/^cust-/, "").replaceAll("-", " ")
}

function buildCustomerContactName(customerName: string): string {
	return `איש קשר ${customerName}`
}

function inferCityFromCustomerId(customerId: string): string {
	const segments = customerId.replace(/^cust-/, "").split("-")
	return segments[segments.length - 1] ?? "לא ידוע"
}

function resolveDatabaseName(databaseUrl: string): string {
	const parsed = new URL(databaseUrl)
	return decodeURIComponent(parsed.pathname.replace(/^\//, "").trim())
}

function resolveAdminDatabaseUrl(databaseUrl: string): string {
	const parsed = new URL(databaseUrl)
	parsed.pathname = "/postgres"
	return parsed.toString()
}

function quotePostgresIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`
}

async function ensureDatabaseExists(databaseUrl: string): Promise<void> {
	const targetDatabaseName = resolveDatabaseName(databaseUrl)
	if (!targetDatabaseName || targetDatabaseName.toLowerCase() === "postgres") {
		return
	}

	const adminDatabaseUrl = resolveAdminDatabaseUrl(databaseUrl)
	const adminPrisma = new PrismaClient({
		datasources: {
			db: {
				url: adminDatabaseUrl,
			},
		},
	})

	try {
		const rows = await adminPrisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_database
        WHERE datname = ${targetDatabaseName}
      ) AS "exists"
    `
		const exists = rows[0]?.exists ?? false
		if (exists) {
			return
		}

		await adminPrisma.$executeRawUnsafe(`CREATE DATABASE ${quotePostgresIdentifier(targetDatabaseName)}`)
		console.log(`Created missing database "${targetDatabaseName}".`)
	} finally {
		await adminPrisma.$disconnect()
	}
}

function runPrismaMigrateDeploy(): void {
	const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm"
	const migrate = spawnSync(pnpmCommand, ["exec", "prisma", "migrate", "deploy"], {
		stdio: "inherit",
		env: process.env,
	})

	if (migrate.status !== 0) {
		throw new Error("Failed to apply Prisma migrations before seeding testing data.")
	}
}

async function main(): Promise<void> {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is not configured.")
	}
	assertUnambiguousDatabaseUrl(process.env.DATABASE_URL)

	const targetDbName = resolveDatabaseName(process.env.DATABASE_URL)
	if (targetDbName === "awawda" && !process.env.ALLOW_SEED_PRIMARY_DB) {
		throw new Error(
			`Refusing to seed the primary database "${targetDbName}". ` +
				"Seed targets awawda_test by default. Set ALLOW_SEED_PRIMARY_DB=true to override.",
		)
	}

	console.log(`Seeding testing data into ${maskDatabaseUrl(process.env.DATABASE_URL)}`)

	await ensureDatabaseExists(process.env.DATABASE_URL)
	runPrismaMigrateDeploy()

	const agentByEmail = new Map<string, { id: string; name: string; email: string | null; phone: string }>()

	for (const agent of TEST_AGENTS) {
		const passwordHash = await argon2.hash(agent.password)
		const record = await prisma.agent.upsert({
			where: { phone: agent.phone },
			update: {
				name: agent.name,
				email: agent.email,
				passwordHash,
				role: agent.role,
				isActive: true,
				hashAgentId: agent.hashAgentId ?? null,
			},
			create: {
				name: agent.name,
				phone: agent.phone,
				email: agent.email,
				passwordHash,
				role: agent.role,
				isActive: true,
				hashAgentId: agent.hashAgentId ?? null,
			},
			select: { id: true, name: true, email: true, phone: true },
		})
		agentByEmail.set(record.email ?? agent.email, record)
	}

	const orderedAgents = Array.from(agentByEmail.values())
	const seededAgentIds = orderedAgents.map((agent) => agent.id)
	const legacyAssignments = await prisma.assignment.findMany({
		where: {
			agentId: {
				in: seededAgentIds,
			},
		},
		select: {
			hashCustomerId: true,
		},
	})
	const legacyCustomerSessions = await prisma.session.findMany({
		where: {
			hashCustomerId: {
				startsWith: "cust-",
			},
		},
		select: {
			hashCustomerId: true,
		},
	})
	const legacyCustomerOrders = await prisma.order.findMany({
		where: {
			hashCustomerId: {
				startsWith: "cust-",
			},
		},
		select: {
			hashCustomerId: true,
		},
	})
	const legacyLatinCustomerIds = [
		...legacyCustomerSessions.map((session) => session.hashCustomerId),
		...legacyCustomerOrders.map((order) => order.hashCustomerId),
	].filter((customerId) => hasLatinCustomerSlug(customerId))
	const customerIdsToReset = Array.from(
		new Set([
			...TEST_CUSTOMERS,
			...legacyAssignments.map((assignment) => assignment.hashCustomerId),
			...legacyLatinCustomerIds,
		]),
	)

	await prisma.approvedItem.deleteMany({
		where: {
			hashCustomerId: {
				in: customerIdsToReset,
			},
		},
	})

	await prisma.order.deleteMany({
		where: {
			hashCustomerId: {
				in: customerIdsToReset,
			},
		},
	})

	await prisma.session.deleteMany({
		where: {
			hashCustomerId: {
				in: customerIdsToReset,
			},
		},
	})

	await prisma.magicLink.deleteMany({
		where: {
			hashCustomerId: {
				in: customerIdsToReset,
			},
		},
	})

	await prisma.idempotencyKey.deleteMany({
		where: {
			hashCustomerId: {
				in: customerIdsToReset,
			},
		},
	})

	await prisma.customerProfile.deleteMany({
		where: {
			hashCustomerId: {
				in: customerIdsToReset,
			},
		},
	})

	await prisma.assignment.deleteMany({
		where: {
			agentId: {
				in: seededAgentIds,
			},
		},
	})

	const assignmentRows = TEST_CUSTOMERS.flatMap((customerId, index) => {
		const primary = orderedAgents[index % orderedAgents.length]
		const rows = [
			{
				agentId: primary.id,
				hashCustomerId: customerId,
			},
		]

		if (index % 3 === 0) {
			const backup = orderedAgents[(index + 1) % orderedAgents.length]
			rows.push({
				agentId: backup.id,
				hashCustomerId: customerId,
			})
		}

		return rows
	})

	await prisma.assignment.createMany({
		data: assignmentRows,
		skipDuplicates: true,
	})

	const approvedRows = TEST_CUSTOMERS.flatMap((customerId, customerIndex) => {
		const itemCount = 6 + (customerIndex % 5)
		return Array.from({ length: itemCount }, (_, itemOffset) => {
			const hashItemId = TEST_CATALOG_ITEM_IDS[(customerIndex * 3 + itemOffset) % TEST_CATALOG_ITEM_IDS.length]
			const agent = orderedAgents[(customerIndex + itemOffset) % orderedAgents.length]

			return {
				hashCustomerId: customerId,
				hashItemId,
				addedByAgentId: agent.id,
			}
		})
	})

	await prisma.approvedItem.createMany({
		data: approvedRows,
		skipDuplicates: true,
	})

	await prisma.customerProfile.createMany({
		data: TEST_CUSTOMERS.map((customerId, index) => {
			const customerName = buildCustomerNameFromId(customerId)
			return {
				hashCustomerId: customerId,
				name: customerName,
				contactName: buildCustomerContactName(customerName),
				phone: `+97252${(1000000 + index).toString().padStart(7, "0")}`,
				city: inferCityFromCustomerId(customerId),
				notes: index % 5 === 0 ? "לקוח עם עדיפות שירות גבוהה." : null,
				status: PROFILE_STATUSES[index % PROFILE_STATUSES.length],
			}
		}),
		skipDuplicates: true,
	})

	console.log("Testing data seeded successfully.")
	console.log(`Agents available: ${orderedAgents.length}`)
	console.log(`Customers available: ${TEST_CUSTOMERS.length}`)
	console.log(`Catalog item IDs referenced: ${TEST_CATALOG_ITEM_IDS.length}`)
	console.log("Default login credentials for seeded agents: Password123")
}

main()
	.catch((error) => {
		console.error("Failed to seed testing data:", error)
		process.exitCode = 1
	})
	.finally(async () => {
		await prisma.$disconnect()
	})
