# Amazon RDS trust bundle

Downloaded from [AWS RDS global trust store](https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem) on 2026-10-02. This file contains public CA certificates, not credentials.

SHA-256: `fe45bbebf92ad3e27a583bbb2ddd1553c521ed4d49af5514dc0a40372ea5395c`.

Review the AWS CA rotation notice and update this bundle in a tested image before the active CA expires. Production database URLs must specify `sslmode=verify-full&sslrootcert=/app/certs/rds-global-bundle.pem`.
