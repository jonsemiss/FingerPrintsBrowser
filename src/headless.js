// Run the API without Electron. Useful for headless servers.
const { start } = require('./api');
start().catch((e) => { console.error(e); process.exit(1); });
