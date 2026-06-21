import { AdminDashboard } from '@/components/admin-dashboard';
import { GlassPanel, SectionHeading } from '@/components/ui';
import { getAnnouncement, getModerationSettings, listAuditLogs, listCategories, listPendingPosts, listPublishedPostsByStatus, listReports } from '@/lib/posts';

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
  const reports = await listReports();

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <GlassPanel className="p-6 sm:p-8">
        <SectionHeading
          eyebrow="管理员后台"
          title="审核与管理"
        />
        <div className="mt-8">
          <AdminDashboard
            pendingPosts={pendingPosts}
            publishedPosts={publishedPosts}
            settings={settings}
            categories={categories}
            announcement={announcement}
            logs={logs}
            reports={reports}
          />
        </div>
      </GlassPanel>
    </main>
  );
}
