package org.didanet.mymonday.monday;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/** Titoli reali dei gruppi del board MYA. */
class SprintTitleParserTests {

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
        "Ottobre 2026|2026-10-01|2026-10-31",
        "Novembre - Dicembre 2025|2025-11-01|2025-12-31",
        "17-21 Novembre|2025-11-17|2025-11-21",
        "06 - 14 Novembre  2025|2025-11-06|2025-11-14",
        "13 - 17 Ottobre 2025|2025-10-13|2025-10-17",
        "29 settembre - 03 ottobre 2025|2025-09-29|2025-10-03",
        "22-26 settembre 2025|2025-09-22|2025-09-26",
        "18-29 agosto 2025|2025-08-18|2025-08-29",
        "11 agosto - 14 agosto 2025|2025-08-11|2025-08-14",
        "Luglio 28 - Agosto 1|2025-07-28|2025-08-01",
        "Luglio W4 21/07 -> 25/07|2025-07-21|2025-07-25",
        "Luglio W1 30/6 -> 4/07|2025-06-30|2025-07-04",
        "Giugno W2 - 9/6 -> 13/6|2025-06-09|2025-06-13",
        "Maggio W3-5 19/05 - 06/06|2025-05-19|2025-06-06",
        "Maggio W2|2025-05-08|2025-05-14",
    })
    void parsesPeriod(String title, LocalDate start, LocalDate end) {
        var period = SprintTitleParser.parse(title, 2025).orElseThrow();
        assertEquals(start, period.start(), title);
        assertEquals(end, period.end(), title);
    }

    @ParameterizedTest
    @ValueSource(strings = { "SOSPESE", "APP New", "Segnalazioni", "Pending deploys", "BIG CHANGES TO BE SCHEDULED",
        "Attività chiusura 2025" })
    void thematicGroupsAreNotSprints(String title) {
        assertTrue(SprintTitleParser.parse(title, 2025).isEmpty(), title);
    }
}
