package org.didanet.mymonday.doc;

import java.time.Instant;
import java.util.List;

import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.core.query.Update;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

@RestController
@RequestMapping("/api")
public class DocController {

    public record DocRequest(@NotBlank String title, String folderId, String content) {
    }

    public record FolderRequest(@NotBlank String name, Integer position) {
    }

    private final DocRepository docs;
    private final DocFolderRepository folders;
    private final MongoTemplate mongo;

    public DocController(DocRepository docs, DocFolderRepository folders, MongoTemplate mongo) {
        this.docs = docs;
        this.folders = folders;
        this.mongo = mongo;
    }

    @GetMapping("/doc-folders")
    public List<DocFolder> folders() {
        return folders.findAll(Sort.by("position", "name"));
    }

    @PostMapping("/doc-folders")
    @ResponseStatus(HttpStatus.CREATED)
    public DocFolder createFolder(@Valid @RequestBody FolderRequest req) {
        int position = req.position() != null ? req.position() : (int) folders.count();
        return folders.save(new DocFolder(null, req.name().trim(), position, null));
    }

    @PutMapping("/doc-folders/{id}")
    public DocFolder updateFolder(@PathVariable String id, @Valid @RequestBody FolderRequest req) {
        DocFolder existing = folders.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return folders.save(new DocFolder(id, req.name().trim(),
            req.position() != null ? req.position() : existing.position(), existing.mondayId()));
    }

    /** Elimina la cartella; i documenti contenuti restano, fuori da cartelle. */
    @DeleteMapping("/doc-folders/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteFolder(@PathVariable String id) {
        mongo.updateMulti(Query.query(Criteria.where("folderId").is(id)), Update.update("folderId", null), Doc.class);
        folders.deleteById(id);
    }

    @GetMapping("/docs")
    public List<Doc.Summary> list() {
        return docs.findAll(Sort.by("title")).stream().map(Doc::summary).toList();
    }

    @GetMapping("/docs/{id}")
    public Doc get(@PathVariable String id) {
        return find(id);
    }

    @PostMapping("/docs")
    @ResponseStatus(HttpStatus.CREATED)
    public Doc create(@Valid @RequestBody DocRequest req, @AuthenticationPrincipal Jwt jwt) {
        validateFolder(req.folderId());
        Instant now = Instant.now();
        return docs.save(new Doc(null, req.title().trim(), blankToNull(req.folderId()),
            req.content() == null ? "" : req.content(), jwt.getSubject(), now, jwt.getSubject(), now, null));
    }

    @PutMapping("/docs/{id}")
    public Doc update(@PathVariable String id, @Valid @RequestBody DocRequest req, @AuthenticationPrincipal Jwt jwt) {
        Doc existing = find(id);
        validateFolder(req.folderId());
        return docs.save(new Doc(id, req.title().trim(), blankToNull(req.folderId()),
            req.content() == null ? "" : req.content(), existing.createdBy(), existing.createdAt(), jwt.getSubject(),
            Instant.now(), existing.mondayObjectId()));
    }

    @DeleteMapping("/docs/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable String id) {
        docs.deleteById(id);
    }

    private Doc find(String id) {
        return docs.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    private void validateFolder(String folderId) {
        if (blankToNull(folderId) != null && !folders.existsById(folderId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cartella inesistente");
        }
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s;
    }
}
