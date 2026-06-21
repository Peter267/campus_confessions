import Link from 'next/link';
import { HomeSection } from '@/components/home-section';
import { AnnouncementSidebar } from '@/components/announcement-sidebar';
import { CategoryNav } from '@/components/category-nav';
import { UserMenu } from '@/components/auth/user-menu';
import { listPublishedPosts, getAnnouncement, listCategories } from '@/lib/posts';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage({
  searchParams
}: {
  searchParams: Promise<{ category?: string | null; q?: string | null }>;
}) {
  const params = await searchParams;
  const category = typeof params.category === 'string' && params.category.trim() ? params.category.trim() : null;
  const initialPage = await listPublishedPosts(12, undefined, category);
  const announcement = await getAnnouncement();
  const categories = await listCategories();
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-0 px-0 sm:px-4 lg:px-6">
      {/* Slim banner - Flarum style */}
      <header className="flex items-center justify-between gap-4 border-b border-white/8 bg-[#0b1527]/80 px-4 py-3 backdrop-blur-xl sm:px-6 sm:py-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-lg font-semibold text-white sm:text-xl">
              校园万能墙
            </h1>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/publish" className="rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white sm:px-4 sm:py-2 sm:text-sm">
            发布
          </Link>
          <UserMenu initialUser={user} />
          <Link href="/admin" className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 sm:px-4 sm:py-2 sm:text-sm">
            管理
          </Link>
        </div>
      </header>

      {/* Category nav bar */}
      <CategoryNav categories={categories} currentCategory={category} />

      {/* Main content area with sidebar */}
      <div className="flex flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:px-8 lg:py-6">
        {/* Main feed */}
        <div className="min-w-0 flex-1">
          <HomeSection
            initialPage={initialPage}
            categories={categories}
            category={category}
          />
        </div>

        {/* Sidebar - hidden on mobile, shown on lg+ */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-4 space-y-4">
            <AnnouncementSidebar announcement={announcement} />
          </div>
        </aside>
      </div>

      {/* Mobile FAB */}
      <Link
        href="/publish"
        className="fixed bottom-5 right-5 z-50 rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 shadow-2xl shadow-cyan-950/30 transition hover:scale-[1.03] lg:hidden"
      >
        发布
      </Link>
    </main>
  );
}
