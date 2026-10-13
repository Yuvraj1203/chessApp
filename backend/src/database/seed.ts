import 'dotenv/config';

import * as bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

const PASSWORD = 'Password123!';

const COACH = { email: 'coach@kingdomofchess.com', name: 'Coach Kasparov' };
const STUDENTS = [
  { email: 'aarav@kingdomofchess.com', name: 'Aarav Sharma' },
  { email: 'diya@kingdomofchess.com', name: 'Diya Patel' },
  { email: 'vihaan@kingdomofchess.com', name: 'Vihaan Gupta' },
  { email: 'ananya@kingdomofchess.com', name: 'Ananya Iyer' },
  { email: 'rohan@kingdomofchess.com', name: 'Rohan Mehta' },
  { email: 'ishita@kingdomofchess.com', name: 'Ishita Nair' },
];

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is missing');
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const people = [
    { ...COACH, role: 'coach' as const },
    ...STUDENTS.map((s) => ({ ...s, role: 'student' as const })),
  ];
  // Idempotent: re-running keeps existing rows and refreshes the password.
  for (const p of people) {
    await db
      .insert(schema.users)
      .values({ ...p, passwordHash })
      .onConflictDoUpdate({
        target: schema.users.email,
        set: { name: p.name, passwordHash, role: p.role },
      });
  }

  const [coach] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, COACH.email));

  const existing = await db.select().from(schema.tournaments);
  if (existing.length === 0) {
    const day = 24 * 60 * 60 * 1000;
    await db.insert(schema.tournaments).values([
      {
        name: 'Summer Blitz Open',
        baseMinutes: 5,
        incrementSeconds: 0,
        startsAt: new Date(Date.now() + 60 * 60 * 1000),
        status: 'open',
        createdBy: coach.id,
      },
      {
        name: 'Rapid Rumble (5+3)',
        baseMinutes: 5,
        incrementSeconds: 3,
        startsAt: new Date(Date.now() + 2 * day),
        status: 'open',
        allowRematch: true,
        createdBy: coach.id,
      },
      {
        name: 'Autumn Classic (draft)',
        baseMinutes: 10,
        incrementSeconds: 0,
        startsAt: new Date(Date.now() + 7 * day),
        status: 'draft',
        createdBy: coach.id,
      },
    ]);
  }

  console.log('Seeded. Password for every account:', PASSWORD);
  await client.end();
}

void main();
