/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Coral brand scale. 600 is the darkest "bright" shade that still gives white text >= 4.5:1.
        brand: { 50: "#fff2ef", 100: "#ffe1db", 200: "#ffc5ba", 300: "#ff9f8d", 400: "#f7765d", 500: "#ec5a42", 600: "#d6402b", 700: "#b33121", 800: "#8f281b" },
        ink: { 50: "#f7f7f8", 100: "#eeeff1", 200: "#e1e2e6", 300: "#c4c6cd", 400: "#9a9ea8", 500: "#747882", 600: "#5a5e68", 700: "#41444c", 800: "#2b2d33", 900: "#1d1f23" },
        canvas: "#f3f3f4",
      },
      fontFamily: { sans: ['"Segoe UI Variable"', '"Segoe UI"', "system-ui", "-apple-system", "Roboto", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(29,31,35,.06)", pop: "0 8px 24px rgba(29,31,35,.14)" },
    },
  },
  plugins: [],
};
