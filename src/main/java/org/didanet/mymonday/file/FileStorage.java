package org.didanet.mymonday.file;

import java.io.InputStream;
import java.util.Optional;

import org.bson.types.ObjectId;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.data.mongodb.gridfs.GridFsResource;
import org.springframework.data.mongodb.gridfs.GridFsTemplate;
import org.springframework.stereotype.Service;

import com.mongodb.client.gridfs.model.GridFSFile;

/** File binari (allegati dei task, immagini dei documenti) salvati in MongoDB GridFS. */
@Service
public class FileStorage {

    public record StoredFile(String id, long size) {
    }

    private final GridFsTemplate gridFs;

    public FileStorage(GridFsTemplate gridFs) {
        this.gridFs = gridFs;
    }

    public StoredFile store(InputStream content, String filename, String contentType) {
        ObjectId id = gridFs.store(content, filename, contentType);
        GridFSFile file = gridFs.findOne(byId(id.toHexString()));
        return new StoredFile(id.toHexString(), file == null ? 0 : file.getLength());
    }

    public Optional<GridFsResource> load(String id) {
        if (!ObjectId.isValid(id)) {
            return Optional.empty();
        }
        GridFSFile file = gridFs.findOne(byId(id));
        return file == null ? Optional.empty() : Optional.of(gridFs.getResource(file));
    }

    public void delete(String id) {
        if (ObjectId.isValid(id)) {
            gridFs.delete(byId(id));
        }
    }

    private static Query byId(String id) {
        return Query.query(Criteria.where("_id").is(new ObjectId(id)));
    }
}
