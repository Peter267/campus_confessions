import { AdminDashboard } from '@/components/admin-dashboard';
import { GlassPanel, SectionHeading } from '@/components/ui';
import { getAnnouncement, getModerationSettings, listAuditLogs, listCategories, listPendingPosts, listPublishedPostsByStatus } from '@/lib/posts';

// 必须强制动态：待审队列、规则面板、已发布列表都依赖最新 DB 状态，
// 若任由 Next.js 缓存，DB 写入后再刷新就会拿不到。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminPage() {
  const pendingPosts = await listPendingPosts();
  const publishedPosts = await listPublishedPostsByStatus('published');
  const settings = await getModerationSettings();
  const categories = await listCategories();
  const announcement = await getAnnouncement();
  const logs = await listAuditLogs();

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <GlassPanel className="p-6 sm:p-8">
        <SectionHeading
          eyebrow="管理员后台"
          title="审核与管理"
          description="在这里处理新投稿、维护敏感词、发布公告、整理分类，以及调整代号和 IP 的封禁列表。管理口令只存在当前浏览器会话里，不会出现在地址栏。"
        />
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
          出于安全考虑，登录入口不再接受 <code>?token=</code> 参数——它会留在浏览器历史和访问日志里。首次进入后台时，请在弹窗中输入口令即可。
        </div>
        <div className="mt-8">
          <AdminDashboard
            pendingPosts={pendingPosts}
            publishedPosts={publishedPosts}
            settings={settings}
            categories={categories}
            announcement={announcement}
            logs={logs}
          />
        </div>
      </GlassPanel>
    </main>
  );
}
