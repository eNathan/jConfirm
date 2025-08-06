data class Column(
    val text: String,
    val minWidth: Int,
    val maxWidth: Int,
    val truncateRight: Boolean
)

private val ANSI_REGEX = """\u001B\[[;0-9]*m""".toRegex()

/**
 * Strip ANSI sequences for length calculations.
 */
private fun String.stripAnsi() = replace(ANSI_REGEX, "")

/**
 * Extract leading ANSI codes (e.g. "\u001B[32m\u001B[1m")
 */
private fun String.extractPrefixAnsi(): String {
  val match = """^((?:\u001B\[[;0-9]*m)+)""".toRegex().find(this)
  return match?.value ?: ""
}

/**
 * Extract trailing ANSI codes (e.g. "\u001B[0m")
 */
private fun String.extractSuffixAnsi(): String {
  val match = """((?:\u001B\[[;0-9]*m)+)$""".toRegex().find(this)
  return match?.value ?: ""
}

fun row(separator: Char = '\t', vararg columns: Column): String {
  return columns.joinToString(separator.toString()) { col ->
    // pull out any ANSI around the text
    val prefixAnsi = col.text.extractPrefixAnsi()
    val suffixAnsi = col.text.extractSuffixAnsi()
    val core = col.text
      .removePrefix(prefixAnsi)
      .removeSuffix(suffixAnsi)

    // work on visible text only
    val visible = core.stripAnsi()

    // 1) truncate visible if too long
    val truncatedVisible = if (visible.length > col.maxWidth) {
      if (col.truncateRight)
        visible.take(col.maxWidth)
      else
        visible.takeLast(col.maxWidth)
    } else visible

    // 2) pad visible if too short
    val paddedVisible = if (truncatedVisible.length < col.minWidth) {
      truncatedVisible + " ".repeat(col.minWidth - truncatedVisible.length)
    } else truncatedVisible

    // re-insert ANSI around the visible content
    prefixAnsi + paddedVisible + suffixAnsi
  }
}
