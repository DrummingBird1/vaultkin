/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Outfit", "system-ui", "sans-serif"],
        mono:    ["DM Mono", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
