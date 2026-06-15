import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DetailClient } from '@/components/detail-client';
import { GlassPanel, Pill, SectionHeading } from '@/components/ui';
import { getPostById, listComments } from '@/lib/posts';

export default async function PostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPostById(id);

  if (!post || post.status !== 'published') {
    notFound();
  }

  const comments = await listComments(post.id);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-5 flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-300 transition hover:text-white">
          ← 返回首页
        </Link>
        <Pill tone="accent">动态详情页</Pill>
      </div>

      <GlassPanel className="p-6 sm:p-8">
        <SectionHeading
          eyebrow="帖子详情"
          title="单条校园墙"
          description="独立展示原图、正文和盖楼互动区，整体视觉尽量像现代社交内容页，而不是传统评论楼层。"
        />
        <div className="mt-8">
          <DetailClient post={post} comments={comments} />
        </div>
      </GlassPanel>
    </main>
  );
}
