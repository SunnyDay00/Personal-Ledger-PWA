import React, { useState } from 'react';
import { useApp } from '../contexts/AppContext';
import { Icon } from './ui/Icon';
import { AuthSession } from '../types';
import { cn } from '../utils';

type AuthFormMode = 'login' | 'register';

interface AuthPanelProps {
  defaultMode?: AuthFormMode;
  onAuthenticated?: (session: AuthSession) => Promise<void> | void;
  className?: string;
}

export const AuthPanel: React.FC<AuthPanelProps> = ({ defaultMode = 'login', onAuthenticated, className }) => {
  const { loginAccount, registerAccount } = useApp();
  const [mode, setMode] = useState<AuthFormMode>(defaultMode);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setError('请填写用户名和密码');
      return;
    }
    if (password.length < 8) {
      setError('密码至少 8 位');
      return;
    }
    if (mode === 'register' && !inviteCode.trim()) {
      setError('请填写注册邀请码');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = mode === 'login'
        ? await loginAccount(normalizedUsername, password)
        : await registerAccount(normalizedUsername, password, inviteCode.trim());
      await onAuthenticated?.(session);
      setPassword('');
      setInviteCode('');
    } catch (e: any) {
      setError(e?.message || (mode === 'login' ? '登录失败' : '注册失败'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex p-1 bg-gray-100 dark:bg-zinc-800 rounded-xl">
        <button
          type="button"
          onClick={() => { setMode('login'); setError(''); }}
          className={cn(
            'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'login' ? 'bg-white dark:bg-zinc-700 text-ios-text shadow-sm' : 'text-ios-subtext'
          )}
        >
          登录
        </button>
        <button
          type="button"
          onClick={() => { setMode('register'); setError(''); }}
          className={cn(
            'flex-1 py-2 rounded-lg text-sm font-medium transition-colors',
            mode === 'register' ? 'bg-white dark:bg-zinc-700 text-ios-text shadow-sm' : 'text-ios-subtext'
          )}
        >
          注册
        </button>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">用户名</label>
          <input
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
            placeholder="alice"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">密码</label>
          <input
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
            placeholder="至少 8 位"
          />
        </div>

        {mode === 'register' && (
          <div>
            <label className="text-xs font-medium text-ios-subtext ml-1 mb-1 block">注册邀请码</label>
            <input
              type="password"
              autoComplete="off"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              className="w-full bg-gray-100 dark:bg-zinc-800 p-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-ios-primary/20"
              placeholder="由服务端管理员提供"
            />
          </div>
        )}

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 bg-ios-primary text-white rounded-xl text-sm font-semibold shadow-lg shadow-ios-primary/20 active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isSubmitting && <Icon name="Loader2" className="w-4 h-4 animate-spin" />}
          {mode === 'login' ? '登录' : '注册并登录'}
        </button>
      </form>
    </div>
  );
};
