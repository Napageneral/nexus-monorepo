package ai.nexus.android.runtime

import android.util.Log
import java.util.Locale
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener

data class RuntimeClientInfo(
  val id: String,
  val displayName: String?,
  val version: String,
  val platform: String,
  val mode: String,
  val instanceId: String?,
  val deviceFamily: String?,
  val modelIdentifier: String?,
)

data class RuntimeConnectOptions(
  val role: String,
  val scopes: List<String>,
  val caps: List<String>,
  val commands: List<String>,
  val permissions: Map<String, Boolean>,
  val client: RuntimeClientInfo,
  val userAgent: String? = null,
)

class RuntimeSession(
  private val scope: CoroutineScope,
  private val identityStore: DeviceIdentityStore,
  private val deviceAuthStore: DeviceAuthStore,
  private val onConnected: (serverName: String?, remoteAddress: String?, mainSessionKey: String?) -> Unit,
  private val onDisconnected: (message: String) -> Unit,
  private val onEvent: (event: String, payloadJson: String?) -> Unit,
  private val onInvoke: (suspend (InvokeRequest) -> InvokeResult)? = null,
  private val onTlsFingerprint: ((stableId: String, fingerprint: String) -> Unit)? = null,
) {
  data class InvokeRequest(
    val id: String,
    val endpointId: String?,
    val command: String,
    val paramsJson: String?,
    val timeoutMs: Long?,
  )

  data class InvokeResult(val ok: Boolean, val payloadJson: String?, val error: ErrorShape?) {
    companion object {
      fun ok(payloadJson: String?) = InvokeResult(ok = true, payloadJson = payloadJson, error = null)
      fun error(code: String, message: String) =
        InvokeResult(ok = false, payloadJson = null, error = ErrorShape(code = code, message = message))
    }
  }

  data class ErrorShape(val code: String, val message: String)

  private val json = Json { ignoreUnknownKeys = true }
  private val writeLock = Mutex()
  private val pending = ConcurrentHashMap<String, CompletableDeferred<RpcResponse>>()

  @Volatile private var mainSessionKey: String? = null

  private data class DesiredConnection(
    val endpoint: RuntimeEndpoint,
    val token: String?,
    val password: String?,
    val options: RuntimeConnectOptions,
    val tls: RuntimeTlsParams?,
  )

  private var desired: DesiredConnection? = null
  private var job: Job? = null
  @Volatile private var currentConnection: Connection? = null

  fun connect(
    endpoint: RuntimeEndpoint,
    token: String?,
    password: String?,
    options: RuntimeConnectOptions,
    tls: RuntimeTlsParams? = null,
  ) {
    desired = DesiredConnection(endpoint, token, password, options, tls)
    if (job == null) {
      job = scope.launch(Dispatchers.IO) { runLoop() }
    }
  }

  fun disconnect() {
    desired = null
    currentConnection?.closeQuietly()
    scope.launch(Dispatchers.IO) {
      job?.cancelAndJoin()
      job = null
      mainSessionKey = null
      onDisconnected("Offline")
    }
  }

  fun reconnect() {
    currentConnection?.closeQuietly()
  }
  fun currentMainSessionKey(): String? = mainSessionKey

  suspend fun sendNodeEvent(event: String, payloadJson: String?) {
    val conn = currentConnection ?: return
    val mapped = mapEventForRuntimeIngest(event, payloadJson) ?: return
    try {
      conn.sendEvent(mapped.first, mapped.second)
    } catch (err: Throwable) {
      Log.w("NexusRuntime", "runtime event failed: ${err.message ?: err::class.java.simpleName}")
    }
  }

  suspend fun request(method: String, paramsJson: String?, timeoutMs: Long = 15_000): String {
    val conn = currentConnection ?: throw IllegalStateException("not connected")
    val params =
      if (paramsJson.isNullOrBlank()) {
        null
      } else {
        json.parseToJsonElement(paramsJson)
      }
    val res = conn.request(method, params, timeoutMs)
    if (res.ok) return res.payloadJson ?: ""
    val err = res.error
    throw IllegalStateException("${err?.code ?: "UNAVAILABLE"}: ${err?.message ?: "request failed"}")
  }

  private fun mapEventForRuntimeIngest(
    event: String,
    payloadJson: String?,
  ): Pair<String, JsonElement?>? {
    val normalized = event.trim()
    if (normalized.isEmpty()) return null
    return when (normalized) {
      "event.ingest" -> "event.ingest" to payloadJson?.let(::parseJsonOrNull)
      "agent.request" -> mapAgentRequestEvent(payloadJson)
      "voice.transcript" -> mapVoiceTranscriptEvent(payloadJson)
      "exec.started", "exec.finished", "exec.denied" -> mapExecSystemEvent(normalized, payloadJson)
      "chat.subscribe", "chat.unsubscribe" -> null
      else -> null
    }
  }

  private fun mapAgentRequestEvent(payloadJson: String?): Pair<String, JsonElement?>? {
    val payload = payloadJson?.let(::parseJsonOrNull)?.asObjectOrNull() ?: return null
    val message = payload["message"].asStringOrNull()?.trim().orEmpty()
    if (message.isEmpty()) return null
    val idempotencyRaw =
      payload["idempotencyKey"].asStringOrNull()?.trim().orEmpty().ifEmpty {
        payload["key"].asStringOrNull()?.trim().orEmpty()
      }
    val idempotencyKey = idempotencyRaw.ifEmpty { UUID.randomUUID().toString() }
    val mapped =
      buildJsonObject {
        put("message", JsonPrimitive(message))
        put("idempotencyKey", JsonPrimitive(idempotencyKey))
        payload["sessionKey"].asStringOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let {
          put("sessionKey", JsonPrimitive(it))
        }
        payload["thinking"].asStringOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let {
          put("thinking", JsonPrimitive(it))
        }
        payload["deliver"].asBooleanOrNull()?.let {
          put("deliver", JsonPrimitive(it))
        }
        payload["to"].asStringOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let {
          put("to", JsonPrimitive(it))
        }
        payload["channel"].asStringOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let {
          put("platform", JsonPrimitive(it))
        }
        payload["timeoutSeconds"].asLongOrNull()?.let {
          put("timeout", JsonPrimitive(it))
        }
      }
    return "event.ingest" to mapped
  }

  private fun mapVoiceTranscriptEvent(payloadJson: String?): Pair<String, JsonElement?>? {
    val payload = payloadJson?.let(::parseJsonOrNull)?.asObjectOrNull() ?: return null
    val text = payload["text"].asStringOrNull()?.trim().orEmpty()
    if (text.isEmpty()) return null
    val mapped =
      buildJsonObject {
        put("message", JsonPrimitive(text))
        put("idempotencyKey", JsonPrimitive("voice-${UUID.randomUUID()}"))
        put("deliver", JsonPrimitive(false))
        put("sync", JsonPrimitive(true))
        payload["sessionKey"].asStringOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let {
          put("sessionKey", JsonPrimitive(it))
        }
      }
    return "event.ingest" to mapped
  }

  private fun mapExecSystemEvent(
    event: String,
    payloadJson: String?,
  ): Pair<String, JsonElement?>? {
    val payload = payloadJson?.let(::parseJsonOrNull)?.asObjectOrNull() ?: return null
    val text = buildExecSystemText(event, payload) ?: return null
    val mapped =
      buildJsonObject {
        put("text", JsonPrimitive(text))
        payload["sessionKey"].asStringOrNull()?.trim()?.takeIf { it.isNotEmpty() }?.let {
          put("sessionKey", JsonPrimitive(it))
        }
      }
    return "system.presence" to mapped
  }

  private fun buildExecSystemText(event: String, payload: JsonObject): String? {
    val nodeId = payload["host"].asStringOrNull()?.trim().orEmpty().ifEmpty { "device" }
    val runId = payload["runId"].asStringOrNull()?.trim().orEmpty()
    val command = payload["command"].asStringOrNull()?.trim().orEmpty()
    val output = payload["output"].asStringOrNull()?.trim().orEmpty()
    val reason = payload["reason"].asStringOrNull()?.trim().orEmpty()
    val timedOut = payload["timedOut"].asBooleanOrNull() == true
    val exitCode = payload["exitCode"].asLongOrNull()?.toString() ?: "?"

    return when (event) {
      "exec.started" -> {
        val base = StringBuilder("Exec started (node=$nodeId")
        if (runId.isNotEmpty()) base.append(" id=$runId")
        base.append(")")
        if (command.isNotEmpty()) base.append(": $command")
        base.toString()
      }
      "exec.finished" -> {
        val exitLabel = if (timedOut) "timeout" else "code $exitCode"
        val base = StringBuilder("Exec finished (node=$nodeId")
        if (runId.isNotEmpty()) base.append(" id=$runId")
        base.append(", $exitLabel)")
        if (output.isNotEmpty()) base.append("\n").append(output)
        base.toString()
      }
      "exec.denied" -> {
        val base = StringBuilder("Exec denied (node=$nodeId")
        if (runId.isNotEmpty()) base.append(" id=$runId")
        if (reason.isNotEmpty()) base.append(", $reason")
        base.append(")")
        if (command.isNotEmpty()) base.append(": $command")
        base.toString()
      }
      else -> null
    }
  }

  private data class RpcResponse(val id: String, val ok: Boolean, val payloadJson: String?, val error: ErrorShape?)

  private inner class Connection(
    private val endpoint: RuntimeEndpoint,
    private val token: String?,
    private val password: String?,
    private val options: RuntimeConnectOptions,
    private val tls: RuntimeTlsParams?,
  ) {
    private val connectDeferred = CompletableDeferred<Unit>()
    private val closedDeferred = CompletableDeferred<Unit>()
    private val isClosed = AtomicBoolean(false)
    private val connectNonceDeferred = CompletableDeferred<String?>()
    private val client: OkHttpClient = buildClient()
    private var socket: WebSocket? = null
    private val loggerTag = "NexusRuntime"

    val remoteAddress: String =
      if (endpoint.host.contains(":")) {
        "[${endpoint.host}]:${endpoint.port}"
      } else {
        "${endpoint.host}:${endpoint.port}"
      }

    suspend fun connect() {
      val scheme = if (tls != null) "wss" else "ws"
      val url = "$scheme://${endpoint.host}:${endpoint.port}"
      val request = Request.Builder().url(url).build()
      socket = client.newWebSocket(request, Listener())
      try {
        connectDeferred.await()
      } catch (err: Throwable) {
        throw err
      }
    }

    suspend fun request(method: String, params: JsonElement?, timeoutMs: Long): RpcResponse {
      val id = UUID.randomUUID().toString()
      val deferred = CompletableDeferred<RpcResponse>()
      pending[id] = deferred
      val frame =
        buildJsonObject {
          put("type", JsonPrimitive("req"))
          put("id", JsonPrimitive(id))
          put("method", JsonPrimitive(method))
          if (params != null) put("params", params)
        }
      sendJson(frame)
      return try {
        withTimeout(timeoutMs) { deferred.await() }
      } catch (err: TimeoutCancellationException) {
        pending.remove(id)
        throw IllegalStateException("request timeout")
      }
    }

    suspend fun sendJson(obj: JsonObject) {
      val jsonString = obj.toString()
      writeLock.withLock {
        socket?.send(jsonString)
      }
    }

    suspend fun sendEvent(event: String, payload: JsonElement?) {
      val frame =
        buildJsonObject {
          put("type", JsonPrimitive("event"))
          put("event", JsonPrimitive(event))
          if (payload != null) {
            put("payload", payload)
          }
        }
      sendJson(frame)
    }

    suspend fun awaitClose() = closedDeferred.await()

    fun closeQuietly() {
      if (isClosed.compareAndSet(false, true)) {
        socket?.close(1000, "bye")
        socket = null
        closedDeferred.complete(Unit)
      }
    }

    private fun buildClient(): OkHttpClient {
      val builder = OkHttpClient.Builder()
      val tlsConfig = buildRuntimeTlsConfig(tls) { fingerprint ->
        onTlsFingerprint?.invoke(tls?.stableId ?: endpoint.stableId, fingerprint)
      }
      if (tlsConfig != null) {
        builder.sslSocketFactory(tlsConfig.sslSocketFactory, tlsConfig.trustManager)
        builder.hostnameVerifier(tlsConfig.hostnameVerifier)
      }
      return builder.build()
    }

    private inner class Listener : WebSocketListener() {
      override fun onOpen(webSocket: WebSocket, response: Response) {
        scope.launch {
          try {
            val nonce = awaitConnectNonce()
            sendConnect(nonce)
          } catch (err: Throwable) {
            connectDeferred.completeExceptionally(err)
            closeQuietly()
          }
        }
      }

      override fun onMessage(webSocket: WebSocket, text: String) {
        scope.launch { handleMessage(text) }
      }

      override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
        if (!connectDeferred.isCompleted) {
          connectDeferred.completeExceptionally(t)
        }
        if (isClosed.compareAndSet(false, true)) {
          failPending()
          closedDeferred.complete(Unit)
          onDisconnected("Runtime error: ${t.message ?: t::class.java.simpleName}")
        }
      }

      override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
        if (!connectDeferred.isCompleted) {
          connectDeferred.completeExceptionally(IllegalStateException("Runtime closed: $reason"))
        }
        if (isClosed.compareAndSet(false, true)) {
          failPending()
          closedDeferred.complete(Unit)
          onDisconnected("Runtime closed: $reason")
        }
      }
    }

    private suspend fun sendConnect(connectNonce: String?) {
      val identity = identityStore.loadOrCreate()
      val storedToken = deviceAuthStore.loadToken(identity.deviceId, options.role)
      val trimmedToken = token?.trim().orEmpty()
      val authToken = if (storedToken.isNullOrBlank()) trimmedToken else storedToken
      val canFallbackToShared = !storedToken.isNullOrBlank() && trimmedToken.isNotBlank()
      val payload = buildConnectParams(identity, connectNonce, authToken, password?.trim())
      val res = request("connect", payload, timeoutMs = 8_000)
      if (!res.ok) {
        val msg = res.error?.message ?: "connect failed"
        if (canFallbackToShared) {
          deviceAuthStore.clearToken(identity.deviceId, options.role)
        }
        throw IllegalStateException(msg)
      }
      val payloadJson = res.payloadJson ?: throw IllegalStateException("connect failed: missing payload")
      val obj = json.parseToJsonElement(payloadJson).asObjectOrNull() ?: throw IllegalStateException("connect failed")
      val serverName = obj["server"].asObjectOrNull()?.get("host").asStringOrNull()
      val authObj = obj["auth"].asObjectOrNull()
      val deviceToken = authObj?.get("deviceToken").asStringOrNull()
      val authRole = authObj?.get("role").asStringOrNull() ?: options.role
      if (!deviceToken.isNullOrBlank()) {
        deviceAuthStore.saveToken(identity.deviceId, authRole, deviceToken)
      }
      val sessionDefaults =
        obj["snapshot"].asObjectOrNull()
          ?.get("sessionDefaults").asObjectOrNull()
      mainSessionKey = sessionDefaults?.get("mainSessionKey").asStringOrNull()
      onConnected(serverName, remoteAddress, mainSessionKey)
      connectDeferred.complete(Unit)
    }

    private fun buildConnectParams(
      identity: DeviceIdentity,
      connectNonce: String?,
      authToken: String,
      authPassword: String?,
    ): JsonObject {
      val client = options.client
      val locale = Locale.getDefault().toLanguageTag()
      val clientObj =
        buildJsonObject {
          put("id", JsonPrimitive(client.id))
          client.displayName?.let { put("displayName", JsonPrimitive(it)) }
          put("version", JsonPrimitive(client.version))
          put("platform", JsonPrimitive(client.platform))
          put("mode", JsonPrimitive(client.mode))
          client.instanceId?.let { put("instanceId", JsonPrimitive(it)) }
          client.deviceFamily?.let { put("deviceFamily", JsonPrimitive(it)) }
          client.modelIdentifier?.let { put("modelIdentifier", JsonPrimitive(it)) }
        }

      val password = authPassword?.trim().orEmpty()
      val authJson =
        when {
          authToken.isNotEmpty() ->
            buildJsonObject {
              put("token", JsonPrimitive(authToken))
            }
          password.isNotEmpty() ->
            buildJsonObject {
              put("password", JsonPrimitive(password))
            }
          else -> null
        }

      val signedAtMs = System.currentTimeMillis()
      val payload =
        buildDeviceAuthPayload(
          deviceId = identity.deviceId,
          clientId = client.id,
          clientMode = client.mode,
          role = options.role,
          scopes = options.scopes,
          signedAtMs = signedAtMs,
          token = if (authToken.isNotEmpty()) authToken else null,
          nonce = connectNonce,
        )
      val signature = identityStore.signPayload(payload, identity)
      val publicKey = identityStore.publicKeyBase64Url(identity)
      val deviceJson =
        if (!signature.isNullOrBlank() && !publicKey.isNullOrBlank()) {
          buildJsonObject {
            put("id", JsonPrimitive(identity.deviceId))
            put("publicKey", JsonPrimitive(publicKey))
            put("signature", JsonPrimitive(signature))
            put("signedAt", JsonPrimitive(signedAtMs))
            if (!connectNonce.isNullOrBlank()) {
              put("nonce", JsonPrimitive(connectNonce))
            }
          }
        } else {
          null
        }

      return buildJsonObject {
        put("minProtocol", JsonPrimitive(RUNTIME_PROTOCOL_VERSION))
        put("maxProtocol", JsonPrimitive(RUNTIME_PROTOCOL_VERSION))
        put("client", clientObj)
        if (options.caps.isNotEmpty()) put("caps", JsonArray(options.caps.map(::JsonPrimitive)))
        if (options.commands.isNotEmpty()) put("commands", JsonArray(options.commands.map(::JsonPrimitive)))
        if (options.permissions.isNotEmpty()) {
          put(
            "permissions",
            buildJsonObject {
              options.permissions.forEach { (key, value) ->
                put(key, JsonPrimitive(value))
              }
            },
          )
        }
        put("role", JsonPrimitive(options.role))
        if (options.scopes.isNotEmpty()) put("scopes", JsonArray(options.scopes.map(::JsonPrimitive)))
        authJson?.let { put("auth", it) }
        deviceJson?.let { put("device", it) }
        put("locale", JsonPrimitive(locale))
        options.userAgent?.trim()?.takeIf { it.isNotEmpty() }?.let {
          put("userAgent", JsonPrimitive(it))
        }
      }
    }

    private suspend fun handleMessage(text: String) {
      val frame = json.parseToJsonElement(text).asObjectOrNull() ?: return
      when (frame["type"].asStringOrNull()) {
        "res" -> handleResponse(frame)
        "event" -> handleEvent(frame)
      }
    }

    private fun handleResponse(frame: JsonObject) {
      val id = frame["id"].asStringOrNull() ?: return
      val ok = frame["ok"].asBooleanOrNull() ?: false
      val payloadJson = frame["payload"]?.let { payload -> payload.toString() }
      val error =
        frame["error"]?.asObjectOrNull()?.let { obj ->
          val code = obj["code"].asStringOrNull() ?: "UNAVAILABLE"
          val msg = obj["message"].asStringOrNull() ?: "request failed"
          ErrorShape(code, msg)
        }
      pending.remove(id)?.complete(RpcResponse(id, ok, payloadJson, error))
    }

    private fun handleEvent(frame: JsonObject) {
      val event = frame["event"].asStringOrNull() ?: return
      val payloadJson =
        frame["payload"]?.let { it.toString() } ?: frame["payloadJSON"].asStringOrNull()
      if (event == "connect.challenge") {
        val nonce = extractConnectNonce(payloadJson)
        if (!connectNonceDeferred.isCompleted) {
          connectNonceDeferred.complete(nonce)
        }
        return
      }
      if (event == "invoke.request" && payloadJson != null && onInvoke != null) {
        handleInvokeEvent(payloadJson)
        return
      }
      onEvent(event, payloadJson)
    }

    private suspend fun awaitConnectNonce(): String? {
      if (isLoopbackHost(endpoint.host)) return null
      return try {
        withTimeout(2_000) { connectNonceDeferred.await() }
      } catch (_: Throwable) {
        null
      }
    }

    private fun extractConnectNonce(payloadJson: String?): String? {
      if (payloadJson.isNullOrBlank()) return null
      val obj = parseJsonOrNull(payloadJson)?.asObjectOrNull() ?: return null
      return obj["nonce"].asStringOrNull()
    }

    private fun handleInvokeEvent(payloadJson: String) {
      val payload =
        try {
          json.parseToJsonElement(payloadJson).asObjectOrNull()
        } catch (_: Throwable) {
          null
        } ?: return
      val id = payload["request_id"].asStringOrNull() ?: return
      val endpointId = payload["endpoint_id"].asStringOrNull()
      val command = payload["command"].asStringOrNull() ?: return
      val params =
        payload["payload"]?.let { value -> if (value is JsonNull) null else value.toString() }
      val timeoutMs = payload["timeout_ms"].asLongOrNull()
      scope.launch {
        val result =
          try {
            onInvoke?.invoke(InvokeRequest(id, endpointId, command, params, timeoutMs))
              ?: InvokeResult.error("UNAVAILABLE", "invoke handler missing")
          } catch (err: Throwable) {
            invokeErrorFromThrowable(err)
          }
        sendInvokeResult(id, result)
      }
    }

    private suspend fun sendInvokeResult(id: String, result: InvokeResult) {
      val parsedPayload = result.payloadJson?.let { parseJsonOrNull(it) }
      val params =
        buildJsonObject {
          put("request_id", JsonPrimitive(id))
          put("ok", JsonPrimitive(result.ok))
          if (parsedPayload != null) {
            put("payload", parsedPayload)
          }
          result.error?.let { err ->
            put(
              "error",
              buildJsonObject {
                put("code", JsonPrimitive(err.code))
                put("message", JsonPrimitive(err.message))
              },
            )
          }
        }
      try {
        sendEvent("invoke.result", params)
      } catch (err: Throwable) {
        Log.w(loggerTag, "invoke.result failed: ${err.message ?: err::class.java.simpleName}")
      }
    }

    private fun invokeErrorFromThrowable(err: Throwable): InvokeResult {
      val msg = err.message?.trim().takeIf { !it.isNullOrEmpty() } ?: err::class.java.simpleName
      val parts = msg.split(":", limit = 2)
      if (parts.size == 2) {
        val code = parts[0].trim()
        val rest = parts[1].trim()
        if (code.isNotEmpty() && code.all { it.isUpperCase() || it == '_' }) {
          return InvokeResult.error(code = code, message = rest.ifEmpty { msg })
        }
      }
      return InvokeResult.error(code = "UNAVAILABLE", message = msg)
    }

    private fun failPending() {
      for ((_, waiter) in pending) {
        waiter.cancel()
      }
      pending.clear()
    }
  }

  private suspend fun runLoop() {
    var attempt = 0
    while (scope.isActive) {
      val target = desired
      if (target == null) {
        currentConnection?.closeQuietly()
        currentConnection = null
        delay(250)
        continue
      }

      try {
        onDisconnected(if (attempt == 0) "Connecting…" else "Reconnecting…")
        connectOnce(target)
        attempt = 0
      } catch (err: Throwable) {
        attempt += 1
        onDisconnected("Runtime error: ${err.message ?: err::class.java.simpleName}")
        val sleepMs = minOf(8_000L, (350.0 * Math.pow(1.7, attempt.toDouble())).toLong())
        delay(sleepMs)
      }
    }
  }

  private suspend fun connectOnce(target: DesiredConnection) = withContext(Dispatchers.IO) {
    val conn = Connection(target.endpoint, target.token, target.password, target.options, target.tls)
    currentConnection = conn
    try {
      conn.connect()
      conn.awaitClose()
    } finally {
      currentConnection = null
      mainSessionKey = null
    }
  }

  private fun buildDeviceAuthPayload(
    deviceId: String,
    clientId: String,
    clientMode: String,
    role: String,
    scopes: List<String>,
    signedAtMs: Long,
    token: String?,
    nonce: String?,
  ): String {
    val scopeString = scopes.joinToString(",")
    val authToken = token.orEmpty()
    val version = if (nonce.isNullOrBlank()) "v1" else "v2"
    val parts =
      mutableListOf(
        version,
        deviceId,
        clientId,
        clientMode,
        role,
        scopeString,
        signedAtMs.toString(),
        authToken,
      )
    if (!nonce.isNullOrBlank()) {
      parts.add(nonce)
    }
    return parts.joinToString("|")
  }

  private fun isLoopbackHost(raw: String?): Boolean {
    val host = raw?.trim()?.lowercase().orEmpty()
    if (host.isEmpty()) return false
    if (host == "localhost") return true
    if (host == "::1") return true
    if (host == "0.0.0.0" || host == "::") return true
    return host.startsWith("127.")
  }
}

private fun JsonElement?.asObjectOrNull(): JsonObject? = this as? JsonObject

private fun JsonElement?.asStringOrNull(): String? =
  when (this) {
    is JsonNull -> null
    is JsonPrimitive -> content
    else -> null
  }

private fun JsonElement?.asBooleanOrNull(): Boolean? =
  when (this) {
    is JsonPrimitive -> {
      val c = content.trim()
      when {
        c.equals("true", ignoreCase = true) -> true
        c.equals("false", ignoreCase = true) -> false
        else -> null
      }
    }
    else -> null
  }

private fun JsonElement?.asLongOrNull(): Long? =
  when (this) {
    is JsonPrimitive -> content.toLongOrNull()
    else -> null
  }

private fun parseJsonOrNull(payload: String): JsonElement? {
  val trimmed = payload.trim()
  if (trimmed.isEmpty()) return null
  return try {
    Json.parseToJsonElement(trimmed)
  } catch (_: Throwable) {
    null
  }
}
