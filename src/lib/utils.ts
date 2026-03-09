import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const idx = Math.min(i, sizes.length - 1);
  return `${(bytes / Math.pow(k, idx)).toFixed(idx === 0 ? 0 : 1)} ${sizes[idx]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 0) return '0 ms';
  if (ms < 1) return '<1 ms';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)} s`;
  return `${(ms / 60000).toFixed(1)} min`;
}

export function shortenUrl(url: string, maxLen = 60): string {
  try {
    const u = new URL(url);
    const display = u.hostname + u.pathname;
    if (display.length <= maxLen) return display;
    return display.slice(0, maxLen - 3) + '...';
  } catch {
    if (url.length <= maxLen) return url;
    return url.slice(0, maxLen - 3) + '...';
  }
}

export function getHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function getPath(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

export function getProtocol(url: string): string {
  try {
    return new URL(url).protocol.replace(':', '');
  } catch {
    return '';
  }
}

export function statusCategory(code: number): 'success' | 'redirect' | 'client-error' | 'server-error' | 'other' {
  if (code >= 200 && code < 300) return 'success';
  if (code >= 300 && code < 400) return 'redirect';
  if (code >= 400 && code < 500) return 'client-error';
  if (code >= 500) return 'server-error';
  return 'other';
}

export function percentOf(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

const TIMING_COLORS: Record<string, string> = {
  blocked: '#94a3b8',
  dns: '#a78bfa',
  connect: '#f97316',
  ssl: '#eab308',
  send: '#22c55e',
  wait: '#3b82f6',
  receive: '#06b6d4',
};

export function getTimingColor(phase: string): string {
  return TIMING_COLORS[phase] ?? '#64748b';
}

const TYPE_COLORS: Record<string, string> = {
  document: '#ef4444',
  stylesheet: '#8b5cf6',
  script: '#f59e0b',
  image: '#22c55e',
  font: '#ec4899',
  xhr: '#3b82f6',
  fetch: '#3b82f6',
  media: '#14b8a6',
  websocket: '#6366f1',
  manifest: '#64748b',
  other: '#94a3b8',
};

export function getTypeColor(type: string): string {
  return TYPE_COLORS[type] ?? '#94a3b8';
}

export function severityColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-600 bg-red-50 border-red-200';
    case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'info': return 'text-blue-600 bg-blue-50 border-blue-200';
    default: return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

export function severityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'warning': return '🟡';
    case 'info': return '🔵';
    default: return '⚪';
  }
}
