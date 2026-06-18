import { useState, useEffect } from "react";

const MOBILE_BP = 768;

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= MOBILE_BP);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BP}px)`);
    const handler = (e) => setMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  return mobile;
}
