import mysql, { ResultSetHeader } from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

export async function query<T = any>(sql: string, params?: any[]): Promise<T> {
  const [results] = await pool.execute<T>(sql, params);
  return results;
}

export type { ResultSetHeader };
