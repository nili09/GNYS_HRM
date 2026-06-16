/**
 * Thin API client — all requests go to /api with credentials: "include"
 * so the httpOnly cookie is sent automatically.
 */

async function request(method, path, body) {
  const opts = {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(`/api${path}`, opts);

  // Parse JSON if possible
  let data;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get:    (path)        => request("GET",    path),
  post:   (path, body)  => request("POST",   path, body),
  patch:  (path, body)  => request("PATCH",  path, body),
  put:    (path, body)  => request("PUT",    path, body),
  delete: (path)        => request("DELETE", path),
};

// Auth helpers
export const auth = {
  login:          (email, password)         => api.post("/auth/login", { email, password }),
  logout:         ()                        => api.post("/auth/logout"),
  me:             ()                        => api.get("/auth/me"),
  changePassword: (current, newPassword)    => api.post("/auth/change-password", { current, newPassword }),
};
