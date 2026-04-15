import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'

import { buildTestingCatalogItems } from '../src/catalog/data/testing-cuts-catalog'

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/meatland?schema=public'
}

const prisma = new PrismaClient()

const TEST_AGENTS: Array<{
  name: string
  phone: string
  email: string
  password: string
}> = [
  { name: 'Parpar', phone: '+972500000000', email: 'parpar@meatland.test', password: 'Password123' },
  { name: 'Mohammed Jabarin', phone: '+972501100001', email: 'mohammed.jabarin@meatland.test', password: 'Password123' },
  { name: 'Keneret', phone: '+972501100002', email: 'keneret@meatland.test', password: 'Password123' },
]

const TEST_CUSTOMERS: string[] = [
  'cust-אטליז-האחים-כהן-תל-אביב',
  'cust-מיטלנד-פרימיום-איתן',
  'cust-מעדניית-הבשרים-גבעתיים',
  'cust-שולחן-השף-ירושלים',
  'cust-מעשנת-הכרמל-חיפה',
  'cust-מעבדת-ההמבורגר-הרצליה',
  'cust-האב-נקניקים-פתח-תקווה',
  'cust-שוק-הבשר-המרכזי-ראשון',
  'cust-בחירת-הכשר-נתניה',
  'cust-גריל-הנמל-אשדוד',
  'cust-מעשנת-המדבר-באר-שבע',
  'cust-הקצבייה-המשפחתית-מודיעין',
  'cust-קפה-פארק-המדע-רחובות',
  'cust-מטבח-פרימיום-רעננה',
  'cust-מעדניית-העיר-כפר-סבא',
  'cust-קפטריית-המפעל-חולון',
  'cust-ביסטרו-הבשר-בת-ים',
  'cust-סטייק-מרינה-הרצליה',
  'cust-מועדון-הקצבים-זכרון',
  'cust-מעדניית-הכפר-רמת-השרון',
  'cust-חווה-לגריל-חדרה',
  'cust-חלבון-העמק-עפולה',
  'cust-שוק-לילה-רמלה',
  'cust-סטודיו-שף-לוד',
  'cust-מטבח-ריזורט-אילת',
  'cust-בשר-על-הים-נהריה',
  'cust-מטבח-תעשייה-קריית-גת',
  'cust-מחסן-הצפון-קריית-שמונה',
  'cust-בשר-הגליל-נצרת',
  'cust-גריל-הכנרת-טבריה',
]

const TEST_CATALOG_ITEM_IDS: string[] = buildTestingCatalogItems().map((item) => item.itemId)

if (TEST_CATALOG_ITEM_IDS.length === 0) {
  throw new Error('No testing cut images were found. Expected files under apps/api/public/testing-cuts-images.')
}

function hasLatinCustomerSlug(customerId: string): boolean {
  return /[A-Za-z]/.test(customerId.replace(/^cust-/i, ''))
}

async function main(): Promise<void> {
  const agentByEmail = new Map<string, { id: string; name: string; email: string; phone: string }>()

  for (const agent of TEST_AGENTS) {
    const passwordHash = await argon2.hash(agent.password)
    const record = await prisma.agent.upsert({
      where: { phone: agent.phone },
      update: {
        name: agent.name,
        email: agent.email,
        passwordHash,
        isActive: true,
      },
      create: {
        name: agent.name,
        phone: agent.phone,
        email: agent.email,
        passwordHash,
        isActive: true,
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
        startsWith: 'cust-',
      },
    },
    select: {
      hashCustomerId: true,
    },
  })
  const legacyCustomerOrders = await prisma.order.findMany({
    where: {
      hashCustomerId: {
        startsWith: 'cust-',
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

  console.log('Testing data seeded successfully.')
  console.log(`Agents available: ${orderedAgents.length}`)
  console.log(`Customers available: ${TEST_CUSTOMERS.length}`)
  console.log(`Catalog item IDs referenced: ${TEST_CATALOG_ITEM_IDS.length}`)
  console.log('Default login credentials for seeded agents: Password123')
}

main()
  .catch((error) => {
    console.error('Failed to seed testing data:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
