package ai.nexus.android

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.os.SystemClock
import androidx.core.content.ContextCompat
import ai.nexus.android.chat.ChatController
import ai.nexus.android.chat.ChatMessage
import ai.nexus.android.chat.ChatPendingToolCall
import ai.nexus.android.chat.ChatSessionEntry
import ai.nexus.android.chat.OutgoingAttachment
import ai.nexus.android.runtime.DeviceAuthStore
import ai.nexus.android.runtime.DeviceIdentityStore
import ai.nexus.android.runtime.RuntimeClientInfo
import ai.nexus.android.runtime.RuntimeConnectOptions
import ai.nexus.android.runtime.RuntimeDiscovery
import ai.nexus.android.runtime.RuntimeEndpoint
import ai.nexus.android.runtime.RuntimeSession
import ai.nexus.android.runtime.RuntimeTlsParams
import ai.nexus.android.node.CameraCaptureManager
import ai.nexus.android.node.LocationCaptureManager
import ai.nexus.android.BuildConfig
import ai.nexus.android.node.CanvasController
import ai.nexus.android.node.ScreenRecordManager
import ai.nexus.android.node.SmsManager
import ai.nexus.android.protocol.NexusCapability
import ai.nexus.android.protocol.NexusCameraCommand
import ai.nexus.android.protocol.NexusCanvasCommand
import ai.nexus.android.protocol.NexusScreenCommand
import ai.nexus.android.protocol.NexusLocationCommand
import ai.nexus.android.protocol.NexusSmsCommand
import ai.nexus.android.voice.TalkModeManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import java.util.concurrent.atomic.AtomicLong

class NodeRuntime(context: Context) {
  private val appContext = context.applicationContext
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  val prefs = SecurePrefs(appContext)
  private val deviceAuthStore = DeviceAuthStore(prefs)
  val canvas = CanvasController()
  val camera = CameraCaptureManager(appContext)
  val location = LocationCaptureManager(appContext)
  val screenRecorder = ScreenRecordManager(appContext)
  val sms = SmsManager(appContext)
  private val json = Json { ignoreUnknownKeys = true }

  private val externalAudioCaptureActive = MutableStateFlow(false)

  val talkStatusText: StateFlow<String>
    get() = talkMode.statusText

  val talkIsListening: StateFlow<Boolean>
    get() = talkMode.isListening

  val talkIsSpeaking: StateFlow<Boolean>
    get() = talkMode.isSpeaking

  private val discovery = RuntimeDiscovery(appContext, scope = scope)
  val runtimes: StateFlow<List<RuntimeEndpoint>> = discovery.runtimes
  val discoveryStatusText: StateFlow<String> = discovery.statusText

  private val identityStore = DeviceIdentityStore(appContext)

  private val _isConnected = MutableStateFlow(false)
  val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

  private val _statusText = MutableStateFlow("Offline")
  val statusText: StateFlow<String> = _statusText.asStateFlow()

  private val _mainSessionKey = MutableStateFlow("main")
  val mainSessionKey: StateFlow<String> = _mainSessionKey.asStateFlow()

  private val cameraHudSeq = AtomicLong(0)
  private val _cameraHud = MutableStateFlow<CameraHudState?>(null)
  val cameraHud: StateFlow<CameraHudState?> = _cameraHud.asStateFlow()

  private val _cameraFlashToken = MutableStateFlow(0L)
  val cameraFlashToken: StateFlow<Long> = _cameraFlashToken.asStateFlow()

  private val _screenRecordActive = MutableStateFlow(false)
  val screenRecordActive: StateFlow<Boolean> = _screenRecordActive.asStateFlow()

  private val _serverName = MutableStateFlow<String?>(null)
  val serverName: StateFlow<String?> = _serverName.asStateFlow()

  private val _remoteAddress = MutableStateFlow<String?>(null)
  val remoteAddress: StateFlow<String?> = _remoteAddress.asStateFlow()

  private val _seamColorArgb = MutableStateFlow(DEFAULT_SEAM_COLOR_ARGB)
  val seamColorArgb: StateFlow<Long> = _seamColorArgb.asStateFlow()

  private val _isForeground = MutableStateFlow(true)
  val isForeground: StateFlow<Boolean> = _isForeground.asStateFlow()

  private var operatorConnected = false
  private var nodeConnected = false
  private var operatorStatusText: String = "Offline"
  private var nodeStatusText: String = "Offline"
  private var connectedEndpoint: RuntimeEndpoint? = null

  private val operatorSession =
    RuntimeSession(
      scope = scope,
      identityStore = identityStore,
      deviceAuthStore = deviceAuthStore,
      onConnected = { name, remote, mainSessionKey ->
        operatorConnected = true
        operatorStatusText = "Connected"
        _serverName.value = name
        _remoteAddress.value = remote
        _seamColorArgb.value = DEFAULT_SEAM_COLOR_ARGB
        applyMainSessionKey(mainSessionKey)
        updateStatus()
        scope.launch { refreshBrandingFromRuntime() }
      },
      onDisconnected = { message ->
        operatorConnected = false
        operatorStatusText = message
        _serverName.value = null
        _remoteAddress.value = null
        _seamColorArgb.value = DEFAULT_SEAM_COLOR_ARGB
        if (!isCanonicalMainSessionKey(_mainSessionKey.value)) {
          _mainSessionKey.value = "main"
        }
        val mainKey = resolveMainSessionKey()
        talkMode.setMainSessionKey(mainKey)
        chat.applyMainSessionKey(mainKey)
        chat.onDisconnected(message)
        updateStatus()
      },
      onEvent = { event, payloadJson ->
        handleRuntimeEvent(event, payloadJson)
      },
    )

  private val nodeSession =
    RuntimeSession(
      scope = scope,
      identityStore = identityStore,
      deviceAuthStore = deviceAuthStore,
      onConnected = { _, _, _ ->
        nodeConnected = true
        nodeStatusText = "Connected"
        updateStatus()
      },
      onDisconnected = { message ->
        nodeConnected = false
        nodeStatusText = message
        updateStatus()
      },
      onEvent = { _, _ -> },
      onInvoke = { req ->
        handleInvoke(req.command, req.paramsJson)
      },
      onTlsFingerprint = { stableId, fingerprint ->
        prefs.saveRuntimeTlsFingerprint(stableId, fingerprint)
      },
    )

  private val chat: ChatController =
    ChatController(
      scope = scope,
      session = operatorSession,
      json = json,
      supportsChatSubscribe = false,
    )
  private val talkMode: TalkModeManager by lazy {
    TalkModeManager(
      context = appContext,
      scope = scope,
      session = operatorSession,
      supportsChatSubscribe = false,
      isConnected = { operatorConnected },
    )
  }

  private fun applyMainSessionKey(candidate: String?) {
    val trimmed = candidate?.trim().orEmpty()
    if (trimmed.isEmpty()) return
    if (isCanonicalMainSessionKey(_mainSessionKey.value)) return
    if (_mainSessionKey.value == trimmed) return
    _mainSessionKey.value = trimmed
    talkMode.setMainSessionKey(trimmed)
    chat.applyMainSessionKey(trimmed)
  }

  private fun updateStatus() {
    _isConnected.value = operatorConnected
    _statusText.value =
      when {
        operatorConnected && nodeConnected -> "Connected"
        operatorConnected && !nodeConnected -> "Connected (node offline)"
        !operatorConnected && nodeConnected -> "Connected (operator offline)"
        operatorStatusText.isNotBlank() && operatorStatusText != "Offline" -> operatorStatusText
        else -> nodeStatusText
      }
  }

  private fun resolveMainSessionKey(): String {
    val trimmed = _mainSessionKey.value.trim()
    return if (trimmed.isEmpty()) "main" else trimmed
  }


  val instanceId: StateFlow<String> = prefs.instanceId
  val displayName: StateFlow<String> = prefs.displayName
  val cameraEnabled: StateFlow<Boolean> = prefs.cameraEnabled
  val locationMode: StateFlow<LocationMode> = prefs.locationMode
  val locationPreciseEnabled: StateFlow<Boolean> = prefs.locationPreciseEnabled
  val preventSleep: StateFlow<Boolean> = prefs.preventSleep
  val talkEnabled: StateFlow<Boolean> = prefs.talkEnabled
  val manualEnabled: StateFlow<Boolean> = prefs.manualEnabled
  val manualHost: StateFlow<String> = prefs.manualHost
  val manualPort: StateFlow<Int> = prefs.manualPort
  val manualTls: StateFlow<Boolean> = prefs.manualTls
  val lastDiscoveredStableId: StateFlow<String> = prefs.lastDiscoveredStableId
  val canvasDebugStatusEnabled: StateFlow<Boolean> = prefs.canvasDebugStatusEnabled

  private var didAutoConnect = false
  val chatSessionKey: StateFlow<String> = chat.sessionKey
  val chatSessionId: StateFlow<String?> = chat.sessionId
  val chatMessages: StateFlow<List<ChatMessage>> = chat.messages
  val chatError: StateFlow<String?> = chat.errorText
  val chatHealthOk: StateFlow<Boolean> = chat.healthOk
  val chatThinkingLevel: StateFlow<String> = chat.thinkingLevel
  val chatStreamingAssistantText: StateFlow<String?> = chat.streamingAssistantText
  val chatPendingToolCalls: StateFlow<List<ChatPendingToolCall>> = chat.pendingToolCalls
  val chatSessions: StateFlow<List<ChatSessionEntry>> = chat.sessions
  val pendingRunCount: StateFlow<Int> = chat.pendingRunCount

  init {
    scope.launch {
      talkEnabled.collect { enabled ->
        talkMode.setEnabled(enabled)
        externalAudioCaptureActive.value = enabled
      }
    }

    scope.launch(Dispatchers.Default) {
      runtimes.collect { list ->
        if (list.isNotEmpty()) {
          // Persist the last discovered runtime (best-effort UX parity with iOS).
          prefs.setLastDiscoveredStableId(list.last().stableId)
        }

        if (didAutoConnect) return@collect
        if (_isConnected.value) return@collect

        if (manualEnabled.value) {
          val host = manualHost.value.trim()
          val port = manualPort.value
          if (host.isNotEmpty() && port in 1..65535) {
            didAutoConnect = true
            connect(RuntimeEndpoint.manual(host = host, port = port))
          }
          return@collect
        }

        val targetStableId = lastDiscoveredStableId.value.trim()
        if (targetStableId.isEmpty()) return@collect
        val target = list.firstOrNull { it.stableId == targetStableId } ?: return@collect
        didAutoConnect = true
        connect(target)
      }
    }

    scope.launch {
      combine(
        canvasDebugStatusEnabled,
        statusText,
        serverName,
        remoteAddress,
      ) { debugEnabled, status, server, remote ->
        Quad(debugEnabled, status, server, remote)
      }.distinctUntilChanged()
        .collect { (debugEnabled, status, server, remote) ->
          canvas.setDebugStatusEnabled(debugEnabled)
          if (!debugEnabled) return@collect
          canvas.setDebugStatus(status, server ?: remote)
        }
    }
  }

  fun setForeground(value: Boolean) {
    _isForeground.value = value
  }

  fun setDisplayName(value: String) {
    prefs.setDisplayName(value)
  }

  fun setCameraEnabled(value: Boolean) {
    prefs.setCameraEnabled(value)
  }

  fun setLocationMode(mode: LocationMode) {
    prefs.setLocationMode(mode)
  }

  fun setLocationPreciseEnabled(value: Boolean) {
    prefs.setLocationPreciseEnabled(value)
  }

  fun setPreventSleep(value: Boolean) {
    prefs.setPreventSleep(value)
  }

  fun setManualEnabled(value: Boolean) {
    prefs.setManualEnabled(value)
  }

  fun setManualHost(value: String) {
    prefs.setManualHost(value)
  }

  fun setManualPort(value: Int) {
    prefs.setManualPort(value)
  }

  fun setManualTls(value: Boolean) {
    prefs.setManualTls(value)
  }

  fun setCanvasDebugStatusEnabled(value: Boolean) {
    prefs.setCanvasDebugStatusEnabled(value)
  }

  fun setTalkEnabled(value: Boolean) {
    prefs.setTalkEnabled(value)
  }

  private fun buildInvokeCommands(): List<String> =
    buildList {
      add(NexusCanvasCommand.Present.rawValue)
      add(NexusCanvasCommand.Hide.rawValue)
      add(NexusCanvasCommand.Navigate.rawValue)
      add(NexusCanvasCommand.Eval.rawValue)
      add(NexusCanvasCommand.Snapshot.rawValue)
      add(NexusScreenCommand.Record.rawValue)
      if (cameraEnabled.value) {
        add(NexusCameraCommand.Snap.rawValue)
        add(NexusCameraCommand.Clip.rawValue)
      }
      if (locationMode.value != LocationMode.Off) {
        add(NexusLocationCommand.Get.rawValue)
      }
      if (sms.canSendSms()) {
        add(NexusSmsCommand.Send.rawValue)
      }
    }

  private fun buildCapabilities(): List<String> =
    buildList {
      add(NexusCapability.Canvas.rawValue)
      add(NexusCapability.Screen.rawValue)
      if (cameraEnabled.value) add(NexusCapability.Camera.rawValue)
      if (sms.canSendSms()) add(NexusCapability.Sms.rawValue)
      if (locationMode.value != LocationMode.Off) {
        add(NexusCapability.Location.rawValue)
      }
    }

  private fun resolvedVersionName(): String {
    val versionName = BuildConfig.VERSION_NAME.trim().ifEmpty { "dev" }
    return if (BuildConfig.DEBUG && !versionName.contains("dev", ignoreCase = true)) {
      "$versionName-dev"
    } else {
      versionName
    }
  }

  private fun resolveModelIdentifier(): String? {
    return listOfNotNull(Build.MANUFACTURER, Build.MODEL)
      .joinToString(" ")
      .trim()
      .ifEmpty { null }
  }

  private fun buildUserAgent(): String {
    val version = resolvedVersionName()
    val release = Build.VERSION.RELEASE?.trim().orEmpty()
    val releaseLabel = if (release.isEmpty()) "unknown" else release
    return "NexusAndroid/$version (Android $releaseLabel; SDK ${Build.VERSION.SDK_INT})"
  }

  private fun buildClientInfo(clientId: String, clientMode: String): RuntimeClientInfo {
    return RuntimeClientInfo(
      id = clientId,
      displayName = displayName.value,
      version = resolvedVersionName(),
      platform = "android",
      mode = clientMode,
      instanceId = instanceId.value,
      deviceFamily = "Android",
      modelIdentifier = resolveModelIdentifier(),
    )
  }

  private fun buildNodeConnectOptions(): RuntimeConnectOptions {
    return RuntimeConnectOptions(
      role = "operator",
      scopes = emptyList(),
      caps = buildCapabilities(),
      commands = buildInvokeCommands(),
      permissions = emptyMap(),
      client = buildClientInfo(clientId = "nexus-android", clientMode = "node"),
      userAgent = buildUserAgent(),
    )
  }

  private fun buildOperatorConnectOptions(): RuntimeConnectOptions {
    return RuntimeConnectOptions(
      role = "operator",
      scopes = emptyList(),
      caps = emptyList(),
      commands = emptyList(),
      permissions = emptyMap(),
      client = buildClientInfo(clientId = "nexus-control-ui", clientMode = "ui"),
      userAgent = buildUserAgent(),
    )
  }

  fun refreshRuntimeConnection() {
    val endpoint = connectedEndpoint ?: return
    val token = prefs.loadRuntimeToken()
    val password = prefs.loadRuntimePassword()
    val tls = resolveTlsParams(endpoint)
    operatorSession.connect(endpoint, token, password, buildOperatorConnectOptions(), tls)
    nodeSession.connect(endpoint, token, password, buildNodeConnectOptions(), tls)
    operatorSession.reconnect()
    nodeSession.reconnect()
  }

  fun connect(endpoint: RuntimeEndpoint) {
    connectedEndpoint = endpoint
    operatorStatusText = "Connecting…"
    nodeStatusText = "Connecting…"
    updateStatus()
    val token = prefs.loadRuntimeToken()
    val password = prefs.loadRuntimePassword()
    val tls = resolveTlsParams(endpoint)
    operatorSession.connect(endpoint, token, password, buildOperatorConnectOptions(), tls)
    nodeSession.connect(endpoint, token, password, buildNodeConnectOptions(), tls)
  }

  private fun hasRecordAudioPermission(): Boolean {
    return (
      ContextCompat.checkSelfPermission(appContext, Manifest.permission.RECORD_AUDIO) ==
        PackageManager.PERMISSION_GRANTED
      )
  }

  private fun hasFineLocationPermission(): Boolean {
    return (
      ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
      )
  }

  private fun hasCoarseLocationPermission(): Boolean {
    return (
      ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
      )
  }

  private fun hasBackgroundLocationPermission(): Boolean {
    return (
      ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_BACKGROUND_LOCATION) ==
        PackageManager.PERMISSION_GRANTED
      )
  }

  fun connectManual() {
    val host = manualHost.value.trim()
    val port = manualPort.value
    if (host.isEmpty() || port <= 0 || port > 65535) {
      _statusText.value = "Failed: invalid manual host/port"
      return
    }
    connect(RuntimeEndpoint.manual(host = host, port = port))
  }

  fun disconnect() {
    connectedEndpoint = null
    operatorSession.disconnect()
    nodeSession.disconnect()
  }

  private fun resolveTlsParams(endpoint: RuntimeEndpoint): RuntimeTlsParams? {
    val stored = prefs.loadRuntimeTlsFingerprint(endpoint.stableId)
    val hinted = endpoint.tlsEnabled || !endpoint.tlsFingerprintSha256.isNullOrBlank()
    val manual = endpoint.stableId.startsWith("manual|")

    if (manual) {
      if (!manualTls.value) return null
      return RuntimeTlsParams(
        required = true,
        expectedFingerprint = endpoint.tlsFingerprintSha256 ?: stored,
        allowTOFU = stored == null,
        stableId = endpoint.stableId,
      )
    }

    if (hinted) {
      return RuntimeTlsParams(
        required = true,
        expectedFingerprint = endpoint.tlsFingerprintSha256 ?: stored,
        allowTOFU = stored == null,
        stableId = endpoint.stableId,
      )
    }

    if (!stored.isNullOrBlank()) {
      return RuntimeTlsParams(
        required = true,
        expectedFingerprint = stored,
        allowTOFU = false,
        stableId = endpoint.stableId,
      )
    }

    return null
  }


  fun loadChat(sessionKey: String) {
    val key = sessionKey.trim().ifEmpty { resolveMainSessionKey() }
    chat.load(key)
  }

  fun refreshChat() {
    chat.refresh()
  }

  fun refreshChatSessions(limit: Int? = null) {
    chat.refreshSessions(limit = limit)
  }

  fun setChatThinkingLevel(level: String) {
    chat.setThinkingLevel(level)
  }

  fun switchChatSession(sessionKey: String) {
    chat.switchSession(sessionKey)
  }

  fun abortChat() {
    chat.abort()
  }

  fun sendChat(message: String, thinking: String, attachments: List<OutgoingAttachment>) {
    chat.sendMessage(message = message, thinkingLevel = thinking, attachments = attachments)
  }

  private fun handleRuntimeEvent(event: String, payloadJson: String?) {

    talkMode.handleRuntimeEvent(event, payloadJson)
    chat.handleRuntimeEvent(event, payloadJson)
  }

  private suspend fun refreshBrandingFromRuntime() {
    if (!_isConnected.value) return
    try {
      val res = operatorSession.request("config.get", "{}")
      val root = json.parseToJsonElement(res).asObjectOrNull()
      val config = root?.get("config").asObjectOrNull()
      val ui = config?.get("ui").asObjectOrNull()
      val raw = ui?.get("seamColor").asStringOrNull()?.trim()
      val sessionCfg = config?.get("session").asObjectOrNull()
      val mainKey = normalizeMainKey(sessionCfg?.get("mainKey").asStringOrNull())
      applyMainSessionKey(mainKey)

      val parsed = parseHexColorArgb(raw)
      _seamColorArgb.value = parsed ?: DEFAULT_SEAM_COLOR_ARGB
    } catch (_: Throwable) {
      // ignore
    }
  }

  private suspend fun handleInvoke(command: String, paramsJson: String?): RuntimeSession.InvokeResult {
    if (
      command.startsWith(NexusCanvasCommand.NamespacePrefix) ||
        command.startsWith(NexusCameraCommand.NamespacePrefix) ||
        command.startsWith(NexusScreenCommand.NamespacePrefix)
      ) {
      if (!isForeground.value) {
        return RuntimeSession.InvokeResult.error(
          code = "NODE_BACKGROUND_UNAVAILABLE",
          message = "NODE_BACKGROUND_UNAVAILABLE: canvas/camera/screen commands require foreground",
        )
      }
    }
    if (command.startsWith(NexusCameraCommand.NamespacePrefix) && !cameraEnabled.value) {
      return RuntimeSession.InvokeResult.error(
        code = "CAMERA_DISABLED",
        message = "CAMERA_DISABLED: enable Camera in Settings",
      )
    }
    if (command.startsWith(NexusLocationCommand.NamespacePrefix) &&
      locationMode.value == LocationMode.Off
    ) {
      return RuntimeSession.InvokeResult.error(
        code = "LOCATION_DISABLED",
        message = "LOCATION_DISABLED: enable Location in Settings",
      )
    }

    return when (command) {
      NexusCanvasCommand.Present.rawValue -> {
        val url = CanvasController.parseNavigateUrl(paramsJson)
        canvas.navigate(url)
        RuntimeSession.InvokeResult.ok(null)
      }
      NexusCanvasCommand.Hide.rawValue -> RuntimeSession.InvokeResult.ok(null)
      NexusCanvasCommand.Navigate.rawValue -> {
        val url = CanvasController.parseNavigateUrl(paramsJson)
        canvas.navigate(url)
        RuntimeSession.InvokeResult.ok(null)
      }
      NexusCanvasCommand.Eval.rawValue -> {
        val js =
          CanvasController.parseEvalJs(paramsJson)
            ?: return RuntimeSession.InvokeResult.error(
              code = "INVALID_REQUEST",
              message = "INVALID_REQUEST: javaScript required",
            )
        val result =
          try {
            canvas.eval(js)
          } catch (err: Throwable) {
            return RuntimeSession.InvokeResult.error(
              code = "NODE_BACKGROUND_UNAVAILABLE",
              message = "NODE_BACKGROUND_UNAVAILABLE: canvas unavailable",
            )
          }
        RuntimeSession.InvokeResult.ok("""{"result":${result.toJsonString()}}""")
      }
      NexusCanvasCommand.Snapshot.rawValue -> {
        val snapshotParams = CanvasController.parseSnapshotParams(paramsJson)
        val base64 =
          try {
            canvas.snapshotBase64(
              format = snapshotParams.format,
              quality = snapshotParams.quality,
              maxWidth = snapshotParams.maxWidth,
            )
          } catch (err: Throwable) {
            return RuntimeSession.InvokeResult.error(
              code = "NODE_BACKGROUND_UNAVAILABLE",
              message = "NODE_BACKGROUND_UNAVAILABLE: canvas unavailable",
            )
          }
        RuntimeSession.InvokeResult.ok("""{"format":"${snapshotParams.format.rawValue}","base64":"$base64"}""")
      }
      NexusCameraCommand.Snap.rawValue -> {
        showCameraHud(message = "Taking photo…", kind = CameraHudKind.Photo)
        triggerCameraFlash()
        val res =
          try {
            camera.snap(paramsJson)
          } catch (err: Throwable) {
            val (code, message) = invokeErrorFromThrowable(err)
            showCameraHud(message = message, kind = CameraHudKind.Error, autoHideMs = 2200)
            return RuntimeSession.InvokeResult.error(code = code, message = message)
          }
        showCameraHud(message = "Photo captured", kind = CameraHudKind.Success, autoHideMs = 1600)
        RuntimeSession.InvokeResult.ok(res.payloadJson)
      }
      NexusCameraCommand.Clip.rawValue -> {
        val includeAudio = paramsJson?.contains("\"includeAudio\":true") != false
        if (includeAudio) externalAudioCaptureActive.value = true
        try {
          showCameraHud(message = "Recording…", kind = CameraHudKind.Recording)
          val res =
            try {
              camera.clip(paramsJson)
            } catch (err: Throwable) {
              val (code, message) = invokeErrorFromThrowable(err)
              showCameraHud(message = message, kind = CameraHudKind.Error, autoHideMs = 2400)
              return RuntimeSession.InvokeResult.error(code = code, message = message)
            }
          showCameraHud(message = "Clip captured", kind = CameraHudKind.Success, autoHideMs = 1800)
          RuntimeSession.InvokeResult.ok(res.payloadJson)
        } finally {
          if (includeAudio) externalAudioCaptureActive.value = false
        }
      }
      NexusLocationCommand.Get.rawValue -> {
        val mode = locationMode.value
        if (!isForeground.value && mode != LocationMode.Always) {
          return RuntimeSession.InvokeResult.error(
            code = "LOCATION_BACKGROUND_UNAVAILABLE",
            message = "LOCATION_BACKGROUND_UNAVAILABLE: background location requires Always",
          )
        }
        if (!hasFineLocationPermission() && !hasCoarseLocationPermission()) {
          return RuntimeSession.InvokeResult.error(
            code = "LOCATION_PERMISSION_REQUIRED",
            message = "LOCATION_PERMISSION_REQUIRED: grant Location permission",
          )
        }
        if (!isForeground.value && mode == LocationMode.Always && !hasBackgroundLocationPermission()) {
          return RuntimeSession.InvokeResult.error(
            code = "LOCATION_PERMISSION_REQUIRED",
            message = "LOCATION_PERMISSION_REQUIRED: enable Always in system Settings",
          )
        }
        val (maxAgeMs, timeoutMs, desiredAccuracy) = parseLocationParams(paramsJson)
        val preciseEnabled = locationPreciseEnabled.value
        val accuracy =
          when (desiredAccuracy) {
            "precise" -> if (preciseEnabled && hasFineLocationPermission()) "precise" else "balanced"
            "coarse" -> "coarse"
            else -> if (preciseEnabled && hasFineLocationPermission()) "precise" else "balanced"
          }
        val providers =
          when (accuracy) {
            "precise" -> listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
            "coarse" -> listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
            else -> listOf(LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER)
          }
        try {
          val payload =
            location.getLocation(
              desiredProviders = providers,
              maxAgeMs = maxAgeMs,
              timeoutMs = timeoutMs,
              isPrecise = accuracy == "precise",
            )
          RuntimeSession.InvokeResult.ok(payload.payloadJson)
        } catch (err: TimeoutCancellationException) {
          RuntimeSession.InvokeResult.error(
            code = "LOCATION_TIMEOUT",
            message = "LOCATION_TIMEOUT: no fix in time",
          )
        } catch (err: Throwable) {
          val message = err.message ?: "LOCATION_UNAVAILABLE: no fix"
          RuntimeSession.InvokeResult.error(code = "LOCATION_UNAVAILABLE", message = message)
        }
      }
      NexusScreenCommand.Record.rawValue -> {
        // Status pill mirrors screen recording state so it stays visible without overlay stacking.
        _screenRecordActive.value = true
        try {
          val res =
            try {
              screenRecorder.record(paramsJson)
            } catch (err: Throwable) {
              val (code, message) = invokeErrorFromThrowable(err)
              return RuntimeSession.InvokeResult.error(code = code, message = message)
            }
          RuntimeSession.InvokeResult.ok(res.payloadJson)
        } finally {
          _screenRecordActive.value = false
        }
      }
      NexusSmsCommand.Send.rawValue -> {
        val res = sms.send(paramsJson)
        if (res.ok) {
          RuntimeSession.InvokeResult.ok(res.payloadJson)
        } else {
          val error = res.error ?: "SMS_SEND_FAILED"
          val idx = error.indexOf(':')
          val code = if (idx > 0) error.substring(0, idx).trim() else "SMS_SEND_FAILED"
          RuntimeSession.InvokeResult.error(code = code, message = error)
        }
      }
      else ->
        RuntimeSession.InvokeResult.error(
          code = "INVALID_REQUEST",
          message = "INVALID_REQUEST: unknown command",
        )
    }
  }

  private fun triggerCameraFlash() {
    // Token is used as a pulse trigger; value doesn't matter as long as it changes.
    _cameraFlashToken.value = SystemClock.elapsedRealtimeNanos()
  }

  private fun showCameraHud(message: String, kind: CameraHudKind, autoHideMs: Long? = null) {
    val token = cameraHudSeq.incrementAndGet()
    _cameraHud.value = CameraHudState(token = token, kind = kind, message = message)

    if (autoHideMs != null && autoHideMs > 0) {
      scope.launch {
        delay(autoHideMs)
        if (_cameraHud.value?.token == token) _cameraHud.value = null
      }
    }
  }

  private fun invokeErrorFromThrowable(err: Throwable): Pair<String, String> {
    val raw = (err.message ?: "").trim()
    if (raw.isEmpty()) return "UNAVAILABLE" to "UNAVAILABLE: camera error"

    val idx = raw.indexOf(':')
    if (idx <= 0) return "UNAVAILABLE" to raw
    val code = raw.substring(0, idx).trim().ifEmpty { "UNAVAILABLE" }
    val message = raw.substring(idx + 1).trim().ifEmpty { raw }
    // Preserve full string for callers/logging, but keep the returned message human-friendly.
    return code to "$code: $message"
  }

  private fun parseLocationParams(paramsJson: String?): Triple<Long?, Long, String?> {
    if (paramsJson.isNullOrBlank()) {
      return Triple(null, 10_000L, null)
    }
    val root =
      try {
        json.parseToJsonElement(paramsJson).asObjectOrNull()
      } catch (_: Throwable) {
        null
      }
    val maxAgeMs = (root?.get("maxAgeMs") as? JsonPrimitive)?.content?.toLongOrNull()
    val timeoutMs =
      (root?.get("timeoutMs") as? JsonPrimitive)?.content?.toLongOrNull()?.coerceIn(1_000L, 60_000L)
        ?: 10_000L
    val desiredAccuracy =
      (root?.get("desiredAccuracy") as? JsonPrimitive)?.content?.trim()?.lowercase()
    return Triple(maxAgeMs, timeoutMs, desiredAccuracy)
  }

private data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)

private const val DEFAULT_SEAM_COLOR_ARGB: Long = 0xFF4F7A9A

private fun String.toJsonString(): String {
  val escaped =
    this.replace("\\", "\\\\")
      .replace("\"", "\\\"")
      .replace("\n", "\\n")
      .replace("\r", "\\r")
  return "\"$escaped\""
}

private fun JsonElement?.asObjectOrNull(): JsonObject? = this as? JsonObject

private fun JsonElement?.asStringOrNull(): String? =
  when (this) {
    is JsonNull -> null
    is JsonPrimitive -> content
    else -> null
  }

private fun parseHexColorArgb(raw: String?): Long? {
  val trimmed = raw?.trim().orEmpty()
  if (trimmed.isEmpty()) return null
  val hex = if (trimmed.startsWith("#")) trimmed.drop(1) else trimmed
  if (hex.length != 6) return null
  val rgb = hex.toLongOrNull(16) ?: return null
  return 0xFF000000L or rgb
}
