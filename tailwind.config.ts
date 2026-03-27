import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand Primary - Blue
        primary: {
          50: '#e8f4ff',
          100: '#c5e3ff',
          200: '#94ccff',
          300: '#5fb3ff',
          400: '#1890ff', // Main brand (bright)
          500: '#0a54bf', // Main brand (mid)
          600: '#123c80', // Main brand (dark)
          700: '#0d2b5e',
          800: '#091a3a',
          900: '#050e20',
        },
        // Surface / Background
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#fafbfd',
          tertiary: '#f4f5f7',
          page: '#f7f8fa',
        },
        // Sidebar
        sidebar: {
          bg: '#ffffff',
          hover: '#f5f7fa',
          active: '#e8f4ff',
          text: '#5a6474',
          'text-active': '#1890ff',
          border: '#e6e9ef',
        },
        // Border
        border: {
          DEFAULT: '#e6e9ef',
          light: '#f0f1f5',
          dark: '#d0d4de',
        },
        // Text
        text: {
          primary: '#1a1a2e',
          secondary: '#5a5c69',
          tertiary: '#9699a6',
          placeholder: '#c3c6d4',
        },
        // Status Colors
        status: {
          green: '#00c875',
          'green-bg': '#e6f9f0',
          'green-light': '#f0fdf4',
          yellow: '#fdab3d',
          'yellow-bg': '#fff5e6',
          'yellow-light': '#fffbeb',
          red: '#e2445c',
          'red-bg': '#fce4e8',
          'red-light': '#fef2f2',
          blue: '#0086c0',
          'blue-bg': '#e0f2fe',
          'blue-light': '#f0f9ff',
          purple: '#a25ddc',
          'purple-bg': '#f3e8ff',
          'purple-light': '#faf5ff',
          gray: '#c4c4c4',
          'gray-bg': '#f5f5f5',
        },
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        'heading-xl': ['22px', { lineHeight: '1.3', fontWeight: '700' }],
        'heading-lg': ['18px', { lineHeight: '1.4', fontWeight: '700' }],
        'heading-md': ['15px', { lineHeight: '1.4', fontWeight: '600' }],
        'body-md': ['14px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        'micro': ['11px', { lineHeight: '1.3', fontWeight: '600' }],
      },
      boxShadow: {
        'sm': '0 1px 2px rgba(0,0,0,0.04)',
        'card': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.03)',
        'dropdown': '0 8px 24px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        'modal': '0 20px 60px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
        'sidebar': '2px 0 8px rgba(0,0,0,0.05)',
      },
      borderRadius: {
        'sm': '4px',
        'md': '8px',
        'lg': '12px',
        'xl': '16px',
      },
      spacing: {
        'sidebar': '240px',
        'header': '48px',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
        'slide-down': 'slideDown 0.15s ease-out',
        'expand': 'expand 0.2s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        expand: {
          '0%': { opacity: '0', maxHeight: '0' },
          '100%': { opacity: '1', maxHeight: '500px' },
        },
      },
    },
  },
  plugins: [],
}
export default config
