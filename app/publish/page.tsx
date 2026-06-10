import Link from 'next/link';
import { PublishForm } from '@/components/publish-form';
import { GlassPanel, SectionHeading } from '@/components/ui';

export default function PublishPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-300 transition hover:text-white">
          ← 返回首页
        </Link>
        <Link href="/admin" className="rounded-full border border-white/10 bg-white/6 px-4 py-2 text-sm text-slate-100 transition hover:bg-white/10">
          管理入口
        </Link>
      </div>

      <GlassPanel className="p-6 sm:p-8">
        <SectionHeading
          eyebrow="投稿页"
          title="把想说的话贴到墙上"
          description="支持内容输入、分类标签、图片预览与服务端敏感词拦截。当前版本使用 data URL 作为演示式图片存储，后续可替换为 Supabase Storage 或 Vercel Blob。"
        />
        <div className="mt-8">
          <PublishForm />
        </div>
      </GlassPanel>
    </main>
  );
}
