import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import java.io.*
import java.nio.charset.Charset
import java.util.concurrent.atomic.AtomicBoolean

/**
 * One instance per program.
 * - Redraws the “active area” at most once per [frameMillis].
 * - Completed lines can be printed once to scrollback, or skipped.
 * - Supports fixed TOP/BOTTOM lines around the NATURAL list.
 * - Thread-safe via a single-thread actor.
 *
 * Closeable:
 * - close() drains pending messages, performs a final render, and shuts down.
 */
class LineDisplay(
    private val frameMillis: Long = 50L,                           // ~20 fps
    outCharset: Charset? = null                                    // force e.g. StandardCharsets.UTF_8 if desired
) : Closeable {

    enum class Location { TOP, NATURAL, BOTTOM }

    /* ──────────────────────────── PUBLIC API ──────────────────────────── */

    inner class Line internal constructor() {

        var text: String
            get() = _text
            set(v) {
                _text = v
                if (!closed.get()) messages.trySend(Msg.Update(this, v))
            }

        /**
         * Mark as finished.
         * @param finalPrint if true, print once into scrollback; if false, drop silently.
         */
        fun complete(finalPrint: Boolean = true) {
            if (!closed.get()) messages.trySend(Msg.Complete(this, finalPrint))
        }

        // only a local cache; actor maintains the canonical copy
        @Volatile private var _text: String = ""
    }

    /** Create a new (initially empty) line in the chosen [location]. */
    fun add(location: Location = Location.NATURAL): Line {
        val l = Line()
        if (!closed.get()) messages.trySend(Msg.Add(l, location))
        return l
    }

    /* ───────────────────────── IMPLEMENTATION ─────────────────────────── */

    private sealed interface Msg {
        data class Add(val line: Line, val loc: Location) : Msg
        data class Update(val line: Line, val text: String) : Msg
        data class Complete(val line: Line, val final: Boolean) : Msg
        data object Tick : Msg
        data class Shutdown(val done: CompletableDeferred<Unit>) : Msg
    }

    private data class Entry(
        val line: Line,
        var text: String,
        val loc: Location,
        var done: Boolean = false,
        var finalPrint: Boolean = true
    )

    private val messages = Channel<Msg>(Channel.UNLIMITED)

    private val dispatcher = newSingleThreadContext("LineDisplayRender")
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    private val printLock = Any()
    private val writer: BufferedWriter
    private val closed = AtomicBoolean(false)

    init {
        // Resolve an output charset that matches the console, to preserve Unicode.
        val cs: Charset = outCharset
            ?: runCatching { System.console()?.charset() }.getOrNull()
            ?: Charset.defaultCharset()

        writer = BufferedWriter(OutputStreamWriter(FileOutputStream(FileDescriptor.out), cs))

        // Ticker: coalesce bursts; still renders even if no new messages arrive.
        tickerJob = scope.launch {
            while (isActive) {
                delay(frameMillis)
                messages.send(Msg.Tick)
            }
        }

        actorJob = scope.launch { actorLoop() }
    }

    private lateinit var actorJob: Job
    private lateinit var tickerJob: Job

    private suspend fun actorLoop() {
        val active = mutableListOf<Entry>()
        var dirty = false
        var prevActive = 0

        fun handle(msg: Msg) {
            when (msg) {
                is Msg.Add -> {
                    active += Entry(msg.line, "", msg.loc)
                    dirty = true
                }
                is Msg.Update -> {
                    active.find { it.line === msg.line }?.let { it.text = msg.text; dirty = true }
                }
                is Msg.Complete -> {
                    active.find { it.line === msg.line }?.apply {
                        done = true
                        finalPrint = msg.final
                        dirty = true
                    }
                }
                is Msg.Tick -> {
                    if (dirty) {
                        prevActive = render(active, prevActive)
                        dirty = false
                    }
                }
                is Msg.Shutdown -> {
                    // Drain anything that arrived before/after Shutdown enqueued.
                    while (true) {
                        val next = messages.tryReceive().getOrNull() ?: break
                        if (next is Msg.Shutdown) continue  // ignore duplicates
                        handle(next)
                    }
                    // Final render even if not dirty (caller asked for it)
                    prevActive = render(active, prevActive)
                    // From now on, we stop; caller will close channel/dispatcher.
                    msg.done.complete(Unit)
                    throw StopActor // break outer loop cleanly
                }
            }
        }

        try {
            for (msg in messages) handle(msg)
        } catch (_: StopActor) {
            // normal shutdown path
        }
    }

    // Marker exception to leave the actor's for-loop
    private object StopActor : RuntimeException()

    /**
     * One full paint of the active area.
     * Cursor math:
     *  - Move up by the count of *previous* active lines.
     *  - Clear from cursor down (old active area disappears).
     *  - Print newly completed (toScroll) → become permanent scrollback.
     *  - Print current active (top → natural → bottom).
     *  - Cursor ends *after* the last active line, ready for next frame.
     */
    private fun render(list: MutableList<Entry>, prevLines: Int): Int {
        val completed = list.filter { it.done }
        val toScroll = completed.filter { it.finalPrint }
        val ongoing = list.filterNot { it.done }

        val top = ongoing.filter { it.loc == Location.TOP }
        val natural = ongoing.filter { it.loc == Location.NATURAL }
        val bottom = ongoing.filter { it.loc == Location.BOTTOM }

        val buf = StringBuilder(256 + (ongoing.size + toScroll.size) * 32)

        if (prevLines > 0) buf.append("\u001B[").append(prevLines).append('A')
        buf.append('\r').append("\u001B[0J")

        for (e in toScroll) {
            buf.append(e.text).append('\n')         // exact text; no slicing → safe for Unicode
        }

        fun emit(batch: List<Entry>) {
            for (e in batch) {
                buf.append("\r\u001B[2K").append(e.text).append('\n')
            }
        }
        emit(top); emit(natural); emit(bottom)

        synchronized(printLock) {
            writer.write(buf.toString())
            writer.flush()
        }

        list.removeAll(completed)
        return top.size + natural.size + bottom.size
    }

    /* ───────────────────────────── CLOSEABLE ───────────────────────────── */

    override fun close() {
        if (!closed.compareAndSet(false, true)) return

        runBlocking {
            // Stop the ticker so no further ticks arrive during shutdown.
            tickerJob.cancelAndJoin()

            // Ask actor to flush & stop, and wait.
            val done = CompletableDeferred<Unit>()
            messages.send(Msg.Shutdown(done))
            done.await()

            // We won't consume any more; close the channel and wait for actor.
            messages.close()
            actorJob.join()

            // Leave output in a stable state for subsequent normal printing.
            synchronized(printLock) { writer.flush() }
        }

        // Tear down the scope/dispatcher thread.
        scope.cancel()
        dispatcher.close()
    }
}
