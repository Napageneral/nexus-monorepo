package ai.nexus.android.runtime

data class RuntimeEndpoint(
  val stableId: String,
  val name: String,
  val host: String,
  val port: Int,
  val lanHost: String? = null,
  val tailnetDns: String? = null,
  val runtimePort: Int? = null,
  val canvasPort: Int? = null,
  val tlsEnabled: Boolean = false,
  val tlsFingerprintSha256: String? = null,
) {
  companion object {
    fun manual(host: String, port: Int): RuntimeEndpoint =
      RuntimeEndpoint(
        stableId = "manual|${host.lowercase()}|$port",
        name = "$host:$port",
        host = host,
        port = port,
        tlsEnabled = false,
        tlsFingerprintSha256 = null,
      )
  }
}
