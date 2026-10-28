// The plugin's management endpoints stay server-only behind our owner services.
export function isPublicAuthRoute(method: string, path: string) {
  return (method === "GET" && ["/get-session", "/error", "/callback/github"].includes(path))
    || (method === "POST" && ["/sign-in/social", "/sign-out", "/callback/github"].includes(path));
}
