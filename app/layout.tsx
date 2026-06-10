import type { Metadata } from 'next';
import { Noto_Sans_SC, Noto_Serif_SC } from 'next/font/google';
import './globals.css';

const bodyFont = Noto_Sans_SC({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '700'] });
const displayFont = Noto_Serif_SC({ subsets: ['latin'], variable: '--font-display', weight: ['400', '600', '700'] });

export const metadata: Metadata = {
  title: '校园万能墙',
  description: '基于 Vercel Serverless 的校园微社区与匿名墙系统',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${bodyFont.variable} ${displayFont.variable}`}>
      <body>
        <div className="page-grid min-h-screen">{children}</div>
      </body>
    </html>
  );
}
