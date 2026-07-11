# Self-host the Skopeo Platform

Skopeo publishes the Platform API and Web Application as a versioned pair:

- `ghcr.io/endalk200/skopeo-api`
- `ghcr.io/endalk200/skopeo-web`

Use the same exact Platform Release version for both images. The CLI has an
independent npm release lifecycle and does not need to match this version.

## Choose a channel and pin

`latest` is the latest stable Platform Release. `edge` follows every successful
push to `main`, including repository-only changes, and is intended for testing.
Every successful `main` build also has an immutable `sha-<commit>` reference.
Stable exact SemVer tags are write-once; no floating major or minor tags exist.

For repeatable deployments, use the separate API and Web Application digests
listed in the GitHub Release. A digest is a stronger pin than either a SemVer
or SHA tag; the bundle includes a Compose override for this purpose.

The first publication creates private GHCR packages. A repository maintainer
must open each package's settings once, change visibility to public, and connect
the package to this repository. After that, anonymous pulls work without a
registry credential.

## Run the single-host bundle

Download `skopeo-platform-vX.Y.Z.tar.gz` and its checksum from the matching
GitHub Release, then verify and extract it:

```sh
sha256sum --check skopeo-platform-vX.Y.Z.tar.gz.sha256
tar -xzf skopeo-platform-vX.Y.Z.tar.gz
cd skopeo-platform-vX.Y.Z
cp env.example .env
```

Edit `.env`. Every uncommented variable is required. Use a unique URL-safe
PostgreSQL password and place the same value in `POSTGRES_PASSWORD` and the
password component of `DATABASE_URL`. Then start the deployment:

```sh
docker compose config --quiet
docker compose up -d
```

To pin both applications by immutable digest, uncomment
`SKOPEO_API_DIGEST` and `SKOPEO_WEB_DIGEST` in `.env`, copy each application's
distinct `sha256:...` value from the matching GitHub Release, and include the
digest override in every Compose command:

```sh
docker compose -f compose.yaml -f compose.digest.yaml config --images
docker compose -f compose.yaml -f compose.digest.yaml pull
docker compose -f compose.yaml -f compose.digest.yaml up -d
```

The override also pins the one-shot migration service to the API digest. Keep
`SKOPEO_VERSION` set to the matching Platform Release so the bundle retains its
shared release identity even though the override replaces the image tags.

PostgreSQL must become healthy before the one-shot migration starts. The API
cannot start unless migration completes successfully, and Caddy waits until the
API and Web Application are healthy. Running `docker compose run --rm migrate`
again is safe: completed Drizzle migrations are not reapplied.

Caddy exposes one public origin. Requests under `/api/*` go to the API and all
other traffic goes to the Web Application. Swagger is at `/api/docs`; the
OpenAPI document is at `/api/openapi.json`. `/healthz` and `/readyz` stay on the
private API service network and are not public gateway routes.

The images contain no deployment-specific origin or secret. Browser calls use
relative `/api` paths, so an existing ingress may replace Caddy if it preserves
that routing contract. Advanced deployments may also run the images against an
external PostgreSQL service.

## Telemetry and health

Leave `OTLP_BASE_URL` absent to keep console logging without requiring an
OpenTelemetry Collector. Set it to an OTLP/HTTP base URL to additionally export
logs, metrics, and traces to `/v1/logs`, `/v1/metrics`, and `/v1/traces`.

`/healthz` reports process liveness. `/readyz` checks PostgreSQL and returns an
unavailable response while the database cannot be reached.

## Upgrade and back up

Before an upgrade, back up the PostgreSQL volume using your normal PostgreSQL
backup tooling. Change `SKOPEO_VERSION` to the next exact stable version, pull
the pair, run migration, and then recreate the services:

```sh
docker compose pull
docker compose run --rm migrate
docker compose up -d
```

For a digest-pinned deployment, update both digest values and include
`-f compose.yaml -f compose.digest.yaml` in each upgrade command as well.

The included topology is a convenient single-host deployment, not a
high-availability architecture. The operator remains responsible for backups,
restore testing, host security, TLS/DNS correctness, capacity, monitoring, and
availability.

## Verify supply-chain metadata

Each GitHub Release lists both final image digests. Verify a digest against this
repository's GitHub OIDC-backed attestation:

```sh
gh attestation verify \
  oci://ghcr.io/endalk200/skopeo-api@sha256:<digest> \
  --repo endalk200/skopeo
```

Repeat for `skopeo-web`. Published images also carry OCI source, revision,
version, license, title, and description metadata plus attached BuildKit SBOM
and maximum provenance attestations.
