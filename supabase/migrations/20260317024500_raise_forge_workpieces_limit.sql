-- Raise the Forge workpiece bucket object-size limit so canonical recording
-- uploads are not capped at the storage service default.
update storage.buckets
set file_size_limit = 524288000
where id = 'forge-workpieces';
