import java.util.regex.Pattern

data class Column(
    val text: String,
    val minWidth: Int,
    val maxWidth: Int,
    val truncateRight: Boolean
)

private val ANSI_REGEX = "\u001B\\[[;0-9]*m"
private val ANSI_WRAP = Pattern.compile("^(?:$ANSI_REGEX)+|(?:$ANSI_REGEX)+$")

fun row(separator: Char = '\t', vararg columns: Column): String {
  return columns.joinToString(separator.toString()) { col ->
    val t = col.text

    // 1) pull off any leading/trailing ANSI
    val matcher = ANSI_WRAP.matcher(t)
    var core = t
    val codes = mutableListOf<String>()
    while (matcher.find()) {
      codes += matcher.group()
    }
    codes.forEach { core = core.removePrefix(it).removeSuffix(it) }

    // 2) truncate by code-points
    val cpCount = core.codePointCount(0, core.length)
    val truncated = if (cpCount > col.maxWidth) {
      if (col.truncateRight) {
        val end = core.offsetByCodePoints(0, col.maxWidth)
        core.substring(0, end)
      } else {
        val start = core.offsetByCodePoints(0, cpCount - col.maxWidth)
        core.substring(start)
      }
    } else {
      core
    }

    // 3) pad to minWidth
    val padded = if (truncated.codePointCount(0, truncated.length) < col.minWidth) {
      truncated + " ".repeat(col.minWidth - truncated.codePointCount(0, truncated.length))
    } else {
      truncated
    }

    // 4) re-attach all your ANSI wraps (in original order)
    codes.joinToString("") + padded + codes.asReversed().joinToString("")
  }
}
