// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Arkon — AI Agent Workspace',
  description: 'AI Agent Gateway Platform',
  appleWebApp: {
    capable: true,
    title: 'Arkon',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#06121a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      {/* suppressHydrationWarning: browser extensions (Grammarly, LastPass, etc.)
          inject attributes onto <body> before React hydrates, causing a benign
          mismatch warning. The flag silences only direct-child diffs of body. */}
      <body className="antialiased bg-ark-bg text-ark-text" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
