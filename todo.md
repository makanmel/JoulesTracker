For a **learning-only, AI spec-driven SDLC**, the minimum realistic monthly cost is **$15–$20**, and you can keep it at **$15** if you avoid paid API keys and use free tiers.

## $15/month minimal setup


| Layer            | Tool                                                                 | Cost | Role                                                                     |
| ---------------- |----------------------------------------------------------------------| ---- |--------------------------------------------------------------------------|
| **AI coding**    | Windsurf ($15/mo tier)                                               | $15  | Turns specs into code and tests; runs commands in the IDE.               |
| **Spec storage** | Markdown in GitHub repo / GitHub Issues                              | Free | The single source of truth the AI reads/writes.                          |
| **Repo + CI**    | GitHub (public repo) + GitHub Actions                                | Free | Runs tests/lint on every push/PR.                                        |
| **AI review**    | CodeRabbit OSS / PR-Agent (open-source GitHub Action) or self-hosted | Free | Summarizes PRs, catches issues using your OpenAI API key or local model. |
| **Deploy**       | Vercel / Netlify / Render / Railway free tier                        | Free | Auto-deploy after CI passes on`main`.                                    |

**Total: ~$15/month.**

## Where the extra $5–$20 usually goes

- **LLM API key for review/spec bots**: if you run an AI PR reviewer via GitHub Actions, it needs an OpenAI/Anthropic key. Light usage for learning is usually **$5–$20/month**. You can avoid this by running a local model (Ollama/LM Studio) on your machine, but then the CI runner cannot access it unless you expose it.
- **Private repos**: GitHub Actions for private repos gives 2,000 minutes/month free — enough for learning. If you exceed it, it is **$0.008/minute**.

## Suggested learning architecture

1. **Spec**: keep a `specs/` folder in your repo with `.md` files describing each feature.
2. **AI coding**: in Windsurf, point it at the spec file and say “implement this spec, add tests, then run them.”
3. **Tests**: add a test runner + linter, and a GitHub Action that runs on PR.
4. **Branch protection**: require PR + passing CI before merging to `main`.
5. **Deploy**: connect Vercel/Netlify to the repo; deploy only from `main` after CI passes.
6. **AI review (optional)**: add an open-source AI reviewer action that posts comments on the PR.

## If you want everything managed

- **CodeRabbit Pro** or **CodiumAI PR-Agent cloud**: ~$10–$15/month.
- **OpenAI/Claude API** for spec generation and review: ~$10–$30/month depending on usage.

So for learning, **start with $15 Windsurf + free GitHub + free deploy**, then add paid AI-review/API layers only when you hit their limits.
