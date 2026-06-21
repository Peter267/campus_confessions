import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const dynamic = 'force-dynamic';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-slate-300">加载中…</div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
