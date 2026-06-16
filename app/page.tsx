import Link from 'next/link';
import { HomeSection } from '@/components/home-section';
import { GlassPanel, Pill, SectionHeading } from '@/components/ui';
import { listPublishedPosts } from '@/lib/posts';

// 主页依赖最新已发布列表：admin 通过一条就要立刻在首页可见，
// 静态化会让发布审核操作看上去"没生效"。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HomePage() {
  const initialPage = await listPublishedPosts(12);

  return (
    <main className="mx-auto flex w-full max-w-[1680px] flex-col gap-8 px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
      <header className="relative overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,rgba(8,15,29,0.88),rgba(14,23,41,0.72))] p-6 shadow-glow backdrop-blur-xl sm:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(130,228,255,0.20),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(247,197,107,0.18),transparent_28%)]" />
        <div className="relative grid gap-6 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
          <div className="space-y-5">
            <div className="flex flex-wrap gap-3">
              <Pill tone="warning">防网暴声明</Pill>
              <Pill tone="accent">校规校纪提示</Pill>
              <Pill tone="success">先审后发</Pill>
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              校园万能墙
              <span className="block text-amber-100/90">像一块会呼吸的匿名公告板。</span>
            </h1>
            <p className="max-w-3xl text-sm leading-7 text-slate-200/85 sm:text-base">
              这是一个完全 Serverless 的校园微社区。投稿会经过敏感词拦截与管理员审核，首页采用瀑布流卡片网格，详情页支持盖楼互动，后台负责一键通过、驳回与封禁规则维护。
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-slate-200">
              <Link href="/publish" className="rounded-full bg-white px-5 py-3 font-semibold text-slate-950 transition hover:scale-[1.01]">
                去投稿
              </Link>
              <Link href="/admin" className="rounded-full border border-white/15 bg-white/6 px-5 py-3 font-semibold text-white transition hover:bg-white/10">
                管理后台
              </Link>
            </div>
          </div>

          <GlassPanel className="relative overflow-hidden p-5 sm:p-6">
            <SectionHeading
              eyebrow="校园公告看板"
              title="最新提示"
              description="顶部用来固定高优先级公告，适合防网暴声明、违规提醒、活动规则与校内通知。"
            />
            <div className="mt-5 space-y-3 text-sm leading-7 text-slate-200">
              <div className="rounded-3xl border border-white/10 bg-amber-300/10 p-4 text-amber-50">
                请勿发布人身攻击、造谣、隐私曝光、违规引战内容；所有投稿均会进入服务端审查链路。
              </div>
              <div className="rounded-3xl border border-white/10 bg-cyan-300/10 p-4 text-cyan-50">
                校园墙只保留匿名表达，不展示传统博客评论区痕迹，页面交互与视觉均按现代社交产品设计。
              </div>
            </div>
          </GlassPanel>
        </div>
      </header>

      <section>
        <div className="mb-6 flex items-end justify-between gap-4">
          <SectionHeading
            eyebrow="异步瀑布流"
            title="审核通过的投稿"
            description="支持无限滚动加载与关键词搜索，卡片采用随机渐变匿名头像、发布时间、点赞与评论入口。"
          />
          <Link href="/publish" className="hidden rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10 md:inline-flex">
            + 新投稿
          </Link>
        </div>

        <HomeSection initialPage={initialPage} />
      </section>

      <Link
        href="/publish"
        className="fixed bottom-5 right-5 z-50 rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-5 py-4 text-sm font-bold text-slate-950 shadow-2xl shadow-cyan-950/30 transition hover:scale-[1.03]"
      >
        发布投稿
      </Link>
    </main>
  );
}
