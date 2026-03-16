package ai.nexus.android.protocol

import org.junit.Assert.assertEquals
import org.junit.Test

class NexusProtocolConstantsTest {
  @Test
  fun canvasCommandsUseStableStrings() {
    assertEquals("canvas.present", NexusCanvasCommand.Present.rawValue)
    assertEquals("canvas.hide", NexusCanvasCommand.Hide.rawValue)
    assertEquals("canvas.navigate", NexusCanvasCommand.Navigate.rawValue)
    assertEquals("canvas.eval", NexusCanvasCommand.Eval.rawValue)
    assertEquals("canvas.snapshot", NexusCanvasCommand.Snapshot.rawValue)
  }

  @Test
  fun capabilitiesUseStableStrings() {
    assertEquals("canvas", NexusCapability.Canvas.rawValue)
    assertEquals("camera", NexusCapability.Camera.rawValue)
    assertEquals("screen", NexusCapability.Screen.rawValue)
  }

  @Test
  fun screenCommandsUseStableStrings() {
    assertEquals("screen.record", NexusScreenCommand.Record.rawValue)
  }
}
