import { generateKeyBase64 } from './envelope.js';

// Prints one fresh key. Run once each for MASTER_KEY and SESSION_SECRET and
// paste the output into .env. The key is generated here and nowhere else;
// it is not read from or written to any store.
process.stdout.write(`${generateKeyBase64()}\n`);
