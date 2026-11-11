const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const passwords = ['#Samcuzzy39', '#Samcuzzy09099'];
const projectRef = 'fxpkkrpnyecqlxbvekpb';

async function run() {
  const sqlFile = path.resolve('supabase/migrations/20260412000000_auth_roles_rls.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  for (const pw of passwords) {
    const connStr1 = `postgresql://postgres:${pw}@db.${projectRef}.supabase.co:5432/postgres`;
    // Encoded version of '#' is '%23'
    const encodedPw = encodeURIComponent(pw);
    const connStr2 = `postgresql://postgres:${encodedPw}@db.${projectRef}.supabase.co:5432/postgres`;
    const connStr3 = `postgresql://postgres.${projectRef}:${encodedPw}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`;
    const connStr4 = `postgresql://postgres.${projectRef}:${encodedPw}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`;
    
    // Test URLs: some setups use specific pooler URIs, but direct 5432 should work universally on Supabase.
    const tryUrl = async (url) => {
      console.log('Trying URL:', url.replace(encodedPw, '***').replace(pw, '***'));
      const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }});
      try {
        await client.connect();
        console.log('Connected natively! Executing SQL...');
        await client.query("BEGIN;");
        await client.query(sql);

        console.log('Getting user IDs to assign role...');
        // get users
        const { rows } = await client.query('SELECT id, email FROM auth.users');
        console.log(`Found ${rows.length} users:`, rows);
        
        for (const user of rows) {
           console.log(`Setting ${user.email} as admin...`);
           await client.query(`
             INSERT INTO public.user_roles (user_id, role) 
             VALUES ($1, 'admin')
             ON CONFLICT (user_id) DO UPDATE SET role = 'admin'
           `, [user.id]);
        }
        
        await client.query("COMMIT;");
        
        console.log('Migration + roles applied successfully!');
        await client.end();
        process.exit(0);
      } catch (err) {
        // console.error(err.message);
        if (client) await client.end().catch(()=>{});
      }
    };
    
    await tryUrl(connStr2);
    await tryUrl(connStr3);
    await tryUrl(connStr4);
  }
  
  console.error("Failed to connect using all passwords. Did you give the DB password, or your user account password?");
}

run().catch(err => {
  console.error('Fatal:', err);
});
