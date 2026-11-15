import 'dotenv/config';

console.log('Working directory:', process.cwd());
console.log('Admin username loaded:', Boolean(process.env.FORM_BUILDER_ADMIN_USERNAME?.trim()));
console.log('Initial password loaded:', Boolean(process.env.FORM_BUILDER_INITIAL_PASSWORD));
console.log('Database path loaded:', Boolean(process.env.DATABASE_PATH));
console.log('Username length:', process.env.FORM_BUILDER_ADMIN_USERNAME?.trim().length || 0);
console.log('Password length:', process.env.FORM_BUILDER_INITIAL_PASSWORD?.length || 0);
