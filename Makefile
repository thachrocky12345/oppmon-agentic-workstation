# Arkon Workstation Makefile
# Use 'make help' to see available commands

.PHONY: help init diagrams dev build test clean docker-up docker-down

# Default target
help:
	@echo "Arkon Workstation Commands"
	@echo ""
	@echo "Documentation:"
	@echo "  make init        - Run post_init hook and remind to run /init in Claude Code"
	@echo "  make diagrams    - Remind to run /init in Claude Code to regenerate diagrams"
	@echo ""
	@echo "Development:"
	@echo "  make dev         - Start development servers (frontend + backend)"
	@echo "  make build       - Build all packages"
	@echo "  make test        - Run all tests"
	@echo "  make lint        - Run linters"
	@echo "  make typecheck   - Run type checking"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-up   - Start Docker Compose stack"
	@echo "  make docker-down - Stop Docker Compose stack"
	@echo "  make docker-logs - Show Docker logs"
	@echo ""
	@echo "Database:"
	@echo "  make migrate     - Run database migrations"
	@echo "  make seed        - Seed development data"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean       - Remove build artifacts"

# Documentation commands
init:
	@bash .claude/hooks/post_init.sh
	@echo ""
	@echo "Now run /init inside Claude Code to sync all docs, ADRs, diagrams and flows"

diagrams:
	@echo "Run /init inside Claude Code to regenerate all diagrams and flows"

# Development commands
dev:
	@echo "Starting development servers..."
	@echo "Backend: http://localhost:3001"
	@echo "Frontend: http://localhost:3002"
	@cd arkon-backend && npm run dev &
	@cd arkon-frontend && npm run dev

dev-backend:
	cd arkon-backend && npm run dev

dev-frontend:
	cd arkon-frontend && npm run dev

build:
	cd arkon-backend && npm run build
	cd arkon-frontend && npm run build

test:
	cd arkon-backend && npm test
	cd arkon-frontend && npm test

lint:
	cd arkon-backend && npm run lint
	cd arkon-frontend && npm run lint

typecheck:
	cd arkon-backend && npm run typecheck
	cd arkon-frontend && npm run typecheck

# Docker commands
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-logs:
	docker-compose logs -f

docker-build:
	docker-compose build

docker-clean:
	docker-compose down -v --rmi local

# Database commands
migrate:
	cd arkon-backend && npm run migrate

seed:
	cd arkon-backend && npx tsx scripts/seed.ts

# Cleanup
clean:
	rm -rf arkon-backend/dist
	rm -rf arkon-frontend/.next
	rm -rf arkon-frontend/out
	rm -rf **/node_modules/.cache

# Install dependencies
install:
	cd arkon-backend && npm install
	cd arkon-frontend && npm install

# Full reset
reset: clean docker-clean install
	@echo "Full reset complete"
