// eslint-disable-next-line @typescript-eslint/no-require-imports
const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  mode: 'jit',
  content: [
    './node_modules/@seerr-team/react-tailwindcss-datepicker/dist/index.esm.js',
    './src/pages/**/*.{ts,tsx}',
    './src/components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Rathi Studios "Late Show" theme: the app is written against Tailwind's
      // stock gray/indigo/purple palettes, so we re-map those names instead of
      // touching every component. gray = cool near-black neutrals, indigo =
      // scarlet (primary accent), purple = crimson (gradient partner).
      colors: {
        gray: {
          50: '#f7f7f9',
          100: '#f0eff3',
          200: '#dddce3',
          300: '#c7c5ce',
          400: '#9b98a5',
          500: '#6f6c7b',
          600: '#4d4a59',
          700: '#2c2a36',
          800: '#191821',
          900: '#0e0d14',
          950: '#0a0a0e',
        },
        indigo: {
          50: '#fef2f4',
          100: '#fde3e8',
          200: '#fac3cd',
          300: '#f795a7',
          400: '#f05f7a',
          500: '#eb4262',
          600: '#e62e4d',
          700: '#c41f3e',
          800: '#a01c35',
          900: '#7c1a2e',
          950: '#440d19',
        },
        purple: {
          50: '#fdf2f7',
          100: '#fbe3ee',
          200: '#f6c3dc',
          300: '#ee94bf',
          400: '#e35d9d',
          500: '#d43b82',
          600: '#c02a6c',
          700: '#9e2257',
          800: '#801f49',
          900: '#651c3d',
          950: '#3b0e21',
        },
      },
      transitionProperty: {
        'max-height': 'max-height',
        width: 'width',
      },
      fontFamily: {
        sans: ['Archivo Variable', ...defaultTheme.fontFamily.sans],
      },
      typography: (theme) => ({
        DEFAULT: {
          css: {
            color: theme('colors.gray.300'),
            a: {
              color: theme('colors.indigo.500'),
              '&:hover': {
                color: theme('colors.indigo.400'),
              },
            },

            h1: {
              color: theme('colors.gray.300'),
            },
            h2: {
              color: theme('colors.gray.300'),
            },
            h3: {
              color: theme('colors.gray.300'),
            },
            h4: {
              color: theme('colors.gray.300'),
            },
            h5: {
              color: theme('colors.gray.300'),
            },
            h6: {
              color: theme('colors.gray.300'),
            },

            strong: {
              color: theme('colors.gray.400'),
            },

            code: {
              color: theme('colors.gray.300'),
            },

            figcaption: {
              color: theme('colors.gray.500'),
            },
          },
        },
      }),
    },
    aspectRatio: {
      auto: 'auto',
      square: '1 / 1',
      video: '16 / 9',
      1: '1',
      2: '2',
      3: '3',
      4: '4',
      5: '5',
      6: '6',
      7: '7',
      8: '8',
      9: '9',
      10: '10',
      11: '11',
      12: '12',
      13: '13',
      14: '14',
      15: '15',
      16: '16',
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
    require('@tailwindcss/typography'),
    require('@tailwindcss/aspect-ratio'),
  ],
};
