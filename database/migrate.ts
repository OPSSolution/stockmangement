import 'dotenv/config';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../server/db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  console.log('Running database migration...');
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
  console.log('Migration complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
