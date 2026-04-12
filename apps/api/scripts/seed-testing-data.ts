import argon2 from 'argon2'
import { PrismaClient } from '@prisma/client'

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
  { name: 'Test Agent', phone: '+972500000000', email: 'agent@meatland.test', password: 'Password123' },
  { name: 'Yossi Cohen', phone: '+972501100001', email: 'yossi.cohen@meatland.test', password: 'Password123' },
  { name: 'Maya Levi', phone: '+972501100002', email: 'maya.levi@meatland.test', password: 'Password123' },
  { name: 'Roi Ben David', phone: '+972501100003', email: 'roi.bendavid@meatland.test', password: 'Password123' },
  { name: 'Shira Azulay', phone: '+972501100004', email: 'shira.azulay@meatland.test', password: 'Password123' },
  { name: 'Eitan Mizrahi', phone: '+972501100005', email: 'eitan.mizrahi@meatland.test', password: 'Password123' },
]

const TEST_CUSTOMERS: string[] = [
  'cust-tlv-atlizh-achim-cohen',
  'cust-tlv-meatland-vip-eitan',
  'cust-rg-gourmet-deli-guri',
  'cust-jerusalem-chef-table-oren',
  'cust-haifa-smokehouse-north',
  'cust-hz-burger-lab',
  'cust-petah-tikva-coldcut-hub',
  'cust-rishon-central-market-meat',
  'cust-netanya-kosher-select',
  'cust-ashdod-port-grill',
  'cust-beersheva-desert-smoke',
  'cust-modiin-family-butcher',
  'cust-rehovot-science-park-cafe',
  'cust-raanana-premium-kitchen',
  'cust-kfar-saba-city-deli',
  'cust-holon-factory-canteen',
  'cust-bat-yam-bistro-meat',
  'cust-herzliya-marina-steak',
  'cust-zichron-butchers-club',
  'cust-ramat-hasharon-village-deli',
  'cust-hadera-farm-to-grill',
  'cust-afula-valley-protein',
  'cust-ramla-night-market',
  'cust-lod-chef-studio',
  'cust-eilat-resort-kitchen',
  'cust-nehariya-seaside-meat',
  'cust-kiryat-gat-industrial-kitchen',
  'cust-kiryat-shmona-north-warehouse',
  'cust-nazareth-galilee-meat',
  'cust-tiberias-lake-grill',
]

const TEST_CATALOG_ITEM_IDS: string[] = [
  'itm-beef-entrecote',
  'itm-beef-mince',
  'itm-lamb-ribs',
  'itm-beef-ribeye',
  'itm-beef-brisket',
  'itm-beef-tenderloin',
  'itm-beef-striploin',
  'itm-beef-short-ribs',
  'itm-beef-osso-buco',
  'itm-beef-picanha',
  'itm-lamb-chops',
  'itm-lamb-shoulder',
  'itm-lamb-shank',
  'itm-chicken-breast',
  'itm-chicken-thigh',
  'itm-chicken-drumstick',
  'itm-chicken-wing',
  'itm-chicken-whole',
  'itm-turkey-breast',
  'itm-turkey-thigh',
  'itm-sausage-merguez',
  'itm-sausage-bratwurst',
  'itm-beef-burger-patty',
  'itm-beef-smoked-brisket',
]

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
