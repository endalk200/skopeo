#!/usr/bin/env bash

set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL for the bundled PostgreSQL service}"
: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD for the bundled PostgreSQL service}"
: "${SKOPEO_HOST:?Set SKOPEO_HOST to the public hostname}"
: "${SKOPEO_VERSION:?Set SKOPEO_VERSION to the application image tag}"

bundle_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
project="${COMPOSE_PROJECT_NAME:-skopeo-compose-smoke}"
origin="${SKOPEO_SMOKE_ORIGIN:-http://localhost}"

compose() {
	docker compose --project-name "${project}" --file "${bundle_dir}/compose.yaml" "$@"
}

digest_compose() {
	docker compose --project-name "${project}" \
		--file "${bundle_dir}/compose.yaml" \
		--file "${bundle_dir}/compose.digest.yaml" \
		"$@"
}

cleanup() {
	compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT
cleanup
compose config --quiet

fixture_digest="sha256:$(printf '0%.0s' {1..64})"
digest_images="$(
	SKOPEO_API_DIGEST="${fixture_digest}" \
		SKOPEO_WEB_DIGEST="${fixture_digest}" \
		digest_compose config --images
)"
test "$(grep -Fxc "ghcr.io/endalk200/skopeo-api@${fixture_digest}" <<< "${digest_images}")" = 2
test "$(grep -Fxc "ghcr.io/endalk200/skopeo-web@${fixture_digest}" <<< "${digest_images}")" = 1

if compose config --services | grep -Eiq 'otel|opentelemetry'; then
	echo "The single-host bundle must not require an OpenTelemetry Collector."
	exit 1
fi

compose up --detach --wait
curl --fail --silent "${origin}/" >/dev/null
curl --fail --silent "${origin}/icon.svg" >/dev/null
curl --fail --silent "${origin}/api/docs" >/dev/null
curl --fail --silent "${origin}/api/openapi.json" >/dev/null
test "$(curl --silent --output /dev/null --write-out '%{http_code}' "${origin}/docs")" = 404
test "$(curl --silent --output /dev/null --write-out '%{http_code}' "${origin}/openapi.json")" = 404
test "$(curl --silent --output /dev/null --write-out '%{http_code}' "${origin}/healthz")" = 404
test "$(curl --silent --output /dev/null --write-out '%{http_code}' "${origin}/readyz")" = 404
migrate_container="$(compose ps --all --quiet migrate)"
test -n "${migrate_container}"
test "$(docker inspect --format '{{.State.ExitCode}}' "${migrate_container}")" = 0
compose run --rm migrate

cleanup
export DATABASE_URL="${FAILED_MIGRATION_DATABASE_URL:-postgres://skopeo:wrong-password@postgres:5432/skopeo}"
set +e
compose up --detach --wait >/dev/null 2>&1
failed_migration_status=$?
set -e
if [[ "${failed_migration_status}" == 0 ]]; then
	echo "Compose unexpectedly started after migration failure."
	exit 1
fi

api_container="$(compose ps --all --quiet api)"
if [[ -z "${api_container}" || "$(docker inspect --format '{{.State.Running}}' "${api_container}")" != false ]]; then
	echo "The API started even though migration failed."
	exit 1
fi
