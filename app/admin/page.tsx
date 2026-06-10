import { AdminDashboard } from '@/components/admin-dashboard';
import { GlassPanel, SectionHeading } from '@/components/ui';
import { getModerationSettings, listPendingPosts, listPublishedPostsByStatus } from '@/lib/posts';

export default async function AdminPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token ?? '';
  const pendingPosts = await listPendingPosts();
  const publishedPosts = await listPublishedPostsByStatus('published');
  const settings = await getModerationSettings();

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <GlassPanel className="p-6 sm:p-8">
        <SectionHeading
          eyebrow="管理员后台"
          title="先审后发控制台"
          description="用于审核投稿、管理敏感词、封禁代号与 IP。API 层必须携带管理口令，前台仅作为操作入口。"
        />
        <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/10 px-4 py-3 text-sm text-amber-50">
          如果已设置 `ADMIN_TOKEN`，请通过查询参数 `/admin?token=你的口令` 进入操作态。
        </div>
        <div className="mt-8">
          <AdminDashboard pendingPosts={pendingPosts} publishedPosts={publishedPosts} settings={settings} token={token} />
        </div>
      </GlassPanel>
    </main>
  );
}
