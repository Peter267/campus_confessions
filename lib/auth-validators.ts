// 账号相关输入校验
// ---------------------------------------------------------------------------
// 沿用项目里 safeParse 风格，集中处理：
//   - 用户名 / 邮箱 / 密码 / 昵称格式
//   - 登录（用户名或邮箱 + 密码）
//   - 注册（用户名 + 邮箱 + 密码 + 昵称）
//   - 修改资料 / 修改密码
// ---------------------------------------------------------------------------

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE_RE = /^\+?\d{6,20}$/;
const DISPLAY_NAME_MIN = 2;
const DISPLAY_NAME_MAX = 24;

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: { flatten: () => { fieldErrors: Record<string, string[]> } } };

function failure(fieldErrors: Record<string, string[]>): ValidationResult<never> {
  return { success: false, error: { flatten: () => ({ fieldErrors }) } };
}
function success<T>(data: T): ValidationResult<T> {
  return { success: true, data };
}
function toText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}
export function normalizePhone(value: string) {
  return value.replace(/[\s-]/g, '');
}

export function validateUsername(username: string): string | null {
  if (!username) return '请输入用户名';
  if (username.length < 3 || username.length > 24) return '用户名长度需在 3 到 24 个字符之间';
  if (!USERNAME_RE.test(username)) return '用户名仅支持小写字母、数字与下划线';
  return null;
}

export function validateEmail(email: string): string | null {
  if (!email) return '请输入邮箱';
  if (email.length > 254) return '邮箱地址过长';
  if (!EMAIL_RE.test(email)) return '邮箱格式不正确';
  return null;
}

export function validatePhone(phone: string): string | null {
  if (!phone) return '请输入手机号';
  if (!PHONE_RE.test(phone)) return '手机号格式不正确';
  return null;
}

export function validateDisplayName(name: string): string | null {
  if (!name) return '请输入昵称';
  if (name.length < DISPLAY_NAME_MIN || name.length > DISPLAY_NAME_MAX) {
    return `昵称长度需在 ${DISPLAY_NAME_MIN} 到 ${DISPLAY_NAME_MAX} 个字符之间`;
  }
  if (/(管理员|超管|超級管理|system)/i.test(name)) {
    return '昵称含保留字，请更换';
  }
  return null;
}

export function validateBio(bio: string): string | null {
  if (bio.length > 200) return '简介最多 200 个字符';
  return null;
}

export const registerSchema = {
  safeParse(input: unknown): ValidationResult<{ username: string; email: string; displayName: string; password: string; turnstileToken?: string }> {
    const payload = input as Record<string, unknown>;
    const username = normalizeUsername(toText(payload.username));
    const email = normalizeEmail(toText(payload.email));
    const displayName = toText(payload.displayName);
    const password = typeof payload.password === 'string' ? payload.password : '';
    const turnstileToken = typeof payload.turnstileToken === 'string' ? payload.turnstileToken : undefined;

    const fieldErrors: Record<string, string[]> = {};
    const usernameError = validateUsername(username);
    if (usernameError) fieldErrors.username = [usernameError];
    const emailError = validateEmail(email);
    if (emailError) fieldErrors.email = [emailError];
    const nameError = validateDisplayName(displayName);
    if (nameError) fieldErrors.displayName = [nameError];
    if (!password) fieldErrors.password = ['请输入密码'];
    if (password.length < 10 || password.length > 128) fieldErrors.password = ['密码长度需在 10 到 128 之间'];

    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ username, email, displayName, password, turnstileToken });
  }
};

export const loginSchema = {
  safeParse(input: unknown): ValidationResult<{ identifier: string; password: string; turnstileToken?: string }> {
    const payload = input as Record<string, unknown>;
    const identifier = toText(payload.identifier);
    const password = typeof payload.password === 'string' ? payload.password : '';
    const turnstileToken = typeof payload.turnstileToken === 'string' ? payload.turnstileToken : undefined;

    const fieldErrors: Record<string, string[]> = {};
    if (!identifier) fieldErrors.identifier = ['请输入用户名或邮箱'];
    if (!password) fieldErrors.password = ['请输入密码'];

    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ identifier, password, turnstileToken });
  }
};

export const updateProfileSchema = {
  safeParse(input: unknown): ValidationResult<{ displayName?: string; bio?: string | null; avatarUrl?: string | null }> {
    const payload = input as Record<string, unknown>;
    const fieldErrors: Record<string, string[]> = {};
    const data: { displayName?: string; bio?: string | null; avatarUrl?: string | null } = {};
    if (payload.displayName !== undefined) {
      const name = toText(payload.displayName);
      const err = validateDisplayName(name);
      if (err) fieldErrors.displayName = [err];
      else data.displayName = name;
    }
    if (payload.bio !== undefined) {
      const bio = toText(payload.bio);
      const err = validateBio(bio);
      if (err) fieldErrors.bio = [err];
      else data.bio = bio || null;
    }
    if (payload.avatarUrl !== undefined) {
      const avatar = toText(payload.avatarUrl);
      if (avatar && (avatar.length > 1024 || !/^https?:\/\//i.test(avatar))) {
        fieldErrors.avatarUrl = ['头像地址必须为合法 https 链接'];
      } else {
        data.avatarUrl = avatar || null;
      }
    }
    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success(data);
  }
};

export const changePasswordSchema = {
  safeParse(input: unknown): ValidationResult<{ oldPassword: string; newPassword: string }> {
    const payload = input as Record<string, unknown>;
    const oldPassword = typeof payload.oldPassword === 'string' ? payload.oldPassword : '';
    const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';
    const fieldErrors: Record<string, string[]> = {};
    if (!oldPassword) fieldErrors.oldPassword = ['请输入当前密码'];
    if (!newPassword) fieldErrors.newPassword = ['请输入新密码'];
    if (newPassword && (newPassword.length < 10 || newPassword.length > 128)) {
      fieldErrors.newPassword = ['新密码长度需在 10 到 128 之间'];
    }
    if (newPassword && oldPassword && newPassword === oldPassword) {
      fieldErrors.newPassword = ['新密码不能与当前密码相同'];
    }
    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ oldPassword, newPassword });
  }
};

export const forgotPasswordSchema = {
  safeParse(input: unknown): ValidationResult<{ email: string; turnstileToken?: string }> {
    const payload = input as Record<string, unknown>;
    const email = normalizeEmail(toText(payload.email));
    const turnstileToken = typeof payload.turnstileToken === 'string' ? payload.turnstileToken : undefined;
    const fieldErrors: Record<string, string[]> = {};
    const emailError = validateEmail(email);
    if (emailError) fieldErrors.email = [emailError];
    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ email, turnstileToken });
  }
};

export const resetPasswordSchema = {
  safeParse(input: unknown): ValidationResult<{ token: string; password: string }> {
    const payload = input as Record<string, unknown>;
    const token = toText(payload.token);
    const password = typeof payload.password === 'string' ? payload.password : '';
    const fieldErrors: Record<string, string[]> = {};
    if (!token) fieldErrors.token = ['链接无效，请重新申请'];
    if (!password) fieldErrors.password = ['请输入新密码'];
    if (password && (password.length < 10 || password.length > 128)) {
      fieldErrors.password = ['密码长度需在 10 到 128 之间'];
    }
    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ token, password });
  }
};

export const verifyEmailSchema = {
  safeParse(input: unknown): ValidationResult<{ token: string }> {
    const payload = input as Record<string, unknown>;
    const token = toText(payload.token);
    const fieldErrors: Record<string, string[]> = {};
    if (!token) fieldErrors.token = ['链接无效'];
    return Object.keys(fieldErrors).length > 0 ? failure(fieldErrors) : success({ token });
  }
};
