# Frontend - People Workspace

React 19 + TypeScript + Tailwind CSS 3 + component kiểu shadcn/ui (`src/components/ui`), Vite 6, `keycloak-js` (PKCE).

```
src/
├── auth/AuthProvider.tsx   # SSO Keycloak, vai trò
├── hooks/                  # useQuery (GraphQL), realtime (WebSocket), toast, useMe
├── lib/                    # api (gql/REST/download), keycloak, format
├── components/             # Layout (menu theo vai trò, chuông thông báo), ui/*
└── pages/                  # Dashboard, Profile, Contracts, Payslips, Insurance, Leave,
                            # Approvals, Proposals, Onboarding, Assistant
```

Chạy dev: `cp .env.example .env && npm install && npm run dev` (cổng 5173). Build: `npm run build`.
