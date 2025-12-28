module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['"Inter"', 'sans-serif'],
      },
      colors: {
        titanium: {
          50: '#f9f9f9', // Backgrounds
          100: '#f0f0f0', // Cards / Surfaces
          200: '#e5e5e5', // Borders
          300: '#d4d4d4', // Inactive Icons
          800: '#262626', // Primary Text
          900: '#171717', // Strong Headings
        },
        glass: {
          light: 'rgba(255, 255, 255, 0.7)',
          dark: 'rgba(0, 0, 0, 0.6)',
          border: 'rgba(255, 255, 255, 0.2)',
        },
        action: {
          primary: '#007AFF', // iOS Blue (Buttons)
          success: '#34C759', // Win / Positive
          destructive: '#FF3B30', // Loss / Remove
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
        'soft': '0 4px 24px rgba(0,0,0,0.04)',
        'float': '0 12px 32px rgba(0,0,0,0.08)',
        'inner-light': 'inset 0 1px 0 rgba(255,255,255,0.8)',
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
