import { AlertCircle, Check, CircleHelp, Inbox, LoaderCircle, Sparkles } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { ConfidenceLevel } from '../types/action';
export function Button({
  variant = 'secondary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}) {
  return <button type="button" className={`button button-${variant} ${className}`} {...props} />;
}
export function EmptyState({
  title,
  children,
  action,
  icon = <Inbox />,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function ErrorState({ message, children }: { message: string; children?: ReactNode }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={18} />
      <div>
        <p>{message}</p>
        {children}
      </div>
    </div>
  );
}
export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={20} />
      {label}
    </div>
  );
}
export function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  const Icon = level === 'confirmed' ? Check : level === 'inferred' ? Sparkles : CircleHelp;
  return (
    <span className={`badge confidence-${level}`}>
      <Icon size={12} />
      {level === 'needs_review' ? 'Needs review' : level === 'confirmed' ? 'Confirmed' : 'Inferred'}
    </span>
  );
}
