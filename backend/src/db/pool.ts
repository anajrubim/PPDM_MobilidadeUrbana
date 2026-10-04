import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = Pick<pg.Pool, 'query'>;

// int8 (COUNT, SUM) como number — os valores deste domínio cabem em 2^53
pg.types.setTypeParser(20, (v) => Number(v));
pg.types.setTypeParser(1700, (v) => Number(v));

export function createPool(connectionString: string): Db {
  return new pg.Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Uma consulta ou transação travada não pode segurar a fila do pool
    statement_timeout: 20_000,
    idle_in_transaction_session_timeout: 30_000,
  });
}

export async function withTransaction<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
