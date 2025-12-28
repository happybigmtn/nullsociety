module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        sans: ['"Plus Jakarta Sans"', 'Inter', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif'],
      },
      colors: {
        titanium: {
          50: '#f9f9f9', // Backgrounds
          100: '#f2f2f7', // Surfaces (iOS secondary system fill)
          200: '#e5e5ea', // Borders (iOS separator)
          300: '#d1d1d6', // Inactive
          400: '#8e8e93', // Labels (Darkened for WCAG AA - iOS secondary label)
          500: '#636366', // Tertiary text
          800: '#2c2c2e', // Primary Text
          900: '#1c1c1e', // Strong Headings
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.75)',
          dark: 'rgba(28, 28, 30, 0.8)', // Unified dark glass
          border: 'rgba(0, 0, 0, 0.05)',
        },
        action: {
          primary: '#007AFF', // iOS Blue
          success: '#34C759', // iOS Green
          destructive: '#FF3B30', // iOS Red
        },
        // Legacy Terminal Colors (kept for safe migration)
        terminal: {
          black: '#0a0a0a',
          dark: '#111111',
          green: '#00ff41',
          dim: '#333333',
          accent: '#ff003c',
          gold: '#ffd700',
        }
      },
      boxShadow: {
        'soft': '0 2px 12px rgba(0,0,0,0.03)',
        'float': '0 20px 48px rgba(0,0,0,0.08)',
        'inner-light': 'inset 0 1px 0 rgba(255,255,255,0.5)',
      },
      animation: {
        'shimmer': 'shimmer 2s infinite linear',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
        'scale-in': 'scale-in 0.2s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(255,215,0,0.3), inset 0 0 30px rgba(255,215,0,0.05)' },
          '50%': { boxShadow: '0 0 30px rgba(255,215,0,0.5), inset 0 0 40px rgba(255,215,0,0.1)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.9)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
