'use strict';

// Generates a cryptographically random SESSION_SECRET for use in .env
// Usage: npm run secret   or   node generate-hash.js

const crypto = require('crypto');
const secret = crypto.randomBytes(32).toString('hex');

console.log('\nAdd this line to your .env file:\n');
console.log(`SESSION_SECRET=${secret}`);
console.log('\n  Do NOT commit .env to version control.\n');
