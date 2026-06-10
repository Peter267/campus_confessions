import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        glow: '0 20px 60px rgba(15, 23, 42, 0.22)'
      },
      keyframes: {
        floatSlow: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        pulseSoft: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.9' },
          '50%': { transform: 'scale(1.08)', opacity: '1' }
        }
      },
      animation: {
        floatSlow: 'floatSlow 8s ease-in-out infinite',
        pulseSoft: 'pulseSoft 1.8s ease-in-out infinite'
      }
    }
  },
  plugins: []
};

export default config;
