# fastlane setup (Nexus iOS)

Install:

```bash
brew install fastlane
```

Create an App Store Connect API key:

- App Store Connect → Users and Access → Keys → App Store Connect API → Generate API Key
- Download the `.p8`, note the **Issuer ID** and **Key ID**

Create `/Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/app/fastlane/.env` (gitignored):

```bash
ASC_KEY_ID=YOUR_KEY_ID
ASC_ISSUER_ID=YOUR_ISSUER_ID
ASC_KEY_PATH=/absolute/path/to/AuthKey_XXXXXXXXXX.p8

# Code signing (Apple Team ID / App ID Prefix)
IOS_DEVELOPMENT_TEAM=YOUR_TEAM_ID
```

Run:

```bash
cd /Users/tyler/nexus/home/projects/nexus/clients/nexus-mobile/ios/app
fastlane beta
```
