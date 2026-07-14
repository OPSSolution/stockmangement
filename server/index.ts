import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import authRouter from './routes/auth';
import apiRouter from './routes/api';
import rolesRouter, { ensureRolesTable } from './routes/roles';
import functionsRouter from './routes/functions';
import { databaseConfigIssue, pool } from './db';
import { supabaseAdmin } from './lib/supabaseEnv';
import { dispatchPendingNotifications } from './lib/notificationDispatch';
import { evaluateAlertRules } from './lib/alertRulesEvaluator';
import { checkStockAlerts } from './lib/stockAlerts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

async function runMigration() {
  try {
    const schema = readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf-8');
    await pool.query(schema);
    console.log('Database migration complete.');
  } catch (err: any) {
    console.error('Migration error (continuing):', err.message);
  }
}

app.use(cors({
  origin: isProd ? true : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/api/roles', rolesRouter);
app.use('/api', apiRouter);
app.use('/functions/v1', functionsRouter);

app.get('/health', async (_req, res) => {
  if (databaseConfigIssue) {
    return res.status(503).json({ status: 'error', database: databaseConfigIssue });
  }

  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err: any) {
    res.status(503).json({ status: 'error', database: err.message });
  }
});

// In production, serve the built React app and SPA fallback
if (isProd) {
  const staticDir = path.join(__dirname, '..', 'out');
  app.use(express.static(staticDir));
  app.get('*', (_req, res) => res.sendFile(path.join(staticDir, 'index.html')));
}

// Start immediately — migration/table setup runs in background so Render health check never times out
app.listen(PORT, () => console.log(`Server running on port ${PORT}${isProd ? '' : ' (development)'}`));
ensureRolesTable().catch(err => console.error('Failed to ensure roles table:', err.message));
if (isProd) runMigration();

// Background notification scheduling — this server process stays up
// continuously on Render, so plain intervals give the settings page's
// "runs automatically" claims a real backing instead of only firing when
// someone clicks the manual buttons.
const admin = supabaseAdmin();
if (admin) {
  setInterval(() => {
    dispatchPendingNotifications(admin).catch(err => console.error('Scheduled dispatch failed:', err.message));
  }, 5 * 60 * 1000);
  setInterval(() => {
    evaluateAlertRules(admin).catch(err => console.error('Scheduled alert rule evaluation failed:', err.message));
  }, 10 * 60 * 1000);
  setInterval(() => {
    checkStockAlerts(admin).catch(err => console.error('Scheduled stock alert check failed:', err.message));
  }, 5 * 60 * 1000);
  console.log('Notification scheduler started (dispatch every 5m, rule evaluation every 10m, stock alerts every 5m).');
} else {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not set — background notification scheduling is disabled.');
}
