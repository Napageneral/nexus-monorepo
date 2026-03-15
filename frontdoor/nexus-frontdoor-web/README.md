# Nexus Frontdoor Web

Vercel frontend launcher that:

1. Presents customer signup/login entrypoint (Google OAuth + password fallback)
2. Mints a runtime token
3. Launches tenant control UI through frontdoor (`/app`)
4. Supports direct runtime HTTP/WS debug checks

## Environment Variables

- `FRONTDOOR_ORIGIN` (required): public URL of your frontdoor service, e.g. `https://frontdoor.example.com`
- `FRONTDOOR_SESSION_COOKIE_NAME` (optional, default `nexus_fd_session`)
- `APP_SESSION_COOKIE_NAME` (optional, default `nexus_fd_session`)
- `APP_SESSION_TTL_SECONDS` (optional, default `604800`)

## Local Dev

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor-web
FRONTDOOR_ORIGIN=http://127.0.0.1:4789 vercel dev
```

## Deploy

```bash
cd /Users/tyler/nexus/home/projects/nexus/nexus-frontdoor-web
vercel --yes
printf "y\n" | vercel env remove FRONTDOOR_ORIGIN production
printf "https://frontdoor.example.com\n" | vercel env add FRONTDOOR_ORIGIN production
printf "y\n" | vercel env remove FRONTDOOR_ORIGIN preview
printf "https://frontdoor.example.com\n" | vercel env add FRONTDOOR_ORIGIN preview
vercel --prod --yes
```

## Notes

- This app stores the frontdoor session cookie server-side (HTTP-only cookie on the frontend domain).
- It then forwards authenticated requests to frontdoor for session introspection and runtime token minting.
- WebSocket checks connect directly to the tenant runtime endpoint returned by frontdoor.
- Google OAuth buttons redirect to frontdoor `/api/auth/oidc/start`; on successful login the customer lands in frontdoor `/app` (tenant control UI).
- For public customer testing, disable Vercel Deployment Protection (or explicitly configure bypass) so `/api/*` routes are reachable without Vercel account auth.
