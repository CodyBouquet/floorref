/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./**/*.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
  // Temporary: force a few utilities to exist so we can confirm the pipeline works.
  safelist: ["mt-4", "text-slate-700", "rounded-xl"],
};
