import { cn } from '@/lib/utils';

const variants: Record<string, string> = {
  default: 'bg-gray-100 text-gray-600 border-gray-200/60',
  slow: 'bg-amber-50 text-amber-700 border-amber-200/60',
  failed: 'bg-red-50 text-red-700 border-red-200/60',
  'render-blocking': 'bg-purple-50 text-purple-700 border-purple-200/60',
  'third-party': 'bg-sky-50 text-sky-700 border-sky-200/60',
  duplicate: 'bg-orange-50 text-orange-700 border-orange-200/60',
  redirect: 'bg-yellow-50 text-yellow-800 border-yellow-200/60',
  large: 'bg-pink-50 text-pink-700 border-pink-200/60',
  critical: 'bg-red-50 text-red-700 border-red-200/60',
  api: 'bg-indigo-50 text-indigo-700 border-indigo-200/60',
  'late-loaded': 'bg-gray-50 text-gray-500 border-gray-200/60',
  polling: 'bg-cyan-50 text-cyan-700 border-cyan-200/60',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200/60',
  warning: 'bg-amber-50 text-amber-700 border-amber-200/60',
  info: 'bg-blue-50 text-blue-700 border-blue-200/60',
};

interface BadgeProps {
  variant?: string;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}

export function Badge({ variant = 'default', children, className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border',
        variants[variant] ?? variants.default,
        className
      )}
    >
      {dot && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          variant === 'critical' || variant === 'failed' ? 'bg-red-500' :
          variant === 'warning' || variant === 'slow' ? 'bg-amber-500' :
          variant === 'success' ? 'bg-emerald-500' :
          variant === 'info' ? 'bg-blue-500' : 'bg-gray-400'
        )} />
      )}
      {children}
    </span>
  );
}
