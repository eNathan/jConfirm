import java.text.BreakIterator

data class Column(
    val text: String,
    val minWidth: Int,
    val maxWidth: Int,
    val truncateRight: Boolean
)

private val ANSI_REGEX = """\u001B\[[;0-9]*m""".toRegex()

private fun String.stripAnsi() = replace(ANSI_REGEX, "")

/** 
 * Splits a string into user‐perceived characters (grapheme clusters). 
 */
private fun String.graphemeClusters(): List<String> {
  val it = BreakIterator.getCharacterInstance()
  it.setText(this)
  val clusters = mutableListOf<String>()
  var start = it.first()
  var end = it.next()
  while (end != BreakIterator.DONE) {
    clusters += substring(start, end)
    start = end
    end = it.next()
  }
  return clusters
}

fun row(separator: Char = '\t', vararg columns: Column): String {
  return columns.joinToString(separator.toString()) { col ->
    // 1) Strip ANSI for sizing, but remember where they were
    val parts = ANSI_REGEX.split(col.text)
    val codes = ANSI_REGEX.findAll(col.text).map { it.value }.toList()
    // Rebuild alternating segments: code/text/code/text...
    val segments = mutableListOf<Pair<Boolean,String>>()
    var ti = 0
    var ci = 0
    // start with text if text segment exists
    if (parts.isNotEmpty()) {
      segments += false to parts[0]
      ti = 1
    }
    while (ci < codes.size || ti < parts.size) {
      if (ci < codes.size) {
        segments += true to codes[ci++]
      }
      if (ti < parts.size) {
        segments += false to parts[ti++]
      }
    }
    // Extract all visible text, split into graphemes
    val visible = segments.filter { !it.first }.joinToString("") { it.second }
    val graphemes = visible.graphemeClusters()

    // 2) Truncate graphemes if needed
    val truncated = if (graphemes.size > col.maxWidth) {
      if (col.truncateRight) graphemes.take(col.maxWidth)
      else                  graphemes.takeLast(col.maxWidth)
    } else {
      graphemes
    }

    // 3) Pad with spaces if too short
    val padded = mutableListOf<String>().apply {
      addAll(truncated)
      repeat(col.minWidth - truncated.size.coerceAtLeast(0)) { add(" ") }
    }

    // 4) Now re‐interleave ANSI codes around the padded text.
    //    Simplest is: emit all leading codes, then our padded text, then all trailing codes.
    //    (This assumes you only used ANSI at the very start or end of col.text.)
    val leadingCodes = col.text.takeWhile { it == '\u001B' || it == '[' || it.isDigit() || it == ';' || it == 'm' }
    val trailingCodes = col.text.takeLastWhile { it == 'm' || it == '[' || it == ';' || it.isDigit() || it == '\u001B' }

    leadingCodes + padded.joinToString("") + trailingCodes
  }
}
