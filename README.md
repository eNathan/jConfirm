data class Column(
    val text: String,
    val minWidth: Int,
    val maxWidth: Int,
    val truncateRight: Boolean
)

/**
 * Helper function for displaying a table row.
 * Each cell is right-padded to at least minWidth,
 * and if it exceeds maxWidth it’s truncated:
 *  - by default removes characters from the left (keep rightmost)
 *  - if truncateRight==true removes from the right (keep leftmost)
 */
fun row(separator: Char = '\t', vararg columns: Column): String {
    return columns.joinToString(separator.toString()) { col ->
        // 1) truncate if too long
        val truncated = if (col.text.length > col.maxWidth) {
            if (col.truncateRight) 
                col.text.take(col.maxWidth) 
            else 
                col.text.takeLast(col.maxWidth)
        } else {
            col.text
        }
        // 2) pad on the right if too short
        if (truncated.length < col.minWidth) {
            truncated + " ".repeat(col.minWidth - truncated.length)
        } else {
            truncated
        }
    }
}
