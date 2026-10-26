# Android APK startup troubleshooting

## Known configuration-related crash risk

The API client previously threw at module import when a release build did not
contain `EXPO_PUBLIC_API_URL`. In an Android release, an unhandled startup JS
exception can surface as **CommuniShield keeps stopping**, before a React error
boundary can render. This is a possible cause, not a diagnosis of every native
crash. A device crash log is still needed to confirm the installed APK's failure.

Missing/malformed API configuration now produces a readable setup notice and
rejects requests locally with `API_CONFIGURATION_ERROR`, rather than throwing
during import, retrying for minutes or sending relative requests. The development
LAN fallback is not used in release builds. This does not repair an already
installed APK: rebuild it from the corrected source and install the new artifact.

## Configure Expo EAS, not just Vercel

Vercel's web environment variables and Render's backend variables are **separate**
from Expo EAS build environments. `clients/eas.json` explicitly maps:

| Build profile | EAS environment | Android output |
| --- | --- | --- |
| `development` | `development` | Development client (needs a development server) |
| `preview` | `preview` | Standalone, internally distributed APK |
| `production` | `production` | Store build, normally AAB |

For an installable standalone APK, configure **preview** variables in your Expo
project's environment settings. Run these commands from `clients/`, replacing the
placeholder with your reachable backend's real **HTTPS** address ending in `/api`:

```powershell
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL --value "https://YOUR-BACKEND-DOMAIN/api" --visibility plaintext
```

If the variable already exists, edit its value in the Expo dashboard rather than
creating a duplicate. Set the corresponding value separately in `production`
before making a production build. Configure `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` there too if using the realtime client features.

These client values are public and embedded at build time. **Never** add a
Supabase service-role key, Redis token, SMTP password or Gemini secret to the app.
Changing a Vercel setting or editing `.env` on your computer cannot update the
JavaScript already bundled into an installed APK.

After configuring EAS:

```powershell
npx eas-cli build --platform android --profile preview --clear-cache
```

Download and install that build's new APK—not an older download. Building on EAS
can consume your build quota; these instructions do not automatically submit a
remote build. Prefer installing over the existing app when its signature permits;
uninstalling/clearing app data is not required to fix the bundled API address.

Do not use `localhost` or a private laptop LAN address for a deployed release.
An unreachable server normally causes request errors, not an Android native
process crash; do not infer that every crash is a networking issue.

## If the app still closes, capture the actual exception

Enable Developer options / USB debugging on the phone, connect it by USB, unlock
it, and accept the computer's debugging authorization prompt. With Android
Platform Tools installed:

```powershell
adb devices -l
```

The phone must appear as `device`, not `unauthorized`. Open CommuniShield and
reproduce the crash, then capture:

```powershell
adb logcat -b crash -d
adb logcat -d -s AndroidRuntime ReactNativeJS
```

Share the relevant `FATAL EXCEPTION`, `JavascriptException`, or native signal
stack mentioning `com.oskarjitem.CommuniShield20`, and the EAS build link/profile.
Redact any credentials or personal information. Also note whether it closes
immediately on launch, after sign-in, or only after opening a particular page.
Avoid clearing all device logs before capturing the existing crash.

JavaScript tests and `expo export --platform android` verify the bundle and known
configuration paths. They do **not** prove the APK runs on a physical Android
device or exclude native dependency, manifest or device-specific failures.
