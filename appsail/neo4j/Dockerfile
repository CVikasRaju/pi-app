# Dockerfile — Neo4j Community Edition for Catalyst AppSail
FROM neo4j:5-community

ENV NEO4J_AUTH=neo4j/change-me-secret-123
ENV NEO4J_dbms_default__listen__address=0.0.0.0
ENV NEO4J_dbms_connector_bolt_listen__address=0.0.0.0:7687
ENV NEO4J_dbms_connector_http_listen__address=0.0.0.0:7474

EXPOSE 7687 7474
