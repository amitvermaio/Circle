# Client rules

- Stack: Vite, React, TypeScript, Tailwind CSS, ChaiUI (@chaiui/*), react-router, socket.io-client.
- ChaiUI for UI primitives. Don't hand-roll buttons, inputs, dialogs, or menus if ChaiUI has them.
- Design: minimal, professional. Neutral background, one accent color, one sans-serif font, 8px spacing, thin borders, no gradients, no heavy shadows. Support light and dark mode with Tailwind dark: classes. Mobile first.
- All REST calls go through src/lib/api.ts. Base URL from VITE_API_URL. Responses are { success, data } or { success: false, error: { code, message } }. Show error.message. Handle VALIDATION_ERROR, USERNAME_TAKEN, and 401 (clear token, go to /login).
- Socket connects only after login with auth: { token } from VITE_SOCKET_URL. Disconnect on logout.
- Structure: src/lib/, src/features/<feature>/, src/components/, src/routes/.
- Subscribe to socket events in useEffect and clean up. Never show passwordHash, otpHash, or raw errors. No any.
- TODO: Confirm the backend's exact behavior for VALIDATION_ERROR and USERNAME_TAKEN handling when the first consuming feature is implemented. The response envelope and socket auth shape are verified in the server source.
