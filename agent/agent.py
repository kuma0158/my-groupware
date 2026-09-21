import argparse
import os
from dataclasses import dataclass, field


@dataclass
class AgentConfig:
    model: str = field(default_factory=lambda: os.getenv("MODEL_NAME", "gpt-4o-mini"))
    endpoint: str = field(default_factory=lambda: os.getenv("AZURE_OPENAI_ENDPOINT", ""))
    api_key: str = field(default_factory=lambda: os.getenv("AZURE_OPENAI_API_KEY", ""))
    deployment: str = field(default_factory=lambda: os.getenv("AZURE_OPENAI_CHAT_DEPLOYMENT", ""))
    api_version: str = field(default_factory=lambda: os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"))

    @property
    def azure_ready(self) -> bool:
        return bool(self.endpoint and self.api_key and self.deployment)


def _fallback_response(prompt: str) -> str:
    return (
        "Groupware agent ready. "
        f"I received: '{prompt}'. "
        "To enable live model responses, set AZURE_OPENAI_ENDPOINT, "
        "AZURE_OPENAI_API_KEY, and AZURE_OPENAI_CHAT_DEPLOYMENT in the environment."
    )


def respond(prompt: str, config: AgentConfig) -> str:
    if not config.azure_ready:
        return _fallback_response(prompt)

    try:
        from openai import AzureOpenAI
    except ImportError:
        return _fallback_response(prompt)

    try:
        client = AzureOpenAI(
            api_key=config.api_key,
            azure_endpoint=config.endpoint,
            api_version=config.api_version,
        )
        response = client.chat.completions.create(
            model=config.deployment,
            messages=[
                {"role": "system", "content": "You are a helpful assistant for this groupware workspace."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.3,
        )
        return response.choices[0].message.content or _fallback_response(prompt)
    except Exception:
        return _fallback_response(prompt)


def main() -> None:
    parser = argparse.ArgumentParser(description="Local groupware agent")
    parser.add_argument("--prompt", default="Summarize the current workspace and suggest three useful tasks.", help="Prompt to send to the agent")
    args = parser.parse_args()

    config = AgentConfig()
    result = respond(args.prompt, config)
    print(result)


if __name__ == "__main__":
    main()
