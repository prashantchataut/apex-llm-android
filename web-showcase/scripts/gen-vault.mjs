#!/usr/bin/env node
/**
 * Generates public/config/apex-vault.json (schema 3, dual envelope). Run by the owner on a trusted machine:
 *   APEX_ADMIN_PASSPHRASE=… node scripts/gen-vault.mjs --catalog ./private/catalog.json [--key "MY-OWN-KEY"] [--label "Primary master key"]
 * Without APEX_ADMIN_PASSPHRASE a strong passphrase is generated. Without --key a random `sk-apex-…` key is generated.
 * The key and the passphrase are printed ONCE to stdout and never written to disk by this script. The output file holds:
 *   keyHash                  SHA-256(salt + key)
 *   encryptedCatalogEnvelope Envelope A: AES-256-GCM(catalog) under PBKDF2(key, salt)       — opened by app users
 *   adminEncryptedKeyString  Envelope B: AES-256-GCM({key, allowed}) under PBKDF2(passphrase) — opened by /admin only
 *   adminEnvelope            AES-256-GCM(catalog) under PBKDF2(passphrase, salt)             — opened by /admin only
 */
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const catalogPath = arg("catalog");
const out = arg("out", "public/config/apex-vault.json");
const label = arg("label", "Primary master key");
if (!catalogPath) { console.error("need --catalog <plaintext catalog.json outside the repo>"); process.exit(1); }

const ITER = 200000;
const B62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const rnd62 = (n) => { let s = ""; while (s.length < n) for (const b of randomBytes(64)) if (b < 248 && s.length < n) s += B62[b % 62]; return s; };
const pass = process.env.APEX_ADMIN_PASSPHRASE ?? randomBytes(12).toString("hex").replace(/(.{4})/g, "$1-").slice(0, -1);
if (pass.length < 8) { console.error("APEX_ADMIN_PASSPHRASE must be at least 8 characters (the /admin gate minimum)"); process.exit(1); }
if (pass.length < 16) console.error("warning: passphrase shorter than 16 characters. It is the only thing between a public vault file and your key list. Prefer 16+.");
const secret = (arg("key") ?? `sk-apex-${rnd62(40)}`).trim();
if (secret.length < 8) { console.error("key must be at least 8 characters"); process.exit(1); }

const salt = randomBytes(16).toString("hex");
const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
const seal = (s, data) => {
  const key = pbkdf2Sync(s, Buffer.from(salt, "utf8"), ITER, 32, "sha256");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final(), c.getAuthTag()]);
  return Buffer.concat([iv, ct]).toString("base64");
};
const now = new Date().toISOString();
const mask = (k) => `${k.startsWith("sk-apex-") ? "sk-apex-" : ""}••••${k.slice(k.length >= 20 ? -4 : -2)}`;
const vault = {
  schema: 3, salt, kdf: { name: "PBKDF2", hash: "SHA-256", iterations: ITER }, enabled: true, updatedAt: now,
  adminEnvelope: seal(pass, catalog),
  keys: [{
    id: "key-master", label, prefix: mask(secret),
    keyHash: createHash("sha256").update(salt + secret).digest("hex"),
    encryptedCatalogEnvelope: seal(secret, catalog),
    adminEncryptedKeyString: seal(pass, { key: secret, allowed: ["*"] }),
    allowedModels: ["*"], status: "active", createdAt: now, expiresAt: null,
  }],
};
writeFileSync(out, JSON.stringify(vault, null, 2) + "\n");
console.log(JSON.stringify({ key: secret, passphrase: pass }));
