import 'dotenv/config';

import postgres from 'postgres';

/** DEV ONLY: wipes all game data (keeps users/tournaments). */
async function main(): Promise<void> {
  const client = postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 1,
  });
  await client`truncate table match_players, matches restart identity cascade`;
  await client`update tournaments set status = 'open', winner_id = null`;
  console.log('Matches cleared; tournaments reopened.');
  await client.end();
}

void main();
