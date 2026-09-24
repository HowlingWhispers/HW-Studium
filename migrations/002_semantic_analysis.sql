ALTER TABLE studium_documents DROP CONSTRAINT studium_documents_kind_check;
ALTER TABLE studium_documents ADD CONSTRAINT studium_documents_kind_check
  CHECK (kind IN ('bundle','config','proposal','report','analysis'));
