.PHONY: help install run open-url

.DEFAULT_GOAL := run

REPO_ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PORT ?= 3456
URL := http://localhost:$(PORT)

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  make run      Install deps if needed and launch the Kanban (default)"
	@echo "  make install  Install Node dependencies"
	@echo "  make help     Show this help"
	@echo ""
	@echo "Optional:"
	@echo "  PORT=4000 make run"
	@echo "  FEATURES_PATH=specifications/FEATURES.md make run"

install:
	@cd "$(REPO_ROOT)" && npm install

run: install
	@cd "$(REPO_ROOT)" && \
	if curl -sf "$(URL)/api/config" >/dev/null 2>&1; then \
		echo "Features Kanban already running at $(URL)"; \
		$(MAKE) --no-print-directory open-url; \
	else \
		echo "Starting Features Kanban at $(URL)"; \
		( \
			for i in 1 2 3 4 5 6 7 8 9 10; do \
				if curl -sf "$(URL)/api/config" >/dev/null 2>&1; then \
					$(MAKE) --no-print-directory open-url; \
					exit 0; \
				fi; \
				sleep 0.3; \
			done; \
		) & \
		PORT="$(PORT)" $(if $(FEATURES_PATH),FEATURES_PATH="$(FEATURES_PATH)") npm start; \
	fi

open-url:
	@if command -v open >/dev/null 2>&1; then \
		open "$(URL)"; \
	elif command -v xdg-open >/dev/null; then \
		xdg-open "$(URL)"; \
	else \
		echo "Open $(URL) in your browser"; \
	fi
