import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['var(--font-archivo)', 'Archivo', 'system-ui', 'sans-serif'],
  			serif: ['var(--font-newsreader)', 'Newsreader', 'Georgia', 'serif'],
  			mono: ['var(--font-plex-mono)', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
  		},
  	}
  },
  plugins: [
    tailwindcssAnimate,
    typography,
  ],
};
export default config;
