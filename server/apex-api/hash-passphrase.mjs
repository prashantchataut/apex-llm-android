// Usage:  APEX_ADMIN_PASSPHRASE='your long passphrase' node server/apex-api/hash-passphrase.mjs
// Prints the value for the ADMIN_PASSPHRASE_HASH environment variable (scrypt, random salt). The passphrase itself is
// never stored anywhere. Reset = run this again with a new passphrase and update the env var on the server.
import crypto from "node:crypto";
const pass = process.env.APEX_ADMIN_PASSPHRASE ?? "";
if (pass.length < 12) {
  console.error("Set APEX_ADMIN_PASSPHRASE to a passphrase of at least 12 characters.");
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(pass, salt, 32, { N, r, p, maxmem: 256 * 1024 * 1024 });
console.log(`scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${hash.toString("hex")}`);
