package org.didanet.mymonday.monday;

import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Stato di un import in esecuzione in background, interrogato dal frontend a intervalli. */
public class ImportJob {

    public enum Status {
        RUNNING, DONE, FAILED
    }

    public record Snapshot(String id, Status status, List<String> log, Map<String, Integer> counters,
        Instant startedAt, Instant finishedAt) {
    }

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm:ss");

    private final String id = UUID.randomUUID().toString();
    private final Instant startedAt = Instant.now();
    private final List<String> log = Collections.synchronizedList(new ArrayList<>());
    private final Map<String, Integer> counters = Collections.synchronizedMap(new LinkedHashMap<>());
    private volatile Status status = Status.RUNNING;
    private volatile Instant finishedAt;

    public String id() {
        return id;
    }

    public Status status() {
        return status;
    }

    public void log(String message) {
        log.add(LocalTime.now(ZoneId.systemDefault()).format(TIME) + "  " + message);
    }

    public void count(String key) {
        counters.merge(key, 1, Integer::sum);
    }

    public void finish(Status finalStatus) {
        status = finalStatus;
        finishedAt = Instant.now();
    }

    public Snapshot snapshot() {
        synchronized (log) {
            synchronized (counters) {
                return new Snapshot(id, status, List.copyOf(log), new LinkedHashMap<>(counters), startedAt, finishedAt);
            }
        }
    }
}
