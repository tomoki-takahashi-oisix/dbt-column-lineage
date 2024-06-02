import type { Config } from "tailwindcss";

const config: Config = {
  mode: 'jit',
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'primary': 'var(--primary)',
      }
    },
  },
  plugins: [],
};
export default config;
