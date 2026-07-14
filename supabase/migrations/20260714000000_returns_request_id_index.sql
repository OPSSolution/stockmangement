-- The Return Details modal (and the partial-return progress checks on the
-- Requests/Returns pages) look up every return tied to a request via
-- request_id on every open — index it so that lookup stays fast as the
-- returns table grows.
CREATE INDEX IF NOT EXISTS returns_request_id_idx ON returns (request_id);
