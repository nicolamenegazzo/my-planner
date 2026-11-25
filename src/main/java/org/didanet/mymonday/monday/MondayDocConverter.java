package org.didanet.mymonday.monday;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Converte i blocchi di un documento monday.com (contenuto in formato Quill "deltaFormat") in Markdown.
 * Le immagini vengono passate a {@code imageResolver}, che restituisce l'URL da usare nel Markdown (o null).
 */
public class MondayDocConverter {

    public record Block(String id, String type, JsonNode content, String parentId, double position) {
    }

    private final ObjectMapper mapper;
    private final Function<JsonNode, String> imageResolver;
    private final Map<String, Block> byId = new HashMap<>();
    private final Map<String, List<Block>> children = new HashMap<>();

    public MondayDocConverter(ObjectMapper mapper, Function<JsonNode, String> imageResolver) {
        this.mapper = mapper;
        this.imageResolver = imageResolver;
    }

    /** Converte i blocchi grezzi restituiti dall'API ({@code id, type, content, parent_block_id, position}). */
    public String convert(List<JsonNode> rawBlocks) {
        List<Block> roots = new ArrayList<>();
        for (JsonNode raw : rawBlocks) {
            String contentJson = MondayClient.text(raw.path("content"), "{}");
            Block block = new Block(MondayClient.text(raw.path("id")), MondayClient.text(raw.path("type"), ""),
                mapper.readTree(contentJson), MondayClient.text(raw.path("parent_block_id")),
                raw.path("position").asDouble(0));
            byId.put(block.id(), block);
            if (block.parentId() == null) {
                roots.add(block);
            } else {
                children.computeIfAbsent(block.parentId(), k -> new ArrayList<>()).add(block);
            }
        }
        children.values().forEach(list -> list.sort(Comparator.comparingDouble(Block::position)));
        roots.sort(Comparator.comparingDouble(Block::position));

        StringBuilder md = new StringBuilder();
        String previousType = null;
        for (Block block : roots) {
            String rendered = render(block);
            if (rendered == null) {
                continue;
            }
            // gli elementi consecutivi di un elenco restano attaccati, gli altri blocchi sono separati da una riga vuota
            boolean sameList = isList(block.type()) && block.type().equals(previousType);
            if (!md.isEmpty()) {
                md.append(sameList ? "\n" : "\n\n");
            }
            md.append(rendered);
            previousType = block.type();
        }
        return md.toString().replaceAll("\n{3,}", "\n\n").strip() + "\n";
    }

    private String render(Block block) {
        String text = inline(block.content().path("deltaFormat"));
        int indent = block.content().path("indentation").asInt(0);
        String pad = "  ".repeat(Math.max(0, indent));
        return switch (block.type()) {
            case "large title" -> "# " + text;
            case "medium title" -> "## " + text;
            case "small title" -> "### " + text;
            case "bulleted list" -> pad + "- " + text;
            case "numbered list" -> pad + "1. " + text;
            case "check list" -> pad + "- [" + (block.content().path("checked").asBoolean(false) ? "x" : " ") + "] " + text;
            case "quote" -> "> " + text.replace("\n", "\n> ");
            case "code" -> "```\n" + plain(block.content().path("deltaFormat")) + "\n```";
            case "divider" -> "---";
            case "table" -> table(block);
            case "image" -> image(block);
            case "notice box", "layout", "cell" -> childrenAsMarkdown(block);
            default -> text.isBlank() && children.containsKey(block.id()) ? childrenAsMarkdown(block) : text;
        };
    }

    private String childrenAsMarkdown(Block block) {
        List<String> parts = new ArrayList<>();
        for (Block child : children.getOrDefault(block.id(), List.of())) {
            String rendered = render(child);
            if (rendered != null && !rendered.isBlank()) {
                parts.add(rendered);
            }
        }
        String joined = String.join("\n\n", parts);
        return "notice box".equals(block.type()) ? "> " + joined.replace("\n", "\n> ") : joined;
    }

    private String table(Block block) {
        JsonNode rows = block.content().path("cells");
        if (!rows.isArray() || rows.isEmpty()) {
            return null;
        }
        StringBuilder md = new StringBuilder();
        int columns = rows.get(0).size();
        for (int r = 0; r < rows.size(); r++) {
            md.append('|');
            for (JsonNode cell : rows.get(r)) {
                Block cellBlock = byId.get(MondayClient.text(cell.path("blockId")));
                String value = cellBlock == null ? "" : childrenAsMarkdown(cellBlock);
                md.append(' ').append(value.replace("\n\n", "<br>").replace("\n", "<br>").replace("|", "\\|")).append(" |");
            }
            md.append('\n');
            if (r == 0) {
                md.append('|').append(" --- |".repeat(columns)).append('\n');
            }
        }
        return md.toString().stripTrailing();
    }

    private String image(Block block) {
        String url = imageResolver.apply(block.content());
        if (url == null) {
            return "_(immagine non importata)_";
        }
        String alt = MondayClient.text(block.content().path("name"), "immagine");
        return "![" + alt + "](" + url + ")";
    }

    /** Testo con formattazione inline Markdown (grassetto, corsivo, barrato, codice, link). */
    private static String inline(JsonNode delta) {
        StringBuilder sb = new StringBuilder();
        if (!delta.isArray()) {
            return "";
        }
        for (JsonNode op : delta) {
            JsonNode insert = op.path("insert");
            if (!insert.isString()) {
                continue; // menzioni, embed e simili
            }
            String value = insert.stringValue();
            JsonNode attrs = op.path("attributes");
            if (value.isBlank() || attrs.isMissingNode()) {
                sb.append(value);
                continue;
            }
            // la formattazione va applicata al testo senza spazi esterni, altrimenti il Markdown non la riconosce
            String lead = value.substring(0, value.length() - value.stripLeading().length());
            String trail = value.substring(value.stripTrailing().length());
            String core = value.strip();
            if (attrs.path("code").asBoolean(false)) {
                core = "`" + core + "`";
            }
            if (attrs.path("bold").asBoolean(false)) {
                core = "**" + core + "**";
            }
            if (attrs.path("italic").asBoolean(false)) {
                core = "_" + core + "_";
            }
            if (attrs.path("strike").asBoolean(false)) {
                core = "~~" + core + "~~";
            }
            String link = MondayClient.text(attrs.path("link"));
            if (link != null) {
                core = "[" + core + "](" + link + ")";
            }
            sb.append(lead).append(core).append(trail);
        }
        return sb.toString().replace("\n", "  \n").strip();
    }

    private static String plain(JsonNode delta) {
        StringBuilder sb = new StringBuilder();
        if (delta.isArray()) {
            for (JsonNode op : delta) {
                if (op.path("insert").isString()) {
                    sb.append(op.path("insert").stringValue());
                }
            }
        }
        return sb.toString().stripTrailing();
    }

    private static boolean isList(String type) {
        return type.endsWith("list");
    }
}
