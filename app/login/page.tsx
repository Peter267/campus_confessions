import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/login-form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-300">加载中…</div>}>
      <LoginForm />
    </Suspense>
  );
}
