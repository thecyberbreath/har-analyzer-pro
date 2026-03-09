import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HAR Analyzer - Understand Your Page Load',
  description: 'Upload a HAR file and get a clear, human-readable analysis of what happened during page load.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
