import type { Config } from 'tailwindcss'

// CaaS Brand Design Tokens — aligned with @aicon-dev/caas-ui Storybook
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ─── CaaS Gray Scale (theme.color.gray) ───
        gray: {
          50: '#FAFAFA',
          80: '#F9F9F9',
          100: '#F5F5F5',
          200: '#EEEEEE',
          300: '#D9D9D9',
          400: '#9E9E9E',
          500: '#777777',
          600: '#666666',
          700: '#505050',
          750: '#404040',
          800: '#262626',
          900: '#191919',
        },
        // ─── CaaS Zinc Scale (theme.color.zinc) ───
        zinc: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
          950: '#030712',
        },
        // ─── CaaS Primary Blue (theme.color.primary) ───
        primary: {
          50: 'rgba(24,144,255,0.05)',
          100: 'rgba(24,144,255,0.2)',
          200: 'rgba(24,144,255,0.5)',
          300: 'rgba(24,144,255,0.7)',
          400: 'rgba(24,144,255,0.9)',
          500: '#1890ff',  // Main brand
          600: '#147cdd',
          700: '#0f5ea6',
          800: '#0b467d',
          900: '#08355e',
          950: '#072b4c',
        },
        // ─── CaaS Feedback / Status Colors ───
        status: {
          green: '#60CA21',
          'green-bg': 'rgba(96,202,33,0.1)',
          'green-light': 'rgba(96,202,33,0.05)',
          yellow: '#FCBA16',
          'yellow-bg': 'rgba(252,186,22,0.1)',
          'yellow-light': 'rgba(252,186,22,0.05)',
          red: '#FF6661',
          'red-bg': 'rgba(255,102,97,0.1)',
          'red-light': 'rgba(255,102,97,0.05)',
          blue: '#1890FF',
          'blue-bg': 'rgba(24,144,255,0.1)',
          'blue-light': 'rgba(24,144,255,0.05)',
          purple: '#b145ff',
          'purple-bg': 'rgba(177,69,255,0.1)',
          'purple-light': 'rgba(177,69,255,0.05)',
          gray: '#D9D9D9',
          'gray-bg': '#F5F5F5',
          neutral: '#EEEEEE',
          mint: '#06D6A6',
        },
        // ─── CaaS Extended Color Palettes ───
        red: {
          50: 'rgba(255,102,97,0.05)',
          100: 'rgba(255,102,97,0.2)',
          200: 'rgba(255,102,97,0.5)',
          300: 'rgba(255,102,97,0.7)',
          400: 'rgba(255,102,97,0.9)',
          500: '#ff6661',
          600: '#dd5854',
          700: '#a6423f',
          800: '#7d322f',
          900: '#5e2524',
          950: '#4c1e1d',
        },
        yellow: {
          50: 'rgba(252,186,22,0.05)',
          100: 'rgba(252,186,22,0.2)',
          200: 'rgba(252,186,22,0.5)',
          300: 'rgba(252,186,22,0.7)',
          400: 'rgba(252,186,22,0.9)',
          500: '#fcba16',
          600: '#daa113',
          700: '#a5790e',
          800: '#7b5b0a',
          900: '#5d4508',
          950: '#4b3706',
        },
        green: {
          50: 'rgba(96,202,33,0.05)',
          100: 'rgba(96,202,33,0.2)',
          200: 'rgba(96,202,33,0.5)',
          300: 'rgba(96,202,33,0.7)',
          400: 'rgba(96,202,33,0.9)',
          500: '#60ca21',
          600: '#53af1c',
          700: '#3e8415',
          800: '#2f6310',
          900: '#234b0c',
          950: '#1c3c09',
        },
        blue: {
          50: 'rgba(24,144,255,0.05)',
          100: 'rgba(24,144,255,0.2)',
          200: 'rgba(24,144,255,0.5)',
          300: 'rgba(24,144,255,0.7)',
          400: 'rgba(24,144,255,0.9)',
          500: '#1890ff',
          600: '#147cdd',
          700: '#0f5ea6',
          800: '#0b467d',
          900: '#08355e',
          950: '#072b4c',
        },
        purple: {
          50: 'rgba(177,69,255,0.05)',
          100: 'rgba(177,69,255,0.2)',
          200: 'rgba(177,69,255,0.5)',
          300: 'rgba(177,69,255,0.7)',
          400: 'rgba(177,69,255,0.9)',
          500: '#b145ff',
          600: '#993bdd',
          700: '#732da6',
          800: '#56217d',
          900: '#41195e',
          950: '#35144c',
        },
        // ─── CaaS Text Colors (Slate) ───
        text: {
          primary: '#2C384A',
          secondary: '#414C5C',
          tertiary: '#5E6774',
          caption: '#5E6774',
          description: '#7F8892',
          placeholder: '#C5C9CD',
          translation: '#096DD9',
        },
        // ─── CaaS Surface / Background ───
        surface: {
          DEFAULT: '#ffffff',
          secondary: '#FAFAFA',   // gray-50
          tertiary: '#F5F5F5',    // gray-100
          page: '#F9F9F9',        // gray-80
        },
        // ─── CaaS Border Colors (Zinc) ───
        border: {
          DEFAULT: '#e5e7eb',     // zinc-200 normal
          light: '#f3f4f6',       // zinc-100 muted
          dark: '#d1d5db',        // zinc-300 bold
        },
        // ─── CaaS Sidebar ───
        sidebar: {
          bg: '#ffffff',
          hover: '#FAFAFA',       // gray-50
          active: 'rgba(24,144,255,0.05)', // primary-50
          text: '#5E6774',        // text.caption
          'text-active': '#1890ff',
          border: '#e5e7eb',      // zinc-200
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
        // CaaS spacing tokens
        'xs': '0.25rem',   // 4px
        'sm-space': '0.5rem',    // 8px
        'md-space': '0.75rem',   // 12px
        'lg-space': '1rem',      // 16px
        'xl-space': '1.25rem',   // 20px
        'xxl': '1.5rem',   // 24px
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
