import { redirect } from 'next/navigation';
import { GlassPanel, SectionHeading } from '@/components/ui';
import { ProfileForm } from '@/components/auth/profile-form';
import { getCurrentUser } from '@/lib/auth';
import { ROLE_LABELS } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login?next=/profile');
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
      <GlassPanel className="p-6 sm:p-8">
        <SectionHeading
          eyebrow={`${ROLE_LABELS[user.role]} · 个人中心`}
          title={user.display_name}
          description={user.email ? user.email : '你还未绑定邮箱，无法使用找回密码功能'}
        />
        <div className="mt-8">
          <ProfileForm initialUser={user} />
        </div>
      </GlassPanel>
    </main>
  );
}
