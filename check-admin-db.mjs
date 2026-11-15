import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const configured = process.env.DATABASE_PATH || 'data/savanna.db';
const dbPath = path.resolve(process.cwd(), configured);

console.log('Working directory:', process.cwd());
console.log('Database path:', dbPath);
console.log('Database exists:', fs.existsSync(dbPath));

if (fs.existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN role = 'platform_admin' THEN 1 ELSE 0 END) AS platformAdmins
    FROM admin_accounts
  `).get();

  console.log('Total admin accounts:', row.total);
  console.log('Platform administrators:', row.platformAdmins);
  db.close();
}
