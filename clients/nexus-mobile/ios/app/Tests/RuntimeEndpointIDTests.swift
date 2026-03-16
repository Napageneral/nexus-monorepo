import NexusKit
import Network
import Testing
@testable import Nexus

@Suite struct RuntimeEndpointIDTests {
    @Test func stableIDForServiceDecodesAndNormalizesName() {
        let endpoint = NWEndpoint.service(
            name: "Nexus\\032Runtime   \\032  Node\n",
            type: "_nexus-gw._tcp",
            domain: "local.",
            interface: nil)

        #expect(RuntimeEndpointID.stableID(endpoint) == "_nexus-gw._tcp|local.|Nexus Runtime Node")
    }

    @Test func stableIDForNonServiceUsesEndpointDescription() {
        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host("127.0.0.1"), port: 4242)
        #expect(RuntimeEndpointID.stableID(endpoint) == String(describing: endpoint))
    }

    @Test func prettyDescriptionDecodesBonjourEscapes() {
        let endpoint = NWEndpoint.service(
            name: "Nexus\\032Runtime",
            type: "_nexus-gw._tcp",
            domain: "local.",
            interface: nil)

        let pretty = RuntimeEndpointID.prettyDescription(endpoint)
        #expect(pretty == BonjourEscapes.decode(String(describing: endpoint)))
        #expect(!pretty.localizedCaseInsensitiveContains("\\032"))
    }
}
