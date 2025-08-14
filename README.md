import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.channels.ReceiveChannel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.produceIn

/**
 * Similar to zip, but continues after one flow completes, emitting nulls for the shorter one.
 * Completes when both flows complete. Never emits a pair where both are null.
 */
@Suppress("UNCHECKED_CAST") // nullable padding is intentional
inline fun <T1, T2, R> Flow<T1>.zipFull(
    other: Flow<T2>,
    crossinline transform: suspend (T1?, T2?) -> R
): Flow<R> = flow {
    coroutineScope {
        val c1: ReceiveChannel<T1> = this@zipFull.produceIn(this)
        val c2: ReceiveChannel<T2> = other.produceIn(this)
        try {
            while (true) {
                val r1 = c1.receiveCatching()
                val r2 = c2.receiveCatching()

                // Propagate upstream exceptions immediately.
                r1.exceptionOrNull()?.let { throw it }
                r2.exceptionOrNull()?.let { throw it }

                val v1: T1? = r1.getOrNull()
                val v2: T2? = r2.getOrNull()

                // If both are done, terminate without emitting a (null, null).
                if (v1 == null && v2 == null) break

                emit(transform(v1, v2))
            }
        } finally {
            c1.cancel()
            c2.cancel()
        }
    }
}
