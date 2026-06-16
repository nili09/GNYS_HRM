/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:          "#010101",
        bg:           "#f1f0ea",
        card:         "#ffffff",
        line:         "#d8d8d4",
        lime:         "#dff140",
        "lime-pale":  "#eff8a0",
        charcoal:     "#2f3234",
        tan:          "#bdad96",
        neutral:      "#b0b0a9",
        danger:       "#ff3535",
        "text-muted": "#565654",
        "text-faint": "#6c6e6b",
      },
      fontFamily: {
        display: ['"Elios"', '"Helvetica Neue"', "Arial", "sans-serif"],
        ui:      ['"HelveticaNowDisplay"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        sans:    ['"HelveticaNowDisplay"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
      },
      borderRadius: {
        pill: "1000px",
        card: "2px",
      },
    },
  },
  plugins: [],
};
