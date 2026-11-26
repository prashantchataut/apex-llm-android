#!/usr/bin/env node
/**
 * Generates public/config/apex-vault.json. Run by the owner on a trusted machine:
 *   APEX_ADMIN_PASSPHRASE=… node scripts/gen-vault.mjs --catalog ./private/catalog.json [--out public/config/apex-vault.json] [--label "Master key"]
 * The plaintext catalog is read from a file that is NOT in the repo. The master key is printed once to stdout and
 * never written to disk by this script. Only SHA-256(salt+key) and AES-256-GCM envelopes reach the output file.
 */
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const catalogPath = arg("catalog");
const out = arg("out", "public/config/apex-vault.json");
const label = arg("label", "Master key");
const pass = process.env.APEX_ADMIN_PASSPHRASE;
if (!catalogPath || !pass || pass.length < 16) { console.error("need --catalog and APEX_ADMIN_PASSPHRASE (≥16 chars)"); process.exit(1); }

const ITER = 100000;
const salt = randomBytes(16).toString("hex");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const seal = (secret, data) => {
  const key = pbkdf2Sync(secret, Buffer.from(salt, "utf8"), ITER, 32, "sha256");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final(), c.getAuthTag()]);
  return Buffer.concat([iv, ct]).toString("base64");
};
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
let body = ""; while (body.length < 40) for (const b of randomBytes(64)) { if (b < 248 && body.length < 40) body += B62[b % 62]; }
const secret = `sk-apex-${body}`;
const now = new Date().toISOString();
const vault = {
  schema: 2, salt, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITER }, enabled: true, updatedAt: now,
  adminEnvelope: seal(pass, catalog),
  keys: [{
    id: "key-master", label, prefix: `sk-apex-••••${secret.slice(-4)}`,
    keyHash: createHash("sha256").update(salt + secret).digest("hex"),
    encryptedCatalogEnvelope: seal(secret, catalog), status: "active", createdAt: now, expiresAt: null,
  }],
};
writeFileSync(out, JSON.stringify(vault, null, 2) + "\n");
console.log(secret);
