// 角色与权限工具
// ---------------------------------------------------------------------------
// 角色级别（从小到大）：
//   user < moderator < admin < superadmin
// 每个角色可执行的操作通过 can() 集中判断。
// ---------------------------------------------------------------------------

import type { UserRole } from './types';

const RANK: Record<UserRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  superadmin: 3
};

export function hasRole(actual: UserRole | undefined | null, required: UserRole): boolean {
  if (!actual) return false;
  return RANK[actual] >= RANK[required];
}

export type Permission =
  | 'post.create'
  | 'post.create_named' // 实名发布
  | 'post.moderate'
  | 'comment.create'
  | 'comment.moderate'
  | 'category.manage'
  | 'settings.manage'
  | 'user.manage'
  | 'audit.read';

const PERMISSIONS: Record<UserRole, Permission[]> = {
  user: ['post.create', 'post.create_named', 'comment.create'],
  moderator: ['post.create', 'post.create_named', 'comment.create', 'post.moderate', 'comment.moderate', 'audit.read'],
  admin: [
    'post.create',
    'post.create_named',
    'comment.create',
    'post.moderate',
    'comment.moderate',
    'category.manage',
    'settings.manage',
    'audit.read'
  ],
  superadmin: [
    'post.create',
    'post.create_named',
    'comment.create',
    'post.moderate',
    'comment.moderate',
    'category.manage',
    'settings.manage',
    'user.manage',
    'audit.read'
  ]
};

export function can(role: UserRole | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export function ensureRole(role: UserRole | undefined | null, required: UserRole): boolean {
  return hasRole(role, required);
}

export const ROLE_LABELS: Record<UserRole, string> = {
  user: '校园同学',
  moderator: '内容版主',
  admin: '管理员',
  superadmin: '超级管理员'
};
