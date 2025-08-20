import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.launch
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.consumeAsFlow

/**
 * Map an input flow to an output flow using a sub-mapper function
 * which will be ran in separate coroutines, with multiple instances
 * of the inner mapper running in parallel.
 */
fun <T, R> Flow<T>.parallelFlowMap(
    parallelism: Int,
    mapper: suspend Flow<T>.(Int) -> Flow<R>
): Flow<R> = channelFlow {
    require(parallelism > 0) { "parallelism must be > 0" }

    // Per-worker SPSC channels (far less contention than MPMC).
    // Tune capacity if you need more smoothing; 64 is a good default.
    val workerCapacity = Channel.BUFFERED
    val workers = Array(parallelism) { Channel<T>(workerCapacity) }

    // Upstream -> round-robin distributor (single sender, no contention).
    val distributor = launch(start = CoroutineStart.UNDISPATCHED) {
        var i = 0
        try {
            collect { value ->
                val ch = workers[i]
                // Fast path: non-suspending trySend; fallback to send if full.
                if (ch.trySend(value).isFailure) ch.send(value)
                i++
                if (i == parallelism) i = 0
            }
        } finally {
            // Close all worker inputs when upstream completes or fails.
            workers.forEach { it.close() }
        }
    }

    // Start workers: each consumes its own channel and applies the mapper once.
    repeat(parallelism) { idx ->
        launch {
            // Build the mapped flow ONCE per worker over its input stream.
            val outFlow = workers[idx].consumeAsFlow().mapper(idx)
            // Emit downstream; use trySend fast path to reduce suspends.
            outFlow.collect { item ->
                val r = trySend(item)
                if (r.isFailure) send(item)
            }
        }
    }

    // Ensure distributor finishes; channelFlow will await all children anyway.
    distributor.join()
}
****
