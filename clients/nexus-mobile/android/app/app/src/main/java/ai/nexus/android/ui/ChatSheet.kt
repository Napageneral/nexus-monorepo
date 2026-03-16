package ai.nexus.android.ui

import androidx.compose.runtime.Composable
import ai.nexus.android.MainViewModel
import ai.nexus.android.ui.chat.ChatSheetContent

@Composable
fun ChatSheet(viewModel: MainViewModel) {
  ChatSheetContent(viewModel = viewModel)
}
