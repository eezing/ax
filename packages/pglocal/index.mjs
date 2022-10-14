#!/usr/bin/env node

import { execSync } from 'child_process';
import postgres from 'postgres';

const NAME = process.env.NAME ?? 'pglocal';
const TAG = process.env.TAG;
const RESET = process.env.RESET === 'true';

const PGHOST = process.env.PGHOST ?? 'localhost';
const PGPORT = process.env.PGPORT ?? 5432;
const PGUSER = process.env.PGUSER ?? 'jonathan';
const PGPASSWORD = process.env.PGPASSWORD ?? 'iliketurtles';
const PGDATABASE = process.env.PGDATABASE ?? 'zombie';

(async () => {
  try {
    if (PGDATABASE === 'postgres') {
      throw `PGDATABASE (database name) as "postgres" is not allowed`;
    }

    log(
      `start ${bling(
        `postgres://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}`
      )} in ${bling(NAME)} docker container`
    );
    await createContainer();
    await createDatabase();
  } catch (error) {
    throw error;
  }
})();

async function createContainer() {
  try {
    log('check for existing container...');
    execSync(`docker inspect ${NAME}`, { stdio: 'ignore' });

    log('ensure existing container is started...');
    execSync(`docker start ${NAME}`, { stdio: 'ignore' });
  } catch {
    log('run new docker container...');
    execSync(
      `docker run --name ${NAME} -p ${PGPORT}:5432 -e POSTGRES_USER=${PGUSER} -e POSTGRES_PASSWORD=${PGPASSWORD} -e POSTGRES_DB=postgres -d postgres${
        TAG ? `:${TAG}` : ''
      }`
    );
  }
}

async function createDatabase(retryCount = 0) {
  const sql = postgres({
    host: PGHOST,
    port: PGPORT,
    user: PGUSER,
    password: PGPASSWORD,
    database: 'postgres',
    onnotice: () => {},
  });

  try {
    const [existing] =
      await sql`SELECT (pg_stat_file('base/'||oid ||'/PG_VERSION')).modification created, datname FROM pg_database WHERE datname = ${PGDATABASE}`;

    if (existing) {
      if (RESET) {
        log('reset database...');
        await sql`select pg_terminate_backend(pg_stat_activity.pid) from pg_stat_activity where pid <> pg_backend_pid();`;
        await sql`drop database if exists ${sql(PGDATABASE)};`;
        await sql`create database ${sql(PGDATABASE)};`;
      } else {
        log(
          `use existing database from ${bling(
            new Date(existing.created).toLocaleString()
          )}`
        );
      }
    } else {
      log('create database...');
      await sql`create database ${sql(PGDATABASE)};`;
    }

    await sql.end();
    log('database ready');
  } catch (error) {
    await sql.end();

    if (retryCount < 30) {
      if (
        error?.message?.includes('system is starting') ||
        error?.message?.includes('ECONN')
      ) {
        if (retryCount === 0) {
          log('database server starting...');
        }
        await new Promise((res) => setTimeout(res, 100));
        return createDatabase(++retryCount);
      }
    }

    throw error;
  }
}

function bling(value) {
  return `\u001b[33m${value}\u001b[0m`;
}

function log(message, ...args) {
  console.log(
    `\u001b[36m[\u001b[34mpglocal\u001b[0m\u001b[36m]\u001b[0m ${message}`,
    ...args
  );
}
