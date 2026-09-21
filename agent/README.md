# Groupware Agent

This folder contains a lightweight local AI agent scaffold for the workspace.

## Quick start

```bash
cd agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python agent.py --prompt "List the top three tasks for the team today."
```

## Environment variables

To enable live Azure OpenAI responses, set:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_CHAT_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION` (optional, default: `2024-02-01`)
- `MODEL_NAME` (optional, default: `gpt-4o-mini`)

If the variables are not set, the agent falls back to a local deterministic response so the scaffold still runs.
