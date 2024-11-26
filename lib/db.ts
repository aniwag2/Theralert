import mysql, { ResultSetHeader, RowDataPacket, OkPacket } from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Constrain T to the valid query result types from mysql2
export async function query<T extends RowDataPacket[] | ResultSetHeader | OkPacket>(
  sql: string,
  params?: any[]
): Promise<T> {
  const [results] = await pool.execute<T>(sql, params);
  return results;
}

export type { ResultSetHeader, RowDataPacket, OkPacket };
