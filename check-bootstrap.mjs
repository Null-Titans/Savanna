import 'dotenv/config';
import { createDatabase } from './server/db/database.ts';

const db = createDatabase(':memory:');

const result = db.prepare(`
  SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN role = 'platform_admin' THEN 1 ELSE 0 END) AS platformAdmins,
    SUM(CASE WHEN must_change_credentials = 1 THEN 1 ELSE 0 END) AS mustChangeCredentials
  FROM admin_accounts
`).get();

console.log('Bootstrap test results:');
console.log('Total admin accounts:', result.total);
console.log('Platform administrators:', result.platformAdmins);
console.log('Must change credentials:', result.mustChangeCredentials);

db.close();
