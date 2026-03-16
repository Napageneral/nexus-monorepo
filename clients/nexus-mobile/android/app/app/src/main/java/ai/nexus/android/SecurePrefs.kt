@file:Suppress("DEPRECATION")

package ai.nexus.android

import android.content.Context
import android.content.SharedPreferences
import androidx.core.content.edit
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.util.UUID

class SecurePrefs(context: Context) {
  companion object {
    private const val displayNameKey = "node.displayName"
  }

  private val appContext = context.applicationContext

  private val masterKey =
    MasterKey.Builder(context)
      .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
      .build()

  private val prefs: SharedPreferences by lazy {
    createPrefs(appContext, "nexus.node.secure")
  }

  private val _instanceId = MutableStateFlow(loadOrCreateInstanceId())
  val instanceId: StateFlow<String> = _instanceId

  private val _displayName =
    MutableStateFlow(loadOrMigrateDisplayName(context = context))
  val displayName: StateFlow<String> = _displayName

  private val _cameraEnabled = MutableStateFlow(prefs.getBoolean("camera.enabled", true))
  val cameraEnabled: StateFlow<Boolean> = _cameraEnabled

  private val _locationMode =
    MutableStateFlow(LocationMode.fromRawValue(prefs.getString("location.enabledMode", "off")))
  val locationMode: StateFlow<LocationMode> = _locationMode

  private val _locationPreciseEnabled =
    MutableStateFlow(prefs.getBoolean("location.preciseEnabled", true))
  val locationPreciseEnabled: StateFlow<Boolean> = _locationPreciseEnabled

  private val _preventSleep = MutableStateFlow(prefs.getBoolean("screen.preventSleep", true))
  val preventSleep: StateFlow<Boolean> = _preventSleep

  private val _manualEnabled =
    MutableStateFlow(prefs.getBoolean("runtime.manual.enabled", false))
  val manualEnabled: StateFlow<Boolean> = _manualEnabled

  private val _manualHost =
    MutableStateFlow(prefs.getString("runtime.manual.host", "") ?: "")
  val manualHost: StateFlow<String> = _manualHost

  private val _manualPort =
    MutableStateFlow(prefs.getInt("runtime.manual.port", 18789))
  val manualPort: StateFlow<Int> = _manualPort

  private val _manualTls =
    MutableStateFlow(prefs.getBoolean("runtime.manual.tls", true))
  val manualTls: StateFlow<Boolean> = _manualTls

  private val _lastDiscoveredStableId =
    MutableStateFlow(
      prefs.getString("runtime.lastDiscoveredStableID", "") ?: "",
    )
  val lastDiscoveredStableId: StateFlow<String> = _lastDiscoveredStableId

  private val _canvasDebugStatusEnabled =
    MutableStateFlow(prefs.getBoolean("canvas.debugStatusEnabled", false))
  val canvasDebugStatusEnabled: StateFlow<Boolean> = _canvasDebugStatusEnabled

  private val _talkEnabled = MutableStateFlow(prefs.getBoolean("talk.enabled", false))
  val talkEnabled: StateFlow<Boolean> = _talkEnabled

  fun setLastDiscoveredStableId(value: String) {
    val trimmed = value.trim()
    prefs.edit { putString("runtime.lastDiscoveredStableID", trimmed) }
    _lastDiscoveredStableId.value = trimmed
  }

  fun setDisplayName(value: String) {
    val trimmed = value.trim()
    prefs.edit { putString(displayNameKey, trimmed) }
    _displayName.value = trimmed
  }

  fun setCameraEnabled(value: Boolean) {
    prefs.edit { putBoolean("camera.enabled", value) }
    _cameraEnabled.value = value
  }

  fun setLocationMode(mode: LocationMode) {
    prefs.edit { putString("location.enabledMode", mode.rawValue) }
    _locationMode.value = mode
  }

  fun setLocationPreciseEnabled(value: Boolean) {
    prefs.edit { putBoolean("location.preciseEnabled", value) }
    _locationPreciseEnabled.value = value
  }

  fun setPreventSleep(value: Boolean) {
    prefs.edit { putBoolean("screen.preventSleep", value) }
    _preventSleep.value = value
  }

  fun setManualEnabled(value: Boolean) {
    prefs.edit { putBoolean("runtime.manual.enabled", value) }
    _manualEnabled.value = value
  }

  fun setManualHost(value: String) {
    val trimmed = value.trim()
    prefs.edit { putString("runtime.manual.host", trimmed) }
    _manualHost.value = trimmed
  }

  fun setManualPort(value: Int) {
    prefs.edit { putInt("runtime.manual.port", value) }
    _manualPort.value = value
  }

  fun setManualTls(value: Boolean) {
    prefs.edit { putBoolean("runtime.manual.tls", value) }
    _manualTls.value = value
  }

  fun setCanvasDebugStatusEnabled(value: Boolean) {
    prefs.edit { putBoolean("canvas.debugStatusEnabled", value) }
    _canvasDebugStatusEnabled.value = value
  }

  fun loadRuntimeToken(): String? {
    val key = "runtime.token.${_instanceId.value}"
    val stored = prefs.getString(key, null)?.trim()
    return stored?.takeIf { it.isNotEmpty() }
  }

  fun saveRuntimeToken(token: String) {
    val key = "runtime.token.${_instanceId.value}"
    prefs.edit { putString(key, token.trim()) }
  }

  fun loadRuntimePassword(): String? {
    val key = "runtime.password.${_instanceId.value}"
    val stored = prefs.getString(key, null)?.trim()
    return stored?.takeIf { it.isNotEmpty() }
  }

  fun saveRuntimePassword(password: String) {
    val key = "runtime.password.${_instanceId.value}"
    prefs.edit { putString(key, password.trim()) }
  }

  fun loadRuntimeTlsFingerprint(stableId: String): String? {
    val key = "runtime.tls.$stableId"
    return prefs.getString(key, null)?.trim()?.takeIf { it.isNotEmpty() }
  }

  fun saveRuntimeTlsFingerprint(stableId: String, fingerprint: String) {
    val key = "runtime.tls.$stableId"
    prefs.edit { putString(key, fingerprint.trim()) }
  }

  fun getString(key: String): String? {
    return prefs.getString(key, null)
  }

  fun putString(key: String, value: String) {
    prefs.edit { putString(key, value) }
  }

  fun remove(key: String) {
    prefs.edit { remove(key) }
  }

  private fun createPrefs(context: Context, name: String): SharedPreferences {
    return EncryptedSharedPreferences.create(
      context,
      name,
      masterKey,
      EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
      EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
  }

  private fun loadOrCreateInstanceId(): String {
    val existing = prefs.getString("node.instanceId", null)?.trim()
    if (!existing.isNullOrBlank()) return existing
    val fresh = UUID.randomUUID().toString()
    prefs.edit { putString("node.instanceId", fresh) }
    return fresh
  }

  private fun loadOrMigrateDisplayName(context: Context): String {
    val existing = prefs.getString(displayNameKey, null)?.trim().orEmpty()
    if (existing.isNotEmpty() && existing != "Android Node") return existing

    val candidate = DeviceNames.bestDefaultNodeName(context).trim()
    val resolved = candidate.ifEmpty { "Android Node" }

    prefs.edit { putString(displayNameKey, resolved) }
    return resolved
  }

  fun setTalkEnabled(value: Boolean) {
    prefs.edit { putBoolean("talk.enabled", value) }
    _talkEnabled.value = value
  }
}
