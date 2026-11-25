package org.didanet.mymonday.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/** Inoltra le rotte del frontend React a index.html, lasciando la navigazione al router client. */
@Controller
public class SpaController {

    @GetMapping({ "/", "/board", "/kanban", "/calendario", "/sprint", "/progetti", "/utenti", "/profilo", "/login",
        "/documenti", "/documenti/{id}", "/impostazioni", "/import" })
    public String index() {
        return "forward:/index.html";
    }
}
