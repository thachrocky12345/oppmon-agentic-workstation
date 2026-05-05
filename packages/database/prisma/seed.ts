import { PrismaClient, Role, TeamRole, AgentStatus } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Create default tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Tenant",
      slug: "default",
      isActive: true,
    },
  });
  console.log(`✅ Created tenant: ${tenant.name}`);

  // Create admin user
  const passwordHash = await bcrypt.hash("admin123", 10);
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@arkon.dev" },
    update: {},
    create: {
      email: "admin@arkon.dev",
      name: "Admin User",
      passwordHash,
      role: Role.TENANT_ADMIN,
      tenantId: tenant.id,
      isActive: true,
    },
  });
  console.log(`✅ Created admin user: ${adminUser.email}`);

  // Create default team
  const team = await prisma.team.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Engineering",
      },
    },
    update: {},
    create: {
      name: "Engineering",
      tenantId: tenant.id,
    },
  });
  console.log(`✅ Created team: ${team.name}`);

  // Add admin to team
  await prisma.teamMember.upsert({
    where: {
      userId_teamId: {
        userId: adminUser.id,
        teamId: team.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      teamId: team.id,
      role: TeamRole.ADMIN,
    },
  });
  console.log(`✅ Added admin to team`);

  // Create sample agent
  const agent = await prisma.agent.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "gateway-agent-01",
      },
    },
    update: {},
    create: {
      name: "gateway-agent-01",
      description: "Primary AI Gateway Agent",
      status: AgentStatus.ACTIVE,
      tenantId: tenant.id,
      teamId: team.id,
      config: {
        model: "gpt-4",
        maxTokens: 4096,
        rateLimit: 100,
      },
      lastSeen: new Date(),
    },
  });
  console.log(`✅ Created agent: ${agent.name}`);

  console.log("🎉 Seeding complete!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
