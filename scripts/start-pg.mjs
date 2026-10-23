import EmbeddedPostgres from 'embedded-postgres';
import path from 'path';
import fs from 'fs';

const dbDir = path.resolve('./.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir: dbDir,
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  persistent: true,
});

async function run() {
  const isInitialized = fs.existsSync(path.join(dbDir, 'PG_VERSION'));
  if (!isInitialized) {
    console.log('Initializing new PostgreSQL cluster in', dbDir);
    try {
      await pg.initialise();
    } catch (e) {
      console.log('PostgreSQL initialize notice:', e.message);
    }
  } else {
    console.log('PostgreSQL cluster already exists in', dbDir);
  }

  const pidFile = path.join(dbDir, 'postmaster.pid');
  let isRunning = false;
  if (fs.existsSync(pidFile)) {
    try {
      const pidContent = fs.readFileSync(pidFile, 'utf8');
      const firstLine = pidContent.split('\n')[0].trim();
      const pid = parseInt(firstLine, 10);
      if (!isNaN(pid)) {
        process.kill(pid, 0);
        isRunning = true;
        console.log(`PostgreSQL is already running on port 5432 (PID ${pid} detected).`);
      }
    } catch (e) {
      console.log('Stale postmaster.pid detected, removing stale lock before starting...');
      try {
        fs.unlinkSync(pidFile);
      } catch (err) {}
    }
  }

  if (!isRunning) {
    console.log('Starting PostgreSQL on port 5432...');
    try {
      await pg.start();
      console.log('PostgreSQL started on port 5432!');
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (msg.includes('already running') || msg.includes('EADDRINUSE') || msg.includes('postmaster.pid')) {
        console.log('PostgreSQL is already running on port 5432.');
      } else {
        throw err;
      }
    }
  }

  try {
    await pg.createDatabase('lifeos');
    console.log('Database "lifeos" created.');
  } catch (e) {
    console.log('Database "lifeos" ready or already exists.');
  }

  console.log('PostgreSQL daemon ready. Press Ctrl+C to stop.');
  setInterval(() => { }, 60000);
}

run().catch((err) => {
  console.error('Failed to start postgres:', err);
  process.exit(1);
});
