package org.didanet.mymonday.monday;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Ricava il periodo di uno sprint dal titolo di un gruppo monday.com, per esempio
 * "13 - 17 Ottobre 2025", "Luglio W4 21/07 -> 25/07", "Luglio 28 - Agosto 1", "Ottobre 2026", "Maggio W2".
 * Restituisce vuoto se il titolo non contiene un mese (gruppi tematici come "SOSPESE").
 */
public final class SprintTitleParser {

    public record Period(LocalDate start, LocalDate end) {
    }

    private static final Map<String, Integer> MONTHS = Map.ofEntries(
        Map.entry("gennaio", 1), Map.entry("febbraio", 2), Map.entry("marzo", 3), Map.entry("aprile", 4),
        Map.entry("maggio", 5), Map.entry("giugno", 6), Map.entry("luglio", 7), Map.entry("agosto", 8),
        Map.entry("settembre", 9), Map.entry("ottobre", 10), Map.entry("novembre", 11), Map.entry("dicembre", 12),
        Map.entry("gen", 1), Map.entry("feb", 2), Map.entry("mar", 3), Map.entry("apr", 4), Map.entry("mag", 5),
        Map.entry("giu", 6), Map.entry("lug", 7), Map.entry("ago", 8), Map.entry("set", 9), Map.entry("ott", 10),
        Map.entry("nov", 11), Map.entry("dic", 12));

    private static final Pattern DAY_SLASH_MONTH = Pattern.compile("(?<!\\d)(\\d{1,2})/(\\d{1,2})(?!\\d)");
    private static final Pattern YEAR = Pattern.compile("(?<!\\d)(20\\d{2})(?!\\d)");
    private static final Pattern WEEK = Pattern.compile("\\bw(\\d)(?:\\s*-\\s*(\\d))?\\b");
    private static final Pattern TOKEN = Pattern.compile("(?<!\\d)(\\d{1,2})(?!\\d)|([a-zàèéìòù]+)");

    private SprintTitleParser() {
    }

    public static Optional<Period> parse(String title, int fallbackYear) {
        String text = title.toLowerCase(Locale.ITALIAN);
        Matcher yearMatcher = YEAR.matcher(text);
        int year = yearMatcher.find() ? Integer.parseInt(yearMatcher.group(1)) : fallbackYear;
        String withoutYear = YEAR.matcher(text).replaceAll(" ");

        // 1. date esplicite giorno/mese: "21/07 -> 25/07", "9/6 -> 13/6"
        List<LocalDate> slashDates = new ArrayList<>();
        Matcher slash = DAY_SLASH_MONTH.matcher(withoutYear);
        while (slash.find()) {
            date(year, Integer.parseInt(slash.group(2)), Integer.parseInt(slash.group(1))).ifPresent(slashDates::add);
        }
        if (slashDates.size() >= 2) {
            return Optional.of(period(slashDates.getFirst(), slashDates.getLast()));
        }

        // 2. giorni e nomi di mese, in ordine "13 - 17 ottobre" oppure "luglio 28 - agosto 1"
        Matcher week = WEEK.matcher(withoutYear);
        Integer weekFrom = null;
        Integer weekTo = null;
        if (week.find()) {
            weekFrom = Integer.parseInt(week.group(1));
            weekTo = week.group(2) != null ? Integer.parseInt(week.group(2)) : weekFrom;
        }
        String cleaned = WEEK.matcher(withoutYear).replaceAll(" ");
        List<int[]> tokens = new ArrayList<>(); // {tipo (0=giorno,1=mese), valore}
        Matcher tokenMatcher = TOKEN.matcher(cleaned);
        while (tokenMatcher.find()) {
            if (tokenMatcher.group(1) != null) {
                tokens.add(new int[] { 0, Integer.parseInt(tokenMatcher.group(1)) });
            } else if (MONTHS.containsKey(tokenMatcher.group(2))) {
                tokens.add(new int[] { 1, MONTHS.get(tokenMatcher.group(2)) });
            }
        }
        List<Integer> months = tokens.stream().filter(t -> t[0] == 1).map(t -> t[1]).toList();
        if (months.isEmpty()) {
            return Optional.empty();
        }

        boolean monthFirst = tokens.getFirst()[0] == 1;
        List<LocalDate> dates = new ArrayList<>();
        List<Integer> pendingDays = new ArrayList<>();
        Integer lastMonth = null;
        for (int[] t : tokens) {
            if (t[0] == 1) {
                lastMonth = t[1];
                for (int day : pendingDays) {
                    date(year, t[1], day).ifPresent(dates::add);
                }
                pendingDays.clear();
            } else if (monthFirst && lastMonth != null) {
                date(year, lastMonth, t[1]).ifPresent(dates::add);
            } else {
                pendingDays.add(t[1]);
            }
        }
        if (!dates.isEmpty()) {
            return Optional.of(period(dates.getFirst(), dates.getLast()));
        }

        // 3. solo mesi: "Ottobre 2026", "Novembre - Dicembre 2025", "Maggio W2"
        YearMonth first = YearMonth.of(year, months.getFirst());
        YearMonth last = YearMonth.of(year, months.getLast());
        if (weekFrom != null && months.size() == 1) {
            LocalDate start = first.atDay(Math.min(1 + 7 * (weekFrom - 1), first.lengthOfMonth()));
            LocalDate end = start.plusDays(7L * (weekTo - weekFrom) + 6);
            return Optional.of(period(start, end.isAfter(first.atEndOfMonth()) ? first.atEndOfMonth() : end));
        }
        return Optional.of(period(first.atDay(1), last.atEndOfMonth()));
    }

    /** Se la fine precede l'inizio il periodo scavalca l'anno (es. "29/12 -> 3/01"). */
    private static Period period(LocalDate start, LocalDate end) {
        return new Period(start, end.isBefore(start) ? end.plusYears(1) : end);
    }

    private static Optional<LocalDate> date(int year, int month, int day) {
        if (month < 1 || month > 12 || day < 1 || day > YearMonth.of(year, month).lengthOfMonth()) {
            return Optional.empty();
        }
        return Optional.of(LocalDate.of(year, month, day));
    }
}
