import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '校园万能墙',
  description: '基于 Vercel Serverless 的校园微社区与匿名墙系统',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="page-grid min-h-screen">{children}</div>
      </body>
    </html>
  );
}
