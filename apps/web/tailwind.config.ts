// Copyright (c) 2024 Oppmon. All rights reserved.
// SPDX-License-Identifier: MIT

import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ark: {
          bg: 'var(--ark-bg)',
          surface: 'var(--ark-surface)',
          'surface-2': 'var(--ark-surface-2)',
          'surface-3': 'var(--ark-surface-3)',
          border: 'var(--ark-border)',
          'border-soft': 'var(--ark-border-soft)',
          text: 'var(--ark-text)',
          'text-dim': 'var(--ark-text-dim)',
          'text-muted': 'var(--ark-text-muted)',
          accent: 'var(--ark-accent)',
          'accent-2': 'var(--ark-accent-2)',
          warn: 'var(--ark-warn)',
          danger: 'var(--ark-danger)',
          info: 'var(--ark-info)',
        },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        ark: '0 1px 0 rgba(255,255,255,0.02) inset, 0 12px 32px -16px rgba(0,0,0,0.6)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [typography],
};

export default config;
