package org.didanet.mymonday.monday;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

/** Blocchi ricavati dai documenti "Strutture convenzionate (e non)" e "mappa portale app". */
class MondayDocConverterTests {

    private final ObjectMapper mapper = JsonMapper.builder().build();

    private JsonNode block(String id, String type, String content, String parent, double position) {
        var node = mapper.createObjectNode();
        node.put("id", id);
        node.put("type", type);
        node.put("content", content);
        node.put("parent_block_id", parent);
        node.put("position", position);
        return node;
    }

    @Test
    void convertsTextListsAndBold() {
        List<JsonNode> blocks = List.of(
            block("a", "normal text", "{\"deltaFormat\":[{\"insert\":\"Lista strutture\"}]}", null, 1),
            block("b", "bulleted list",
                "{\"deltaFormat\":[{\"insert\":\"il flusso richiama \\\"vista_strutture\\\" che \"},"
                    + "{\"insert\":\"recupera SOLO LE CONVENZIONATE\",\"attributes\":{\"bold\":true}}],\"indentation\":0}",
                null, 2),
            block("c", "bulleted list",
                "{\"deltaFormat\":[{\"insert\":\"ergo,\"},{\"insert\":\" export parziale\",\"attributes\":{\"bold\":true}}],"
                    + "\"indentation\":1}",
                null, 3),
            block("d", "medium title", "{\"deltaFormat\":[{\"insert\":\"Comandi\"}]}", null, 4));

        String md = new MondayDocConverter(mapper, c -> null).convert(blocks);

        assertEquals("""
            Lista strutture

            - il flusso richiama "vista_strutture" che **recupera SOLO LE CONVENZIONATE**
              - ergo, **export parziale**

            ## Comandi
            """, md);
    }

    @Test
    void convertsTables() {
        List<JsonNode> blocks = new ArrayList<>();
        blocks.add(block("t", "table", "{\"cells\":[[{\"blockId\":\"c1\"},{\"blockId\":\"c2\"}],"
            + "[{\"blockId\":\"c3\"},{\"blockId\":\"c4\"}]]}", null, 1));
        String[][] cells = { { "c1", "**Ambiente**", "{\"insert\":\"Ambiente\",\"attributes\":{\"bold\":true}}" },
            { "c2", "**Prefisso dir**", "{\"insert\":\"Prefisso dir\",\"attributes\":{\"bold\":true}}" },
            { "c3", "MYA PROD", "{\"insert\":\"MYA PROD\"}" },
            { "c4", "/mnt/file01/sources/", "{\"insert\":\"/mnt/file01/sources/\"}" } };
        for (String[] c : cells) {
            blocks.add(block(c[0], "cell", "{}", "t", 0));
            blocks.add(block(c[0] + "-text", "normal text", "{\"deltaFormat\":[" + c[2] + "]}", c[0], 0));
        }

        String md = new MondayDocConverter(mapper, c -> null).convert(blocks);

        assertEquals("""
            | **Ambiente** | **Prefisso dir** |
            | --- | --- |
            | MYA PROD | /mnt/file01/sources/ |
            """, md);
    }
}
