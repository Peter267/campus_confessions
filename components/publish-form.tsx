"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PostCategory } from '@/lib/types';

const categories: PostCategory[] = ['表白', '万能墙', '失物招领', '日常吐槽'];

type UploadStatus = 'idle' | 'signing' | 'uploading' | 'done' | 'error';

async function uploadToR2(file: File, signal: AbortSignal): Promise<string> {
  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type,
      size: file.size
    }),
    signal
  });
  if (!signRes.ok) {
    const payload = await signRes.json().catch(() => ({}));
    throw new Error(payload.error ?? '上传授权失败');
  }
  const sign = (await signRes.json()) as {
    uploadUrl: string;
    method: 'PUT';
    headers: Record<string, string>;
    publicUrl: string;
  };

  const putRes = await fetch(sign.uploadUrl, {
    method: sign.method,
    headers: sign.headers,
    body: file,
    signal
  });
  if (!putRes.ok) {
    throw new Error(`上传失败（HTTP ${putRes.status}）`);
  }

  return sign.publicUrl;
}

export function PublishForm() {
  const router = useRouter();
  const [alias, setAlias] = useState('匿名同学');
  const [category, setCategory] = useState<PostCategory>('万能墙');
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const uploadAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      uploadAbortRef.current?.abort();
    };
  }, []);

  const canSubmit = useMemo(
    () => content.trim().length >= 10 && !busy && uploadStatus !== 'uploading' && uploadStatus !== 'signing',
    [content, busy, uploadStatus]
  );

  async function handleFile(file: File | null) {
    if (!file) {
      uploadAbortRef.current?.abort();
      uploadAbortRef.current = null;
      setImageUrl(null);
      setImagePreview(null);
      setUploadStatus('idle');
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setImageUrl(null);
    setUploadStatus('signing');
    setMessage('');

    uploadAbortRef.current?.abort();
    const controller = new AbortController();
    uploadAbortRef.current = controller;

    try {
      const finalUrl = await uploadToR2(file, controller.signal);
      if (uploadAbortRef.current === controller) {
        setImageUrl(finalUrl);
        setUploadStatus('done');
      }
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') {
        return;
      }
      if (uploadAbortRef.current === controller) {
        setImagePreview(null);
        setUploadStatus('error');
        setMessage((error as Error).message || '图片上传失败');
      }
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    await handleFile(file);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage('');

    const response = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias, category, content, imageUrl })
    });

    const payload = await response.json();
    setBusy(false);

    if (!response.ok) {
      setMessage(payload.error ?? '投稿失败');
      return;
    }

    setMessage(payload.status === 'published' ? '投稿已直接发布' : '投稿已进入审核队列');
    router.push('/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <span className="text-sm text-slate-200">小名 / 代号</span>
          <input
            value={alias}
            onChange={(event) => setAlias(event.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/7 px-4 py-3 text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-cyan-300/50"
            placeholder="例如：晚自习逃跑者"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm text-slate-200">分类标签</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as PostCategory)}
            className="w-full rounded-2xl border border-white/10 bg-white/7 px-4 py-3 text-white outline-none transition focus:border-cyan-300/50"
          >
            {categories.map((item) => (
              <option key={item} value={item} className="bg-slate-950">
                #{item}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-sm text-slate-200">投稿内容</span>
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={8}
          className="w-full rounded-[28px] border border-white/10 bg-white/7 px-4 py-4 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-300/50"
          placeholder="写下你想发出的匿名表达，支持表白、失物招领、日常吐槽等"
        />
      </label>

      <label
        className={`group block rounded-[28px] border border-dashed p-5 transition ${dragging ? 'border-cyan-200/70 bg-cyan-400/12' : 'border-cyan-200/30 bg-cyan-400/6 hover:bg-cyan-400/10'}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => void handleDrop(event)}
      >
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
        />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-medium text-cyan-50">拖拽或点击上传图片</p>
            <p className="mt-1 text-xs text-slate-300">支持 png / jpg / webp / gif，单文件最大 5 MB，直接上传到 Cloudflare R2。</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-slate-950/40 px-4 py-3 text-xs text-slate-300">
            {uploadStatus === 'signing' && '准备上传通道…'}
            {uploadStatus === 'uploading' && '正在上传到 R2…'}
            {uploadStatus === 'done' && '图片已上传，继续提交即可'}
            {uploadStatus === 'error' && '上传失败，请重试'}
            {uploadStatus === 'idle' && (imageUrl ? '已选择图片' : '未选择图片，文字投稿也可发布')}
          </div>
        </div>
        {imagePreview ? (
          <div className="mt-4 overflow-hidden rounded-[22px] border border-white/10 bg-slate-950/40">
            <img src={imagePreview} alt="预览" className="h-72 w-full object-cover" />
          </div>
        ) : null}
      </label>

      {message ? <p className="rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-sm text-slate-100">{message}</p> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-400">内容会先经过服务端敏感词拦截与管理员审核。</p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-amber-300 to-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? '提交中...' : '发布到校园墙'}
        </button>
      </div>
    </form>
  );
}
