import { cn } from '@/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: boolean;
  hover?: boolean;
}

export function Card({ children, className, padding = true, hover = false }: CardProps) {
  return (
    <div className={cn(
      'bg-white rounded-2xl border border-gray-200/80 shadow-sm',
      padding && 'p-6',
      hover && 'transition-shadow hover:shadow-md',
      className
    )}>
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

export function CardHeader({ title, subtitle, action, className, icon }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-5', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <div className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0 mt-0.5">
            {icon}
          </div>
        )}
        <div>
          <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight">{title}</h3>
          {subtitle && <p className="text-[13px] text-gray-500 mt-0.5 leading-relaxed">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
