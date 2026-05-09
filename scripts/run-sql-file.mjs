import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

function loadEnvFile(filename) {
  const filepath = path.join(ROOT, filename);
  if (!fs.existsSync(filepath)) return;

  for (const rawLine of fs.readFileSync(filepath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();

    if (!key || process.env[key] !== undefined) continue;

    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function requiredEnvValue(name) {
  const value = process.env[name]?.trim() ?? "";
  if (!value || value.startsWith("optional-") || value.includes("your-")) {
    throw new Error(`${name} is required. Add it to .env.local before running this command.`);
  }

  return value;
}

function shouldUseSsl(connectionString) {
  if (process.env.PGSSLMODE === "disable") return false;
  return !/(@|\/\/)(localhost|127\.0\.0\.1|\[::1\])/i.test(connectionString);
}

function resolveSqlFiles(args) {
  if (args.length === 0) {
    throw new Error("Pass at least one SQL file path, for example supabase/migrations/0007_document_voids.sql");
  }

  return args.map((arg) => {
    const filepath = path.resolve(ROOT, arg);
    if (!fs.existsSync(filepath)) throw new Error(`SQL file not found: ${arg}`);
    if (path.extname(filepath).toLowerCase() !== ".sql") throw new Error(`Not a SQL file: ${arg}`);
    return filepath;
  });
}

async function main() {
  loadEnvFile(".env.local");
  loadEnvFile(".env");

  const files = resolveSqlFiles(process.argv.slice(2));
  const databaseUrl = requiredEnvValue("DATABASE_URL");
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: shouldUseSsl(databaseUrl) ? { rejectUnauthorized: false } : false,
  });

  await client.connect();

  try {
    for (const filepath of files) {
      const sql = fs.readFileSync(filepath, "utf8");
      await client.query(sql);
      console.log(`Applied ${path.relative(ROOT, filepath).replaceAll("\\", "/")}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[FAIL] SQL apply failed");
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
