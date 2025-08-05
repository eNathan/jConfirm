import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import java.util.concurrent.atomic.AtomicReference
import kotlin.system.*

/**
 * One instance per program.  Keeps an “active area” at the bottom of the
 * terminal that is redrawn at most every [frameMillis] ms; finished lines can
 * optionally be omitted from the scroll-back.
 *
 * Thread-safe: all state mutates inside a single-threaded actor.
 *
 * @param frameMillis minimum time (ms) between consecutive renders
 */
class LineDisplay(private val frameMillis: Long = 50L) {     // 20 fps default

    /** Where this line lives inside the active area. */
    enum class Location { TOP, NATURAL, BOTTOM }

    /* ─────────────────────────────  PUBLIC API  ────────────────────────── */

    inner class Line internal constructor() {

        /** Current text for this line (set from any thread). */
        var text: String
            get() = state.get()
            set(v) {
                state.set(v)
                channel.trySend(Msg.Update(this, v))
            }

        /**
         * Mark line finished.
         *
         * @param finalPrint if true (default) the line is printed once more and
         *                   left in scroll-back; if false it is just dropped.
         */
        fun complete(finalPrint: Boolean = true) {
            channel.trySend(Msg.Complete(this, finalPrint))
        }

        // ------------------------------------------------------------------
        private val state = AtomicReference("")
    }

    /** Create a new (initially empty) line. */
    fun add(location: Location = Location.NATURAL): Line {
        val l = Line()
        channel.trySend(Msg.Add(l, location))
        return l
    }

    /* ───────────────────────── INTERNAL STUFF  ─────────────────────────── */

    private sealed interface Msg {
        data class Add(val line: Line, val loc: Location)        : Msg
        data class Update(val line: Line, val newText: String)   : Msg
        data class Complete(val line: Line, val finalPrint: Boolean) : Msg
    }

    private data class Internal(
        val line: Line,
        var text: String,
        val loc: Location,
        var completed: Boolean = false,
        var finalPrint: Boolean = true
    )

    private val channel = Channel<Msg>(Channel.UNLIMITED)
    private val scope   = CoroutineScope(
        SupervisorJob() + newSingleThreadContext("LineDisplayRender")
    )

    init { scope.launch { renderLoop() } }

    private suspend fun renderLoop() {
        val active          = mutableListOf<Internal>()
        var lastRenderAt    = 0L
        var prevActiveCount = 0

        for (msg in channel) {
            when (msg) {
                is Msg.Add      -> active += Internal(msg.line, "", msg.loc)
                is Msg.Update   -> active.find { it.line === msg.line }?.text = msg.newText
                is Msg.Complete -> active.find { it.line === msg.line }?.apply {
                                     completed  = true
                                     finalPrint = msg.finalPrint
                                   }
            }

            val now = TimeSource.Monotonic.markNow()
            if (now.elapsedNow().inWholeMilliseconds >= frameMillis) {
                prevActiveCount = render(active, prevActiveCount)
                lastRenderAt    = System.nanoTime()
            }
        }
    }

    /** Performs one paint of the active area (see big comment in first impl). */
    private fun render(list: MutableList<Internal>, before: Int): Int {

        val completed  = list.filter { it.completed }
        val toScroll   = completed.filter { it.finalPrint }
        val ongoing    = list.filterNot { it.completed }

        // Build draw order TOP → NATURAL → BOTTOM
        val top     = ongoing.filter { it.loc == Location.TOP     }
        val natural = ongoing.filter { it.loc == Location.NATURAL }
        val bottom  = ongoing.filter { it.loc == Location.BOTTOM  }

        val buf = StringBuilder()

        /* Move to top of previous active area and clear it */
        if (before > 0) buf.append("\u001B[").append(before).append('A')
        buf.append('\r').append("\u001B[0J")

        /* Newly finished lines (scroll-back) */
        toScroll.forEach { buf.append(it.text).append('\n') }

        /* Still-running lines */
        fun put(group: List<Internal>) =
            group.forEach { buf.append("\r\u001B[2K").append(it.text).append('\n') }

        put(top); put(natural); put(bottom)

        synchronized(System.out) {
            System.out.print(buf.toString())
            System.out.flush()
        }

        /* Drop everything that’s done (printed or not) */
        list.removeAll(completed)

        return top.size + natural.size + bottom.size
    }
}
