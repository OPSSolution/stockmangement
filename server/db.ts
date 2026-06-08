import { Pool, types } from 'pg';

// PostgreSQL returns NUMERIC/DECIMAL as strings by default — parse as float
types.setTypeParser(1700, (val) => parseFloat(val));

// Support DATABASE_URL (Render managed Postgres) or individual PG_* vars (local dev)
export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.PG_HOST || 'localhost',
        port: Number(process.env.PG_PORT) || 5432,
        database: process.env.PG_DATABASE || 'StockManagement',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
      }
);

pool.on('error', (err) => {
  console.error('Unexpected database error:', err.message);
});
