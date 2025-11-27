.PHONY: venv run-backend

venv:
	python3 -m venv .venv
	. .venv/bin/activate && \
	pip3 install --upgrade pip && \
	pip3 install -r requirements.txt

run-backend:
	. .venv/bin/activate && \
	python3 -m uvicorn app.main:app --port 8000 --reload