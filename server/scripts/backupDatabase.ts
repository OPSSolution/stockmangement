// Daily backup job (run via Render cron — see render.yaml). Free-tier Supabase
// has no built-in automated backups, so this dumps every public-schema table to
// JSON, gzips it, and uploads it to a Supabase Storage bucket, then prunes
// anything older than BACKUP_RETENTION_DAYS.
import { gzipSync } from 'zlib';
import { pool } from '../db';
import { supabaseAdmin } from '../lib/supabaseEnv';

const BUCKET = 'backups';
const RETENTION_DAYS = 14;

async function dumpAllTables() {
  const { rows: tables } = await pool.query<{ table_name: string }>(
    `select table_name from information_schema.tables
     where table_schema = 'public' and table_type = 'BASE TABLE'
     order by table_name`
  );

  const data: Record<string, unknown[]> = {};
  for (const { table_name: tableName } of tables) {
    const { rows } = await pool.query(`select * from "${tableName}"`);
    data[tableName] = rows;
  }
  return data;
}

async function pruneOldBackups(supabase: NonNullable<ReturnType<typeof supabaseAdmin>>) {
  const { data: files, error } = await supabase.storage.from(BUCKET).list();
  if (error) throw error;

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const stale = (files || [])
    .filter((f) => f.created_at && new Date(f.created_at).getTime() < cutoff)
    .map((f) => f.name);

  if (stale.length > 0) {
    const { error: removeErr } = await supabase.storage.from(BUCKET).remove(stale);
    if (removeErr) throw removeErr;
  }
  return stale.length;
}

async function main() {
  const supabase = supabaseAdmin();
  if (!supabase) {
    throw new Error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — cannot run backup.');
  }

  // Idempotent — succeeds silently if the bucket already exists.
  await supabase.storage.createBucket(BUCKET, { public: false });

  console.log('Dumping tables...');
  const data = await dumpAllTables();
  const tableNames = Object.keys(data);
  const rowCount = Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
  console.log(`Dumped ${tableNames.length} tables, ${rowCount} rows total.`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `backup-${timestamp}.json.gz`;
  const payload = gzipSync(JSON.stringify({ takenAt: new Date().toISOString(), tables: tableNames, data }));

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(fileName, payload, {
    contentType: 'application/gzip',
  });
  if (uploadErr) throw uploadErr;
  console.log(`Uploaded ${fileName} (${(payload.byteLength / 1024).toFixed(1)} KB).`);

  const pruned = await pruneOldBackups(supabase);
  console.log(`Pruned ${pruned} backup(s) older than ${RETENTION_DAYS} days.`);

  await pool.end();
}

main().catch((err) => {
  console.error('Backup failed:', err);
  process.exit(1);
});
