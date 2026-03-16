## Nexus Node (Android) (internal)

Modern Android node app: connects to the **Runtime WebSocket** (`_nexus-gw._tcp`) and exposes **Canvas + Chat + Camera**.

Notes:
- The node keeps the connection alive via a **foreground service** (persistent notification with a Disconnect action).
- Chat always uses the shared session key **`main`** (same session across iOS/macOS/WebChat/Android).
- Supports modern Android only (`minSdk 31`, Kotlin + Jetpack Compose).

## Open in Android Studio
- Open the folder `clients/nexus-mobile/android/app`.

## Build / Run

```bash
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/android/app
./gradlew :app:assembleDebug
./gradlew :app:installDebug
./gradlew :app:testDebugUnitTest
```

`gradlew` auto-detects the Android SDK at `~/Library/Android/sdk` (macOS default) if `ANDROID_SDK_ROOT` / `ANDROID_HOME` are unset.

## Connect / Pair

1) Start the runtime (on your “master” machine):
```bash
pnpm nexus runtime --port 18789 --verbose
```

2) In the Android app:
- Open **Settings**
- Either select a discovered runtime under **Discovered Runtimes**, or use **Advanced → Manual Runtime** (host + port).

3) Approve pairing (on the runtime machine):
```bash
nexus nodes pending
nexus nodes approve <requestId>
```

More details: `docs/platforms/android.md`.

## Permissions

- Discovery:
  - Android 13+ (`API 33+`): `NEARBY_WIFI_DEVICES`
  - Android 12 and below: `ACCESS_FINE_LOCATION` (required for NSD scanning)
- Foreground service notification (Android 13+): `POST_NOTIFICATIONS`
- Camera:
  - `CAMERA` for `camera.snap` and `camera.clip`
  - `RECORD_AUDIO` for `camera.clip` when `includeAudio=true`
