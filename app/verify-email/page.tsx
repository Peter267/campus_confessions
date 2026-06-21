import { Suspense } from 'react';
import { VerifyEmailForm } from '@/components/auth/verify-email-form';

export const dynamic = 'force-dynamic';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-300">加载中…</div>}>
      <VerifyEmailForm />
    </Suspense>
  );
}
