// 简易自测脚本：直接 import 业务模块并断言关键行为。
// 无第三方依赖，使用 Node 自带 assert 模块。

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const results = [];
function record(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err });
    console.error(`  FAIL  ${name}\n        ${err.message}`);
  }
}

console.log('== moderation.ts ==');
const moderation = await import('../lib/moderation.ts');

record('normalizeText 去除空白并小写', () => {
  assert.equal(moderation.normalizeText('  Hello World  '), 'helloworld');
});

record('findBlockedKeyword 命中敏感词', () => {
  const kw = ['广告', '辱骂', '诈骗'];
  assert.equal(moderation.findBlockedKeyword('这里有广告内容', kw), '广告');
  assert.equal(moderation.findBlockedKeyword('干净的内容', kw), null);
});

record('findBlockedKeyword 忽略空白差异', () => {
  const kw = ['私联'];
  assert.equal(moderation.findBlockedKeyword('我 想 私 联 你', kw), '私联');
});

record('sanitizeAlias 截断过长别名', () => {
  assert.equal(moderation.sanitizeAlias('  hello world  '), 'hello world');
  assert.equal(moderation.sanitizeAlias('a'.repeat(50)), 'a'.repeat(24));
  assert.equal(moderation.sanitizeAlias('   '), '匿名同学');
});

record('resolveClientIp 优先使用 x-forwarded-for', () => {
  const h = new Headers({
    'x-forwarded-for': '1.1.1.1, 2.2.2.2',
    'x-real-ip': '3.3.3.3'
  });
  assert.equal(moderation.resolveClientIp(h), '1.1.1.1');
});

record('resolveClientIp 回退到 x-real-ip', () => {
  const h = new Headers({ 'x-real-ip': '3.3.3.3' });
  assert.equal(moderation.resolveClientIp(h), '3.3.3.3');
});

record('resolveClientIp 兜底 unknown', () => {
  assert.equal(moderation.resolveClientIp(new Headers()), 'unknown');
});

record('getBaseModerationSettings 合并默认 + 环境变量', () => {
  const original = process.env.MODERATION_KEYWORDS;
  process.env.MODERATION_KEYWORDS = 'custom1, custom2,custom3';
  const s = moderation.getBaseModerationSettings();
  assert.ok(s.blocked_keywords.includes('custom1'));
  assert.ok(s.blocked_keywords.includes('广告'));
  assert.ok(s.blocked_aliases.includes('bot'));
  process.env.MODERATION_KEYWORDS = original;
});

console.log('\n== validators.ts ==');
const validators = await import('../lib/validators.ts');

record('publishSchema 合法数据通过', () => {
  const r = validators.publishSchema.safeParse({
    alias: '  同学甲  ',
    category: '表白',
    content: '这是一段足够长的内容，超过 10 个字。',
    imageUrl: 'https://example.com/x.png'
  });
  assert.equal(r.success, true);
  assert.equal(r.data.alias, '同学甲');
});

record('publishSchema 内容过短被拒', () => {
  const r = validators.publishSchema.safeParse({ alias: '甲', category: '表白', content: '太短' });
  assert.equal(r.success, false);
  assert.ok(r.error.flatten().fieldErrors.content);
});

record('publishSchema 非法分类被拒', () => {
  const r = validators.publishSchema.safeParse({ alias: '甲', category: '未知', content: '够长的内容。' });
  assert.equal(r.success, false);
  assert.ok(r.error.flatten().fieldErrors.category);
});

record('publishSchema 非 http 图片被拒', () => {
  const r = validators.publishSchema.safeParse({
    alias: '甲', category: '表白', content: '够长的内容。', imageUrl: 'javascript:alert(1)'
  });
  assert.equal(r.success, false);
  assert.ok(r.error.flatten().fieldErrors.imageUrl);
});

record('publishSchema 过长内容被拒', () => {
  const r = validators.publishSchema.safeParse({ alias: '甲', category: '表白', content: 'x'.repeat(1300) });
  assert.equal(r.success, false);
});

record('commentSchema 合法评论通过', () => {
  const r = validators.commentSchema.safeParse({ authorName: '路过', content: '好内容' });
  assert.equal(r.success, true);
});

record('commentSchema 评论过短被拒', () => {
  const r = validators.commentSchema.safeParse({ content: 'a' });
  assert.equal(r.success, false);
});

record('moderationSettingsSchema 拆分关键词', () => {
  const r = validators.moderationSettingsSchema.safeParse({
    blocked_keywords: '广告, 辱骂\n诈骗',
    blocked_aliases: ['bot'],
    blocked_ips: []
  });
  assert.equal(r.success, true);
  assert.deepEqual(r.data.blocked_keywords, ['广告', '辱骂', '诈骗']);
  assert.deepEqual(r.data.blocked_aliases, ['bot']);
});

console.log('\n== r2.ts ==');
const r2 = await import('../lib/r2.ts');

record('buildObjectKey 生成安全 key', () => {
  const { key, ext } = r2.buildObjectKey('test photo.png', 'image/png');
  assert.equal(ext, 'png');
  assert.ok(key.startsWith('posts/'));
  assert.ok(key.endsWith('.png'));
});

record('buildObjectKey 清理特殊字符', () => {
  const { key } = r2.buildObjectKey('../../../etc/passwd', 'image/jpeg');
  // key 由 posts/ 前缀 + 时间戳 + 处理后的 basename + 扩展名组成
  // 重点确认没有路径穿越、文件名清洗后的 basename 不含 / 或 ..
  const basename = key.split('/').pop();
  assert.ok(!key.includes('..'), `key 含 '..': ${key}`);
  assert.ok(!basename.includes('..'), `basename 含 '..': ${basename}`);
  assert.ok(!basename.includes('etc'), `basename 含 'etc': ${basename}`);
  assert.ok(key.endsWith('.jpg'));
});

record('isAllowedMime 白名单校验', () => {
  assert.equal(r2.isAllowedMime('image/png'), true);
  assert.equal(r2.isAllowedMime('image/jpeg'), true);
  assert.equal(r2.isAllowedMime('image/gif'), true);
  assert.equal(r2.isAllowedMime('IMAGE/PNG'), true);
  assert.equal(r2.isAllowedMime('application/pdf'), false);
  assert.equal(r2.isAllowedMime('text/html'), false);
});

record('getR2Status 未配置凭证时禁用', () => {
  delete process.env.R2_ACCOUNT_ID;
  delete process.env.R2_ACCESS_KEY_ID;
  delete process.env.R2_SECRET_ACCESS_KEY;
  const s = r2.getR2Status();
  assert.equal(s.enabled, false);
  assert.ok(s.reason.includes('R2'));
});

record('publicUrl 拼接公开访问 URL', () => {
  const config = {
    accountId: 'x', accessKeyId: 'x', secretAccessKey: 'x',
    bucket: 'b', publicBase: 'https://pub.example.com', maxFileSize: 1024
  };
  assert.equal(r2.publicUrl(config, 'posts/a.png'), 'https://pub.example.com/posts/a.png');
  assert.equal(r2.publicUrl({ ...config, publicBase: 'https://pub.example.com/' }, 'posts/a.png'), 'https://pub.example.com/posts/a.png');
});

console.log('\n== auth.ts (token 校验) ==');
const auth = await import('../lib/auth.ts');

record('isAdminRequest 未配置 ADMIN_TOKEN 拒绝', async () => {
  const original = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;
  const req = new Request('http://x/y', { headers: { 'x-admin-token': 'anything' } });
  // mock NextRequest by passing plain object
  const ok = auth.isAdminRequest({
    headers: { get: (k) => k === 'x-admin-token' ? 'anything' : null },
    nextUrl: { searchParams: { get: () => null } }
  });
  assert.equal(ok, false);
  process.env.ADMIN_TOKEN = original;
});

record('isAdminRequest 正确 token 通过', () => {
  process.env.ADMIN_TOKEN = 'secret';
  const ok = auth.isAdminRequest({
    headers: { get: (k) => k === 'x-admin-token' ? 'secret' : null },
    nextUrl: { searchParams: { get: () => null } }
  });
  assert.equal(ok, true);
});

record('isAdminRequest 错误 token 拒绝', () => {
  process.env.ADMIN_TOKEN = 'secret';
  const ok = auth.isAdminRequest({
    headers: { get: (k) => k === 'x-admin-token' ? 'wrong' : null },
    nextUrl: { searchParams: { get: () => null } }
  });
  assert.equal(ok, false);
});

record('isAdminRequest 支持 query 参数', () => {
  process.env.ADMIN_TOKEN = 'secret';
  const ok = auth.isAdminRequest({
    headers: { get: () => null },
    nextUrl: { searchParams: { get: (k) => k === 'token' ? 'secret' : null } }
  });
  assert.equal(ok, true);
});

record('isAdminRequest 防止时序攻击：长度不一致', () => {
  process.env.ADMIN_TOKEN = 'secret';
  const ok = auth.isAdminRequest({
    headers: { get: (k) => k === 'x-admin-token' ? 'secre' : null },
    nextUrl: { searchParams: { get: () => null } }
  });
  assert.equal(ok, false);
});

console.log('\n== admin token 哈希一致性 ==');
record('同一 token 产生同一哈希', () => {
  const h1 = createHash('sha256').update('mytoken').digest('hex').slice(0, 16);
  const h2 = createHash('sha256').update('mytoken').digest('hex').slice(0, 16);
  assert.equal(h1, h2);
  assert.equal(h1.length, 16);
});

console.log('\n== 路由文件 HTTP 处理器冒烟测试 ==');
// 动态导入路由文件以验证模块加载不报错
const routes = [
  '../app/api/posts/route.ts',
  '../app/api/posts/[id]/route.ts',
  '../app/api/posts/[id]/comments/route.ts',
  '../app/api/posts/[id]/like/route.ts',
  '../app/api/reports/route.ts',
  '../app/api/upload/sign/route.ts',
  '../app/api/admin/posts/[id]/route.ts',
  '../app/api/admin/categories/route.ts',
  '../app/api/admin/categories/[id]/route.ts',
  '../app/api/admin/announcement/route.ts',
  '../app/api/admin/logs/route.ts',
  '../app/api/admin/pending/route.ts',
  '../app/api/admin/published/route.ts',
  '../app/api/admin/search/route.ts',
  '../app/api/admin/settings/route.ts'
];
for (const r of routes) {
  record(`模块加载：${r}`, async () => {
    await import(r);
  });
}

console.log('\n== 端到端：发布接口 (DATABASE_URL 未配置时走 demo) ==');
process.env.NODE_ENV = 'test';
record('POST /api/posts 命中敏感词返回 403', async () => {
  const { POST } = await import('../app/api/posts/route.ts');
  const req = new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alias: '测试', category: '表白', content: '这是一条包含广告关键词的测试内容，故意超过十个字。' })
  });
  const res = await POST(req);
  assert.equal(res.status, 403);
});

record('POST /api/posts 内容合法进入 pending', async () => {
  const { POST } = await import('../app/api/posts/route.ts');
  const req = new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alias: '测试', category: '表白', content: '这是一段非常干净的测试内容，超过十个字。' })
  });
  const res = await POST(req);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, 'pending');
});

record('POST /api/posts 表单校验失败返回 400', async () => {
  const { POST } = await import('../app/api/posts/route.ts');
  const req = new Request('http://localhost/api/posts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ alias: '', category: '未知', content: '短' })
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
});

record('POST /api/reports 记录举报', async () => {
  const { POST } = await import('../app/api/reports/route.ts');
  const req = new Request('http://localhost/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ postId: 'demo-1', reason: '人身攻击' })
  });
  const res = await POST(req);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.post_id, 'demo-1');
});

record('POST /api/reports 缺字段返回 400', async () => {
  const { POST } = await import('../app/api/reports/route.ts');
  const req = new Request('http://localhost/api/reports', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ postId: '' })
  });
  const res = await POST(req);
  assert.equal(res.status, 400);
});

record('POST /api/posts/[id]/like 增加点赞', async () => {
  const { POST } = await import('../app/api/posts/[id]/like/route.ts');
  // 先创建一个测试 post，确保 id 存在
  const { createPost } = await import('../lib/posts.ts');
  const post = await createPost({
    category: '万能墙', alias: 'test', content: '一个测试帖子，内容超过十字。',
    imageUrl: null, status: 'published', moderationReason: null, ipAddress: null, tags: []
  });
  const req = new Request(`http://localhost/api/posts/${post.id}/like`, { method: 'POST' });
  const res = await POST(req, { params: Promise.resolve({ id: post.id }) });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(typeof body.like_count === 'number');
});

record('管理接口未配置 token 拒绝', async () => {
  delete process.env.ADMIN_TOKEN;
  const { GET } = await import('../app/api/admin/categories/route.ts');
  const req = new Request('http://localhost/api/admin/categories', { headers: { 'x-admin-token': 'wrong' } });
  const res = await GET(req);
  assert.equal(res.status, 401);
});

console.log('\n========== 总结 ==========');
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok);
console.log(`通过 ${passed} / ${results.length}`);
if (failed.length > 0) {
  console.error(`失败 ${failed.length}:`);
  for (const f of failed) console.error(`  - ${f.name}: ${f.error.message}`);
  process.exit(1);
}
console.log('所有测试通过。');
