// scripts/migrate-to-authjs.mjs
// ---------------------------------------------------------------------------
// 一次性迁移脚本：把现有自研鉴权层表结构切换到 Auth.js v5 标准
//
// 执行方式：
//   DATABASE_URL=postgres://... node scripts/migrate-to-authjs.mjs
//   DATABASE_URL=postgres://... node scripts/migrate-to-authjs.mjs --dry-run
//
// 行为：
//   1. 备份 users 表（仅打印条数，不真正导出，DB 自身可由快照恢复）
//   2. DROP 旧 sessions / verification_codes / password_resets 表
//   3. CREATE 新 accounts / sessions / verification_tokens 表
//   4. users 表不动（保留所有用户、密码 hash、邮箱等）
//
// 安全特性：
//   - 默认 dry-run 模式，只打印将要执行的 SQL
//   - 加 --execute 才会真正执行
// ---------------------------------------------------------------------------

import { neon } from '@neondatabase/serverless';

const databaseUrl = process.env.DATABASE_URL;
const isDryRun = !process.argv.includes('--execute');

if (!databaseUrl) {
  console.error('错误：DATABASE_URL 未设置');
  process.exit(1);
}

const sql = neon(databaseUrl);

const DDL = [
  // 1. DROP 旧表（含数据，由用户授权）
  `DROP TABLE IF EXISTS sessions CASCADE`,
  `DROP TABLE IF EXISTS verification_codes CASCADE`,
  `DROP TABLE IF EXISTS password_resets CASCADE`,

  // 2. CREATE 新 accounts 表（OAuth 用，预留）
  `CREATE TABLE IF NOT EXISTS accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    type text not null,
    provider text not null,
    provider_account_id text not null,
    refresh_token text,
    access_token text,
    expires_at bigint,
    token_type text,
    scope text,
    id_token text,
    session_state text,
    constraint accounts_provider_unique unique (provider, provider_account_id)
  )`,
  `CREATE INDEX IF NOT EXISTS accounts_user_id_idx ON accounts (user_id)`,

  // 3. CREATE 新 sessions 表（Auth.js 标准 schema）
  `CREATE TABLE IF NOT EXISTS sessions (
    session_token text primary key,
    user_id uuid not null references users(id) on delete cascade,
    expires timestamptz not null
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`,
  `CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires)`,

  // 4. CREATE verification_tokens 表
  `CREATE TABLE IF NOT EXISTS verification_tokens (
    identifier text not null,
    token text not null,
    expires timestamptz not null,
    primary key (identifier, token)
  )`,
  `CREATE INDEX IF NOT EXISTS verification_tokens_expires_idx ON verification_tokens (expires)`
];

async function main() {
  console.log(`\n=== Auth.js 迁移 (${isDryRun ? 'DRY-RUN' : 'EXECUTE'}) ===\n`);

  // 备份检查
  try {
    const userCount = await sql`SELECT count(*)::int AS cnt FROM users`;
    console.log(`当前 users 表记录数: ${userCount[0]?.cnt ?? 0}（不会修改此表）`);

    const oldSessionCount = await sql`SELECT count(*)::int AS cnt FROM sessions`;
    console.log(`旧 sessions 表记录数: ${oldSessionCount[0]?.cnt ?? 0}（将被 DROP）`);
  } catch (err) {
    console.warn(`备份检查警告: ${err.message}`);
  }

  console.log('\n将执行的 SQL:');
  DDL.forEach((stmt, i) => console.log(`  [${i + 1}] ${stmt.replace(/\s+/g, ' ').slice(0, 100)}...`));

  if (isDryRun) {
    console.log('\n>>> DRY-RUN 模式，未执行任何变更。');
    console.log('>>> 加 --execute 参数后才会真正执行。');
    return;
  }

  console.log('\n开始执行迁移...');
  for (const stmt of DDL) {
    try {
      await sql.unsafe(stmt);
      console.log(`  ✓ ${stmt.replace(/\s+/g, ' ').slice(0, 80)}`);
    } catch (err) {
      console.error(`  ✗ 失败: ${stmt.replace(/\s+/g, ' ').slice(0, 80)}`);
      console.error(`    错误: ${err.message}`);
      throw err;
    }
  }

  console.log('\n迁移完成。users 表数据完整保留，所有用户需重新登录。');
}

main().catch((err) => {
  console.error('\n迁移失败:', err);
  process.exit(1);
});
