# =============================================================================
# GridNexus – Root Makefile
# Targets: up, down, test, lint
# =============================================================================

.PHONY: up down test lint test-engine test-broker test-command-center \
        lint-engine lint-broker lint-command-center

# ---------------------------------------------------------------------------
# Docker Compose lifecycle
# ---------------------------------------------------------------------------
up:
	docker compose up -d --build

down:
	docker compose down

# ---------------------------------------------------------------------------
# Tests – runs each workspace's test suite
# ---------------------------------------------------------------------------
test: test-engine test-broker test-command-center
	@echo ""
	@echo "=== All tests passed ==="

test-engine:
	@echo "--- Running engine tests ---"
	cd engine && python -m poetry run pytest -v

test-broker:
	@echo "--- Running broker tests ---"
	cd broker && npm test

test-command-center:
	@echo "--- Running command-center tests ---"
	cd command-center && npm test

# ---------------------------------------------------------------------------
# Lint – runs ruff (engine) and eslint (broker, command-center)
# ---------------------------------------------------------------------------
lint: lint-engine lint-broker lint-command-center
	@echo ""
	@echo "=== All linters passed ==="

lint-engine:
	@echo "--- Linting engine (ruff) ---"
	cd engine && python -m poetry run ruff check .

lint-broker:
	@echo "--- Linting broker (eslint) ---"
	cd broker && npx eslint .

lint-command-center:
	@echo "--- Linting command-center (eslint) ---"
	cd command-center && npx eslint .
