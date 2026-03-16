package ai.nexus.android.runtime

import ai.nexus.android.SecurePrefs

class DeviceAuthStore(private val prefs: SecurePrefs) {
  fun loadToken(deviceId: String, role: String): String? {
    val key = tokenKey(deviceId, role)
    return prefs.getString(key)?.trim()?.takeIf { it.isNotEmpty() }
  }

  fun saveToken(deviceId: String, role: String, token: String) {
    val key = tokenKey(deviceId, role)
    prefs.putString(key, token.trim())
  }

  fun clearToken(deviceId: String, role: String) {
    val key = tokenKey(deviceId, role)
    prefs.remove(key)
  }

  private fun tokenKey(deviceId: String, role: String): String {
    val normalizedDevice = deviceId.trim().lowercase()
    val normalizedRole = role.trim().lowercase()
    return "runtime.deviceToken.$normalizedDevice.$normalizedRole"
  }
}
