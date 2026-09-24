# =============================================================================
# Aimious AI Recruitment Platform -- developer entrypoints
#
#   make            show this help
#   make setup      create .env, the backend venv and the npm packages
#   make dev        Postgres (5434) + Django API (8200) + Vite dev server (5175)
#   make docker-up  the whole stack in containers (8200 / 8201 / 5434)
#
# Every Python command below uses the venv's own binaries explicitly
# (backend/.venv/bin/...), so none of these targets depend on an activated
# shell and none of them can leak into the system interpreter.  Backend
# commands run from backend/, frontend commands run from frontend/ with npm.
# =============================================================================

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# --------------------------------------------------------------- locations --
ROOT      := $(patsubst %/,%,$(dir $(abspath $(lastword $(MAKEFILE_LIST)))))
BACKEND   := $(ROOT)/backend
FRONTEND  := $(ROOT)/frontend
SCRIPTS   := $(ROOT)/scripts
VENV      := $(BACKEND)/.venv

PYTHON    := $(VENV)/bin/python
PIP       := $(VENV)/bin/pip
MANAGE    := $(PYTHON) manage.py

# Interpreter used to *create* the venv when it does not exist yet.
HOST_PYTHON ?= python3

# ------------------------------------------------------------------- ports --
# 5433, 8000, 8080, 8100, 8101 and 5174 are taken by other projects here.
API_HOST  ?= 127.0.0.1
API_PORT  ?= 8200
WEB_PORT  ?= 5175
DB_PORT   ?= 5434
DOCKER_WEB_PORT ?= 8201

# ---------------------------------------------------------------- database --
DB_NAME   := recruitment_demo
DB_USER   := recruit
DC_FILE   := $(ROOT)/docker-compose.yml
COMPOSE   := docker compose -f $(DC_FILE)
# `exec -T` = no pseudo-TTY, so these work from scripts and CI as well.
PSQL      := $(COMPOSE) exec -T postgres psql -v ON_ERROR_STOP=1 -U $(DB_USER)
ENVFILE   := $(ROOT)/.env

# Backend commands run from backend/, so the repo-root .env has to be exported
# into the environment first (exactly what docker-compose's `env_file:` does).
# The `export -p` snapshot is replayed afterwards so anything the caller
# exported keeps its value: `MATCH_ENGINE=claude make api` beats the file.
LOAD_ENV  := __env_snapshot="$$(export -p)"; set -a; if [ -f "$(ENVFILE)" ]; then . "$(ENVFILE)"; fi; set +a; eval "$$__env_snapshot" 2>/dev/null || true

# Demo accounts (plan.md section 18).
DEMO_ACCOUNTS := rahul priya karthik anitha arun divya suresh nisha vikram lakshmi meera arjun
DEMO_PASSWORD := Demo@1234

# ------------------------------------------------------------------ colours --
C_HEAD := \033[1;36m
C_CMD  := \033[1;32m
C_OFF  := \033[0m

.PHONY: help setup env venv deps db-up db-wait db-down db-shell \
        migrate makemigrations seed reset-db api web dev openapi \
        test test-api test-web lint format typecheck audit \
        docker-build docker-up docker-down docker-logs demo clean clean-all

# =============================================================================
# Help
# =============================================================================
help: ## Show this help
	@printf '$(C_HEAD)Aimious AI Recruitment Platform$(C_OFF)\n'
	@printf '  API   http://localhost:$(API_PORT)/api/v1/      docs: http://localhost:$(API_PORT)/api/docs/\n'
	@printf '  Web   http://localhost:$(WEB_PORT) (vite)  http://localhost:$(DOCKER_WEB_PORT) (docker)\n'
	@printf '  DB    postgres://$(DB_USER)@localhost:$(DB_PORT)/$(DB_NAME)\n\n'
	@printf '$(C_HEAD)Targets$(C_OFF)\n'
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| sort \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  $(C_CMD)%-16s$(C_OFF) %s\n", $$1, $$2}'
	@printf '\n$(C_HEAD)Typical first run$(C_OFF)\n'
	@printf '  make setup && make db-up && make migrate && make seed && make dev\n'

# =============================================================================
# Setup
# =============================================================================
setup: env venv deps ## One-time bootstrap: .env, venv, python + npm deps
	@printf '\n$(C_HEAD)Setup complete.$(C_OFF)\n'
	@printf '  1. make db-up && make migrate && make seed\n'
	@printf '  2. make dev\n'

env: ## Create .env from .env.example (never overwrites)
	@if [ ! -f "$(ENVFILE)" ]; then \
		cp "$(ROOT)/.env.example" "$(ENVFILE)"; \
		echo "created .env from .env.example"; \
	else \
		echo ".env already exists -- left untouched"; \
	fi

venv: ## Create backend/.venv if it is missing
	@if [ ! -x "$(PYTHON)" ]; then \
		echo "creating virtualenv at $(VENV)"; \
		$(HOST_PYTHON) -m venv "$(VENV)"; \
		"$(PIP)" install --upgrade pip setuptools wheel; \
	else \
		echo "virtualenv already present: $$($(PYTHON) -V)"; \
	fi

deps: venv ## Install backend (dev) and frontend dependencies
	$(PIP) install --requirement $(BACKEND)/requirements-dev.txt
	cd $(FRONTEND) && npm install

# =============================================================================
# Database
# =============================================================================
db-up: ## Start PostgreSQL (container aimious-recruit-postgres, host port 5434)
	$(COMPOSE) up -d postgres
	@$(MAKE) --no-print-directory db-wait

db-wait: ## Block until PostgreSQL accepts connections
	@printf 'waiting for postgres on localhost:$(DB_PORT) '
	@for i in $$(seq 1 60); do \
		if $(COMPOSE) exec -T postgres pg_isready -U $(DB_USER) -d $(DB_NAME) >/dev/null 2>&1; then \
			printf ' ready\n'; exit 0; \
		fi; \
		printf '.'; sleep 1; \
	done; \
	printf '\npostgres did not become ready in 60s (docker compose logs postgres)\n'; exit 1

db-down: ## Stop PostgreSQL (data volume is kept)
	$(COMPOSE) stop postgres

db-shell: ## Open a psql prompt inside the database container
	$(COMPOSE) exec postgres psql -U $(DB_USER) -d $(DB_NAME)

migrate: ## Apply Django migrations
	cd $(BACKEND) && { $(LOAD_ENV); } && $(MANAGE) migrate --noinput

makemigrations: ## Create migrations:  make makemigrations [APP=jobs]
	cd $(BACKEND) && { $(LOAD_ENV); } && $(MANAGE) makemigrations $(APP)

seed: ## Load demo data (idempotent; RESET=1 wipes the demo data first)
	cd $(BACKEND) && { $(LOAD_ENV); } && $(MANAGE) seed_demo $(if $(filter 1,$(RESET)),--reset,)

reset-db: db-wait ## Drop and recreate the database, then migrate and seed --reset
	$(PSQL) -d postgres -c 'DROP DATABASE IF EXISTS $(DB_NAME) WITH (FORCE);'
	$(PSQL) -d postgres -c 'CREATE DATABASE $(DB_NAME);'
	@$(MAKE) --no-print-directory migrate
	@$(MAKE) --no-print-directory seed RESET=1

# =============================================================================
# Run (local venv)
# =============================================================================
api: ## Run the Django dev server on :8200
	cd $(BACKEND) && { $(LOAD_ENV); } && $(MANAGE) runserver $(API_HOST):$(API_PORT)

web: ## Run the Vite dev server on :5175
	cd $(FRONTEND) && npm run dev -- --port $(WEB_PORT) --strictPort

dev: ## Postgres + API + web together (Ctrl-C stops both processes)
	@bash $(SCRIPTS)/dev.sh

openapi: ## Dump the OpenAPI schema to frontend/openapi.json and regenerate src/types/api.d.ts
	cd $(BACKEND) && { $(LOAD_ENV); } && $(MANAGE) spectacular --file ../frontend/openapi.json
	cd $(FRONTEND) && npx openapi-typescript openapi.json -o src/types/api.d.ts

# =============================================================================
# Quality
# =============================================================================
test: test-api test-web ## Run every test suite

# The test settings module is forced here because pytest-django lets the
# DJANGO_SETTINGS_MODULE environment variable (exported from .env) win over
# the value in pyproject.toml.
test-api: ## Run the backend test suite (pytest):  make test-api PYTEST_ARGS="-k jobs"
	cd $(BACKEND) && { $(LOAD_ENV); } && \
		DJANGO_SETTINGS_MODULE=config.settings.test PYTHONPATH=$(BACKEND) \
		$(PYTHON) -m pytest $(PYTEST_ARGS)

test-web: ## Run the frontend test suite (vitest, single run)
	cd $(FRONTEND) && npm run test -- --run

lint: ## Ruff + import-linter on the backend, ESLint + Prettier check on the frontend
	cd $(BACKEND) && $(VENV)/bin/ruff check .
	cd $(BACKEND) && $(VENV)/bin/ruff format --check .
	cd $(BACKEND) && $(VENV)/bin/lint-imports
	cd $(FRONTEND) && npm run lint
	cd $(FRONTEND) && npx prettier --check src

format: ## Auto-format: ruff (backend), Prettier + ESLint --fix (frontend)
	cd $(BACKEND) && $(VENV)/bin/ruff format .
	cd $(BACKEND) && $(VENV)/bin/ruff check --fix .
	cd $(FRONTEND) && npx prettier --write src
	cd $(FRONTEND) && npm run lint -- --fix

typecheck: ## Typecheck the frontend (tsc --noEmit)
	cd $(FRONTEND) && npm run typecheck

audit: ## Dependency vulnerability scan (pip-audit + npm audit; needs network)
	cd $(BACKEND) && $(PYTHON) -m pip_audit --requirement requirements.txt
	cd $(FRONTEND) && npm audit --omit=dev

# =============================================================================
# Docker
# =============================================================================
docker-build: ## Build the api and web images
	$(COMPOSE) build

docker-up: ## Build and start the full stack (API 8200, web 8201, db 5434)
	$(COMPOSE) up -d --build
	@printf '\n$(C_HEAD)Stack is starting$(C_OFF)\n'
	@printf '  UI    http://localhost:$(DOCKER_WEB_PORT)\n'
	@printf '  API   http://localhost:$(API_PORT)/api/docs/\n'
	@printf '  logs  make docker-logs\n'

docker-down: ## Stop the stack (KEEP_DATA=0 also drops the volumes)
	@if [ "$${KEEP_DATA:-1}" = "0" ]; then \
		$(COMPOSE) down --volumes --remove-orphans; \
	else \
		$(COMPOSE) down --remove-orphans; \
	fi

docker-logs: ## Follow the api + web logs
	$(COMPOSE) logs -f api web

demo: docker-up ## docker-up, then migrate + seed inside the api container and print the demo URL and accounts
	@printf 'waiting for the api container to report healthy '
	@for i in $$(seq 1 60); do \
		status="$$(docker inspect --format '{{.State.Health.Status}}' aimious-recruit-api 2>/dev/null || echo starting)"; \
		if [ "$$status" = "healthy" ]; then printf ' ready\n'; break; fi; \
		if [ "$$i" = "60" ]; then printf '\napi did not become healthy in 3 minutes (make docker-logs)\n'; exit 1; fi; \
		printf '.'; sleep 3; \
	done
	$(COMPOSE) exec -T api python manage.py migrate --noinput
	$(COMPOSE) exec -T api python manage.py seed_demo
	@printf '\n$(C_HEAD)Demo is ready$(C_OFF)\n'
	@printf '  UI        http://localhost:$(DOCKER_WEB_PORT)\n'
	@printf '  API docs  http://localhost:$(API_PORT)/api/docs/\n'
	@printf '  Password  $(DEMO_PASSWORD) for every account\n'
	@printf '  Accounts  '; for u in $(DEMO_ACCOUNTS); do printf '%s@aimious.demo ' "$$u"; done; printf '\n'
	@printf '  Admin     rahul@aimious.demo (HR Manager)\n'
	@printf '  Support   meera@aimious.demo, arjun@aimious.demo (Admin: assign and work tickets)\n'

# =============================================================================
# Housekeeping
# =============================================================================
clean: ## Remove caches, build output and generated files (keeps venv, node_modules, database)
	find $(BACKEND) -path '$(VENV)' -prune -o -type d -name '__pycache__' -print0 2>/dev/null \
		| xargs -0 rm -rf
	rm -rf $(BACKEND)/.pytest_cache $(BACKEND)/.ruff_cache $(BACKEND)/.mypy_cache
	rm -rf $(BACKEND)/.coverage $(BACKEND)/htmlcov $(BACKEND)/staticfiles
	rm -rf $(FRONTEND)/dist $(FRONTEND)/.vite $(FRONTEND)/coverage $(FRONTEND)/openapi.json
	@echo "cleaned (venv, node_modules and the database were kept)"

clean-all: clean ## Also delete the venv and node_modules
	rm -rf $(VENV) $(FRONTEND)/node_modules
	@echo "removed venv and node_modules"
