# API connection for deployed apps

The default API for both mobile and web is:

```text
https://communishield-server.vercel.app/api
```

`EXPO_PUBLIC_API_URL` is a public, build-time setting. Expo embeds its value into
the bundle; changing a backend environment variable does not update an already
installed APK or deployed web bundle.

- **Web/Vercel:** set `EXPO_PUBLIC_API_URL` to the URL above in the frontend
  project's production/preview environment settings, then redeploy.
- **Android/iOS/EAS:** the preview and production profiles in `eas.json` set this
  URL explicitly. Rebuild and install the updated app (or publish a compatible
  Expo update if updates are configured).
- **Local development only:** use `.env.local` to point at a running local
  server, for example `http://10.0.2.2:3000/api` for the Android emulator. Restart
  Metro after changing the environment.

Release bundles reject HTTP and local/private-host API overrides and use the
HTTPS production default instead. A different public HTTPS backend may still
be configured explicitly. There is no automatic retry to another API host with
the user's credentials.

Unauthenticated `GET /api/session` should return **401 Unauthorized**. That means
the server and route are reachable; 5xx responses indicate a backend/deployment
failure rather than an expired sign-in. Verify backend environment variables in
the backend project separately; never put service-role keys in Expo variables.
