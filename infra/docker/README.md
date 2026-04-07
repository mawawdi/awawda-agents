# docker

Docker image definitions for deployable services.

- `api.Dockerfile` — builds and runs the NestJS API, runs `prisma migrate deploy` at container start.
- `customer-portal.Dockerfile` — builds the Vite customer portal and serves it with nginx.
- `customer-portal.nginx.conf` — SPA/static serving + `/v1/*` reverse proxy to the API service.
- `customer-portal-entrypoint.sh` — injects runtime `CUSTOMER_PORTAL_API_BASE_URL` into `runtime-config.js`.

## Build images manually

```bash
docker build -f infra/docker/api.Dockerfile .
docker build -f infra/docker/customer-portal.Dockerfile .
```
