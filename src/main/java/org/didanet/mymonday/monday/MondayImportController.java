package org.didanet.mymonday.monday;

import java.util.List;

import org.didanet.mymonday.config.AppProperties;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.ProblemDetail;

@RestController
@RequestMapping("/api/import/monday")
@PreAuthorize("hasRole('ADMIN')")
public class MondayImportController {

    /** Se {@code token} è vuoto si usa quello configurato sul server (MONDAY_API_TOKEN). */
    public record CatalogRequest(String token) {
    }

    public record ImportRequest(String token, List<String> boardIds, List<String> docIds) {
    }

    private final MondayImportService importService;
    private final AppProperties props;

    public MondayImportController(MondayImportService importService, AppProperties props) {
        this.importService = importService;
        this.props = props;
    }

    @PostMapping("/catalog")
    public MondayImportService.Catalog catalog(@RequestBody CatalogRequest req) {
        return importService.catalog(token(req.token()));
    }

    @PostMapping("/jobs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public ImportJob.Snapshot start(@RequestBody ImportRequest req, @AuthenticationPrincipal Jwt jwt) {
        List<String> boards = req.boardIds() == null ? List.of() : req.boardIds();
        List<String> docs = req.docIds() == null ? List.of() : req.docIds();
        if (boards.isEmpty() && docs.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Seleziona almeno un board o un documento");
        }
        return importService.start(token(req.token()), boards, docs, jwt.getSubject()).snapshot();
    }

    @GetMapping("/jobs/{id}")
    public ImportJob.Snapshot job(@PathVariable String id) {
        return importService.job(id).map(ImportJob::snapshot)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
    }

    @ExceptionHandler(MondayClient.MondayApiException.class)
    ProblemDetail handleMondayError(MondayClient.MondayApiException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_GATEWAY, e.getMessage());
    }

    private String token(String requested) {
        if (requested != null && !requested.isBlank()) {
            return requested.trim();
        }
        String configured = props.monday() == null ? null : props.monday().token();
        if (configured == null || configured.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inserisci il token API di monday.com");
        }
        return configured;
    }
}
