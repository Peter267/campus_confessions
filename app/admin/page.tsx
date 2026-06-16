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
          title="先审后发控制台"
          description="用于审核投稿、管理敏感词、公告、分类、封禁代号与 IP。管理口令仅在浏览器会话内保存，不会写入 URL 历史。"
        />
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
          为避免口令泄露到浏览器历史与访问日志，入口不再支持 <code>?token=</code> 参数；首次操作时在弹窗中输入口令即可。
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
