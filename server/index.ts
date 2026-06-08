import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth';
import apiRouter from './routes/api';
import functionsRouter from './routes/functions';
import { pool } from './db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// Render injects PORT; fall back to SERVER_PORT for local dev
const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
const isProd = process.env.NODE_ENV === 'production';

app.use(cors({
  origin: isProd ? true : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  credentials: true,
}));
app.use(express.json());

app.use('/auth', authRouter);
app.use('/api', apiRouter);
app.use('/functions/v1', functionsRouter);

app.get('/health', async (_req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${isProd ? 'production' : 'development'})`);
});
