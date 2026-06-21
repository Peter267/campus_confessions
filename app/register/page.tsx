import { Suspense } from 'react';
import { RegisterForm } from '@/components/auth/register-form';

export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-300">加载中…</div>}>
      <RegisterForm />
    </Suspense>
  );
}
