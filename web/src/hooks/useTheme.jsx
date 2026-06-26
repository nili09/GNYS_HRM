import { createContext, useContext, useState, useEffect } from "react";

const ThemeContext = createContext();

function getInitialTheme() {
  const stored = localStorage.getItem("hrms-theme");
  if (stored === "dark" || stored === "light") return stored;
  return "light";
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("hrms-theme", theme);
  }, [theme]);

  function setTheme(t) { setThemeState(t); }
  function toggle() { setThemeState((t) => (t === "dark" ? "light" : "dark")); }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
