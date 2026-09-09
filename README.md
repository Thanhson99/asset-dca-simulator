# asset-dca-simulator

A simple web app for visualizing long-term investing scenarios across assets like stocks, gold, and bank savings.

The goal is to answer questions like:

- What happens if I invest a fixed amount every month?
- How much profit or loss would I have today?
- How do different assets compare on the same chart?

## Live

```text
https://thanhson99.github.io/asset-dca-simulator/
```

## Setup

Initialize folders only:

macOS / Linux:

```bash
sh scripts/init.sh
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/init.ps1
```

## Notes

Project context and technical decisions are tracked in `docs/agent-handoff.md`.
Collector usage is tracked in `docs/collector.md`.
Code style rules are tracked in `docs/code-style.md`.

## License

MIT License.
