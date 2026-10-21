const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const users = await p.user.findMany({ select: { id: true, email: true, name: true, passwordHash: true, demoMode: true } });
    for (const u of users) {
      console.log(`User: ${u.email} | id: ${u.id} | hasPassword: ${!!u.passwordHash} | demoMode: ${u.demoMode}`);
    }
    if (users.length === 0) console.log('NO USERS IN DATABASE');
  } catch(e) { console.error('DB ERROR:', e.message); }
  finally { await p.$disconnect(); }
})();
