import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arkon',
  description: 'AI Agent Gateway Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
