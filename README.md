import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.coroutineScope

/**
 * Returns a flow that emits elements from this flow that are not present in the other flow.
 * Both flows must be sorted by [comparator]. Extra elements in [other] are ignored.
 */
fun <T> Flow<T>.missing(other: Flow<T>, comparator: Comparator<T>): Flow<T> = flow {
    coroutineScope {
        // Feed each input flow into its own channel so we can "merge-diff" them.
        val leftCh = Channel<T>(capacity = Channel.BUFFERED)
        val rightCh = Channel<T>(capacity = Channel.BUFFERED)

        // Start collectors
        val leftJob = launch {
            try { this@missing.collect { leftCh.send(it) } }
            finally { leftCh.close() }
        }
        val rightJob = launch {
            try { other.collect { rightCh.send(it) } }
            finally { rightCh.close() }
        }

        suspend fun <E> ReceiveChannel<E>.recvOrNull(): E? =
            receiveCatching().getOrNull()

        var leftItem: T? = null
        var rightItem: T? = null
        var rightClosed = false

        while (true) {
            if (leftItem == null) {
                leftItem = leftCh.recvOrNull()
                if (leftItem == null) break // left exhausted → we're done
            }
            if (!rightClosed && rightItem == null) {
                rightItem = rightCh.recvOrNull()
                if (rightItem == null) {
                    rightClosed = true
                }
            }

            if (rightClosed) {
                // No more items on the right: everything left on the left is "missing".
                emit(leftItem!!)
                leftItem = null
                continue
            }

            // Compare current heads
            val cmp = comparator.compare(leftItem!!, rightItem!!)
            when {
                cmp < 0 -> {
                    // left < right → left element doesn't exist on right
                    emit(leftItem!!)
                    leftItem = null
                }
                cmp == 0 -> {
                    // Match → consume one from each, emit nothing
                    leftItem = null
                    rightItem = null
                }
                else -> {
                    // right < left → advance right (ignore extras on right)
                    rightItem = null
                }
            }
        }

        // Ensure children are cancelled if downstream cancels early
        leftJob.cancel()
        rightJob.cancel()
    }
}
