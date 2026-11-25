package org.didanet.mymonday.file;

import java.io.IOException;

import org.springframework.core.io.InputStreamResource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/files")
public class FileController {

    private final FileStorage storage;

    public FileController(FileStorage storage) {
        this.storage = storage;
    }

    @GetMapping("/{id}")
    public ResponseEntity<InputStreamResource> download(@PathVariable String id) throws IOException {
        var resource = storage.load(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String contentType = resource.getContentType() != null ? resource.getContentType()
            : MediaType.APPLICATION_OCTET_STREAM_VALUE;
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(contentType))
            .contentLength(resource.contentLength())
            .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.inline().filename(resource.getFilename(), java.nio.charset.StandardCharsets.UTF_8)
                    .build().toString())
            .body(new InputStreamResource(resource.getInputStream()));
    }
}
