import { Pool } from "pg";

// Next.js hot-reloads modules in dev, so cache the pool on globalThis to avoid
// opening a new connection pool on every reload.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ?? "postgres://xmas:xmas@localhost:55433/xmas",
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function query<T extends Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

/**
 * Runs `fn` inside a single transaction on one pooled connection, so a save
 * that touches many rows either lands completely or not at all. Every read and
 * write inside `fn` must go through the supplied `run`, so that it sees the
 * transaction rather than a second connection from the pool.
 */
export type Run = <T extends Record<string, unknown>>(
  text: string,
  params?: unknown[]
) => Promise<T[]>;

export async function withTransaction<T>(
  fn: (run: Run) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const run: Run = async (text, params = []) => {
      const result = await client.query(text, params);
      return result.rows;
    };
    const value = await fn(run);
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
