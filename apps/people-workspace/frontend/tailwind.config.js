// SPDX-License-Identifier: Apache-2.0
// Copyright (c) 2026 PeopleOS contributors

/** Màu dùng biến CSS (định nghĩa trong src/index.css) để đổi được theme sáng/tối. */
const scale = (name) =>
  Object.fromEntries([50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((k) => [k, `rgb(var(--${name}-${k}) / <alpha-value>)`]))

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Be Vietnam Pro"', '"Segoe UI"', 'Arial', 'sans-serif'],
        display: ['"Be Vietnam Pro"', '"Segoe UI"', 'Arial', 'sans-serif'],
      },
      colors: {
        border: 'hsl(var(--border))', input: 'hsl(var(--input))', ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))', foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        // Các trang đang dùng slate-*, blue-*, indigo-*: ánh xạ sang xám lạnh và xanh dương mực của PeopleOS
        slate: scale('slate'),
        blue: scale('blue'),
        indigo: scale('blue'),
        // Xanh lá chỉ dùng cho trạng thái "đã xong", không dùng tô tiền
        emerald: scale('green'),
        green: scale('green'),
      },
      // 12px quá nhỏ cho chữ đọc; text-xs của PeopleOS là 13px
      fontSize: { xs: ['13px', { lineHeight: '1.45' }] },
      borderRadius: { xl: '12px', lg: 'var(--radius)', md: '6px', sm: '4px' },
      boxShadow: {
        sm: '0 1px 2px rgb(27 36 51 / 5%)',
        DEFAULT: '0 1px 3px rgb(27 36 51 / 8%)',
        md: '0 2px 6px rgb(27 36 51 / 8%)',
        xl: '0 12px 32px rgb(27 36 51 / 18%)',
      },
    },
  },
  plugins: [],
}
