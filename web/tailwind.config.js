/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        ink:           "#161617",   /* synced with :root --ink */
        bg:            "#f5f5f7",   /* synced with :root --bg  */
        card:          "#ffffff",   /* synced with :root --card */
        line:          "#e5e5e3",   /* synced with :root --line */
        lime:          "#191970",
        "lime-pale":   "#e8e8f8",
        "lime-light":  "#a0a0e8",
        charcoal:      "#2f3234",
        tan:           "#bdad96",
        neutral:       "#b0b0a9",
        danger:        "#ff3b30",   /* synced with :root --danger */
        "text-muted":  "#6e6e73",  /* synced with :root --text-muted */
        "text-faint":  "#aeaeb2",  /* synced with :root --text-faint */
      },
      fontFamily: {
        display: ['"Elios"', '"SF Pro Display"', '-apple-system', '"Helvetica Neue"', "Arial", "sans-serif"],
        ui:      ['"HelveticaNowDisplay"', '"SF Pro Text"', '-apple-system', '"Segoe UI"', '"Helvetica Neue"', "Arial", "sans-serif"],
        sans:    ['"HelveticaNowDisplay"', '"SF Pro Text"', '-apple-system', '"Segoe UI"', '"Helvetica Neue"', "Arial", "sans-serif"],
      },
      borderRadius: {
        pill: "1000px",
        card: "12px",    /* synced with :root --r-card */
        btn:  "10px",    /* synced with :root --r-btn */
      },
      boxShadow: {
        xs:   "0 1px 2px rgba(0,0,0,.05)",
        sm:   "0 1px 3px rgba(0,0,0,.07)",
        card: "0 1px 4px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.04)",
        md:   "0 4px 16px rgba(0,0,0,.10), 0 0 0 1px rgba(0,0,0,.05)",
      },
    },
  },
  plugins: [],
};
