import kotlinx.coroutines.*
import kotlinx.coroutines.channels.*
import kotlin.time.Duration.Companion.milliseconds

class LineDisplay(frameMillis: Long = 50L) {          // 20 fps default

    /* ────────────────  PUBLIC TYPES  ──────────────── */

    enum class Location { TOP, NATURAL, BOTTOM }

    inner class Line internal constructor() {

        var text: String
            get() = _text
            set(v) {
                _text = v
                messages.trySend(Msg.Update(this, v))
            }

        fun complete(finalPrint: Boolean = true) {
            messages.trySend(Msg.Complete(this, finalPrint))
        }

        // ------------------------------------------------------------
        @Volatile private var _text: String = ""
    }

    fun add(location: Location = Location.NATURAL): Line {
        val l = Line()
        messages.trySend(Msg.Add(l, location))
        return l
    }

    /* ────────────────  INTERNAL  ──────────────── */

    /* Actor messages ----------------------------------------------------- */
    private sealed interface Msg {
        data class Add(val line: Line, val loc: Location)            : Msg
        data class Update(val line: Line, val text: String)          : Msg
        data class Complete(val line: Line, val final: Boolean)      : Msg
        data object Tick                                             : Msg
    }

    /* In-memory line model ---------------------------------------------- */
    private data class Entry(
        val line : Line,
        var text : String,
        val loc  : Location,
        var done : Boolean = false,
        var finalPrint: Boolean = true
    )

    /* Channels & coroutines --------------------------------------------- */
    private val messages = Channel<Msg>(Channel.UNLIMITED)

    private val scope = CoroutineScope(
        SupervisorJob() + newSingleThreadContext("LineDisplay")
    )

    init {
        /* Periodic tick channel drives throttled renders */
        val ticker = ticker(frameMillis.milliseconds, frameMillis.milliseconds, scope)

        scope.launch {
            /* Relay ticker events into the actor mailbox */
            for (unit in ticker) messages.send(Msg.Tick)
        }

        scope.launch { actorLoop() }
    }

    /* ────────────────  ACTOR LOOP  ──────────────── */

    private suspend fun actorLoop() {
        val active      = mutableListOf<Entry>()
        var dirty       = false
        var prevActive  = 0

        for (msg in messages) {
            when (msg) {
                Msg.Tick -> {
                    if (dirty) {
                        prevActive = render(active, prevActive)
                        dirty = false
                    }
                }

                is Msg.Add -> {
                    active += Entry(msg.line, "", msg.loc)
                    dirty = true
                }

                is Msg.Update -> {
                    active.find { it.line === msg.line }?.text = msg.text
                    dirty = true
                }

                is Msg.Complete -> {
                    active.find { it.line === msg.line }?.apply {
                        done        = true
                        finalPrint  = msg.final
                    }
                    dirty = true
                }
            }
        }
    }

    /* ────────────────  RENDER  ──────────────── */

    private fun render(list: MutableList<Entry>, prevLines: Int): Int {

        /* Split lists only once */
        val completed    = list.filter { it.done }
        val toScroll     = completed.filter { it.finalPrint }
        val remaining    = list.filterNot { it.done }

        /* Preserve insertion order inside each bucket */
        val top      = remaining.filter { it.loc == Location.TOP     }
        val natural  = remaining.filter { it.loc == Location.NATURAL }
        val bottom   = remaining.filter { it.loc == Location.BOTTOM  }

        val buf = StringBuilder()

        /* 1 – move to top of active area and erase it */
        if (prevLines > 0) buf.append("\u001B[").append(prevLines).append('A')
        buf.append('\r').append("\u001B[0J")

        /* 2 – newly completed lines (optional) */
        for (e in toScroll) buf.append(e.text).append('\n')

        /* 3 – still-active lines                    */
        fun emit(batch: List<Entry>) =
            batch.forEach { buf.append("\r\u001B[2K").append(it.text).append('\n') }

        emit(top); emit(natural); emit(bottom)

        /* 4 – push to terminal in one shot */
        synchronized(System.out) {
            System.out.print(buf.toString())
            System.out.flush()
        }

        /* 5 – purge finished entries */
        list.removeAll(completed)

        return top.size + natural.size + bottom.size
    }
}
