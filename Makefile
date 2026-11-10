.DEFAULT_GOAL := start
COMPOSE ?= docker compose

.PHONY: help check env install build start run restart stop down status logs fixtures test db backup

help: ## Show available commands
	@printf '%s\n' \
		'AgroCórdoba local commands:' \
		'  make           Prepare local config and start all services' \
		'  make install   Create local config if needed and build images' \
		'  make start     Build if needed and start all services' \
		'  make run       Alias for start' \
		'  make restart   Restart running services' \
		'  make stop      Stop services without removing containers or data' \
		'  make down      Remove containers and networks; preserve database volume' \
		'  make status    Show service status and health' \
		'  make logs      Follow logs for all application services' \
		'  make fixtures  Import synthetic fixture into an empty PostgreSQL database' \
		'  make test      Run backend tests in the container' \
		'  make db        Open a PostgreSQL shell' \
		'  make backup    Write a timestamped SQL backup under backups/'

check: ## Check Docker Compose and that the Docker daemon is available
	@docker compose version >/dev/null
	@docker info >/dev/null

env: check ## Create .env with generated secrets if it does not exist
	@if [ -f .env ]; then \
		echo ".env already exists; keeping the current configuration."; \
	else \
		set -eu; \
		tmp=$$(mktemp .env.XXXXXX); \
		trap 'rm -f "$$tmp"' EXIT; \
		umask 077; \
		docker run --rm -i python:3.13-slim python -c \
			'import secrets, sys; lines = sys.stdin.read().splitlines(); keys = {"FLASK_SECRET_KEY", "POSTGRES_PASSWORD"}; lines = [f"{line.split(chr(61), 1)[0]}={secrets.token_hex(32)}" if line.split(chr(61), 1)[0] in keys and line.endswith("=") else line for line in lines]; print("\n".join(lines))' \
			< .env.example > "$$tmp"; \
		mv "$$tmp" .env; \
		echo "Created .env with private random secrets."; \
	fi

install: env ## Prepare local configuration and build application images
	$(COMPOSE) build

build: env ## Build or rebuild application images
	$(COMPOSE) build

start: env ## Build if needed and start frontend, API, and PostgreSQL
	$(COMPOSE) up --build -d
	@echo "AgroCórdoba services started. Open http://localhost:3000 by default; change the port with FRONTEND_PORT in .env."

run: start ## Alias for start

restart: ## Restart running services without rebuilding images
	$(COMPOSE) restart

stop: ## Stop services without removing containers or database data
	$(COMPOSE) stop

down: ## Remove containers and networks while preserving the database volume
	$(COMPOSE) down

status: ## Show service status and health
	$(COMPOSE) ps

logs: ## Follow service logs
	$(COMPOSE) logs -f frontend backend db

fixtures: env ## Import the synthetic SQLite fixture into an empty PostgreSQL database
	$(COMPOSE) --profile fixtures run --rm fixtures

test: env ## Run backend tests in an isolated container
	$(COMPOSE) run --rm backend python -m pytest -q -p no:cacheprovider

db: ## Open a PostgreSQL shell
	$(COMPOSE) exec db sh -c 'exec psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

backup: ## Save a timestamped PostgreSQL SQL backup under backups/
	@mkdir -p backups
	@file="backups/agrocordoba-$$(date +%Y%m%d-%H%M%S).sql"; \
	$(COMPOSE) exec -T db sh -c 'exec pg_dump -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"' > "$$file"; \
	echo "Backup saved to $$file"
