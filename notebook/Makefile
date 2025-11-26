.PHONY: venv run-backend

venv:
	python3 -m venv .venv
	. .venv/bin/activate && \
	pip install --upgrade pip && \
	cd backend && pip install -r requirements.txt

run-backend:
	. .venv/bin/activate && \
	cd backend && python -m uvicorn app.main:app --port 8000 --reload