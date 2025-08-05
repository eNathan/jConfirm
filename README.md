import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import java.util.concurrent.atomic.AtomicReference

/**
 * One instance per program.  Keeps an “active area” at the bottom of the
 * terminal that is constantly re-drawn; finished lines are printed once and
 * then left in the scroll-back buffer.
 *
 * Thread-safe:  add(), text updates, and complete() may be called from any
 * thread – the rendering work happens in a single-threaded actor.
 */
class LineDisplay {

    /* ────────────────────────────  PUBLIC API  ──────────────────────────── */

    inner class Line internal constructor() {

        /** Current text that will be rendered for this line. */
        var text: String
            get() = state.get()
            set(value) {
                state.set(value)
                channel.trySend(Msg.Update(this, value))
            }

        /**
         * Mark this line as finished.  It will be printed one last time
         * (immediately) and then removed from the active area.
         */
        fun complete() {
            channel.trySend(Msg.Complete(this))
        }

        // ------------------------------------------------------------------
        private val state = AtomicReference("")
    }

    /** Obtain a new (initially empty) dynamic line. */
    fun add(): Line {
        val line = Line()
        channel.trySend(Msg.Add(line))
        return line
    }

    /* ──────────────────────────  IMPLEMENTATION  ────────────────────────── */

    private sealed interface Msg {
        data class Add(val line: Line) : Msg
        data class Update(val line: Line, val newText: String) : Msg
        data class Complete(val line: Line) : Msg
    }

    // Each InternalLine mirrors a public Line plus some metadata.
    private data class InternalLine(
        val line: Line,
        var text: String,
        var completed: Boolean = false
    )

    // One single-threaded actor; guarantees ordering & thread-safety.
    private val channel = Channel<Msg>(Channel.UNLIMITED)
    private val scope = CoroutineScope(
        SupervisorJob() + newSingleThreadContext("LineDisplayRender")
    )

    init {
        scope.launch { renderLoop() }
    }

    /** Main loop – processes messages and re-renders the active area. */
    private suspend fun renderLoop() {
        val active = mutableListOf<InternalLine>()
        var prevActiveCount = 0            // #lines printed in last render()

        for (msg in channel) {
            when (msg) {
                is Msg.Add      -> active += InternalLine(msg.line, "")
                is Msg.Update   -> active.find { it.line === msg.line }?.text = msg.newText
                is Msg.Complete -> active.find { it.line === msg.line }?.completed = true
            }
            prevActiveCount = render(active, prevActiveCount)
        }
    }

    /**
     * Redraws the active area.
     *
     * @param allLines  current active list (includes lines just marked completed)
     * @param before    how many ongoing lines existed during the previous draw
     * @return          how many ongoing lines exist *after* this draw
     */
    private fun render(
        allLines: MutableList<InternalLine>,
        before: Int
    ): Int {
        // Partition once so we know which lines just finished.
        val (doneNow, ongoing) = allLines.partition { it.completed }

        // Build a single ANSI blob – one write() is faster & flicker-free.
        val buf = StringBuilder()

        /* 1) Jump to the top of the old active area…                        */
        if (before > 0) buf.append("\u001B[").append(before).append('A')
        buf.append('\r')                // column 0

        /* 2) Wipe everything from here down – this erases the old active
              lines *only*.  Completed lines printed in earlier frames sit
              above this point and are untouched.                           */
        buf.append("\u001B[0J")

        /* 3) Print any *newly* completed lines (in their original order).   */
        doneNow.forEach { l ->
            buf.append(l.text).append('\n')
        }

        /* 4) Print the still-ongoing lines, oldest → newest.                */
        ongoing.forEach { l ->
            buf.append("\r\u001B[2K")    // clear the fresh line first
            buf.append(l.text).append('\n')
        }

        /* 5) Flush to the terminal in one go.                               */
        synchronized(System.out) {
            System.out.print(buf.toString())
            System.out.flush()
        }

        /* 6) Drop completed lines so we never see them again.               */
        allLines.removeAll(doneNow)

        return ongoing.size              // how many lines to move up next time
    }
}

---

val display = LineDisplay()

repeat(10) { i ->
    val line = display.add()
    GlobalScope.launch {
        for (p in 0..100 step 5) {
            line.text = "Copy #$i : $p%"
            delay(40)
        }
        line.text = "Copy #$i : done"
        line.complete()
    }
}
