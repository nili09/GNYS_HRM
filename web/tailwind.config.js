/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink:           "#0a0a0a",   /* synced with :root --ink */
        bg:            "#ffffff",   /* synced with :root --bg  */
        card:          "#ffffff",   /* synced with :root --card */
        line:          "#d9d9d6",   /* synced with :root --line */
        lime:          "#0a0a0a",   /* accent is ink in the Swiss system */
        "lime-pale":   "#f0f0ee",
        "lime-light":  "#ffffff",
        signal:        "#e3120b",   /* synced with :root --signal */
        charcoal:      "#1f1f1f",
        tan:           "#bdad96",
        neutral:       "#b0b0a9",
        danger:        "#c8102e",   /* synced with :root --danger */
        "text-muted":  "#5f5f5c",  /* synced with :root --text-muted */
        "text-faint":  "#8f8f8a",  /* synced with :root --text-faint */
      },
      fontFamily: {
        display: ['"HelveticaNowDisplay"', '"Inter Tight"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        ui:      ['"HelveticaNowDisplay"', '"Inter Tight"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
        sans:    ['"HelveticaNowDisplay"', '"Inter Tight"', '"Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
      },
      borderRadius: {
        pill: "0px",
        card: "0px",     /* synced with :root --r-card */
        btn:  "0px",     /* synced with :root --r-btn */
      },
      boxShadow: {
        xs:   "none",
        sm:   "none",
        card: "none",
        md:   "0 0 0 1px currentColor",
      },
    },
  },
  plugins: [],
};
