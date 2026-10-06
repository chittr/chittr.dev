## Configuration files {#user-config}

Chittr reads up to two YAML files. The user file loads first, then the project file overrides it field by field. There's no system-wide file.

| File | Use |
| --- | --- |
| `~/.agents/chittr.yaml` | Your user config: fallback participants, display name, defaults and trusted workspaces. Setup creates it. |
| `<launch directory>/.agents/chittr.yaml` | Project config: this directory's participants and overrides. |

A user config looks like this:

```yaml
version: 1
human:
  name: Your name
skills:
  enabled: true
conversation:
  follow_up_turns: 8
permissions:
  edits: false
  commands: false
  network: false
defaultAgents:
  codex:
    provider: codex
  claude:
    provider: claude
```

Changes apply on launch, on resume, or when you run `/reload` while all agents are idle. Invalid config is rejected, and a running room keeps its current config. `/config` shows every effective setting and the file it came from.

## Settings {#settings}

| Key | File | Default | Description |
| --- | --- | --- | --- |
| `version` | Both | | Required. Always `1`. |
| `human.name` | Both | `You` | How you appear in the transcript and to agents. One line, up to 80 characters. |
| `skills.enabled` | Both | `true` | Give agents a catalogue of their provider's installed skills. |
| `conversation.follow_up_turns` | Both | `8` | Follow-up turns each message allows, from 1 to 1000. |
| `permissions.edits` | Both | `false` | Let agents change files in the workspace. |
| `permissions.commands` | Both | `false` | Let agents run commands. |
| `permissions.network` | Both | `false` | Let agents use the network for tasks. |
| `defaultAgents` | User | | Your fallback participants. |
| `agents` | Project | | This project's participants. Replaces `defaultAgents`. |
| `trustedCommands.workspaces` | User | | Workspaces where commands may run without the sandbox. |

Unknown keys are rejected. `@human` always addresses you, whatever your display name.

## Participants {#participants}

A project file with `agents` uses exactly that roster. Without one, or without a project file, your `defaultAgents` join. An empty `agents: {}` is an error rather than a fallback.

Each key under `agents` or `defaultAgents` is the agent's name and its `@handle`. A name starts with a lowercase letter, then lowercase letters, digits, `_` or `-`, up to 32 characters. `human` and `all` are reserved. Several agents can share a provider.

```yaml
version: 1
agents:
  codex:
    provider: codex
  claude:
    provider: claude
  grok:
    provider: grok
    instructions:
      sources:
        - text: Inspect relevant files before making concrete claims.
```

Each agent takes these fields:

| Field | Required | Description |
| --- | --- | --- |
| `provider` | Yes | `codex`, `claude` or `grok`. `antigravity` is accepted but outside this preview's support. |
| `model` | No | Model name. Omit it to use the CLI's default. |
| `effort` | No | Reasoning effort. Omit it to use the CLI's default. See [models and effort](#models). |
| `enabled` | No | Set to `false` to leave the agent out of the room. |
| `instructions.sources` | No | Extra instructions, read in order. See [custom instructions](#instructions). |

- Each entry stands alone. Project entries don't inherit a model, instructions or anything else from `defaultAgents`.
- Saved chats identify agents by name. Renaming one creates a new participant, so keep names stable when you resume.

## Models and effort {#models}

```yaml
version: 1
agents:
  astra:
    provider: codex
    model: gpt-6-astra
    effort: high
  sol:
    provider: codex
    model: gpt-5.6-sol
    effort: medium
```

Without `model`, Codex and Claude use their CLI default, and Grok uses its CLI default in an isolated profile. Without `effort`, the CLI decides.

Accepted `effort` levels:

| Provider | Effort levels |
| --- | --- |
| Codex | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, `ultra` |
| Claude | `low`, `medium`, `high`, `xhigh`, `max` |
| Grok | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max` |

- An unknown level is a config error that lists the accepted ones.
- At startup, Chittr also checks the levels the model advertises. A level the model rejects makes that agent unavailable, with an error listing its levels.
- Chittr passes effort as Codex's `model_reasoning_effort`, Claude's `--effort` and Grok's `--reasoning-effort`, and never maps it to another level. An explicit Claude value overrides `CLAUDE_CODE_EFFORT_LEVEL`. Native config files aren't changed.
- After changing `model` or `effort`, run `/reload` while idle. Only the affected agents restart, with fresh provider sessions and the saved conversation.

## Custom instructions {#instructions}

```yaml
# <launch directory>/.agents/chittr.yaml
version: 1
agents:
  codex:
    provider: codex
    instructions:
      sources:
        - file: instructions/review.md
  claude:
    provider: claude
    instructions:
      sources:
        - text: Focus on the end-user experience of this project.
```

Each source is one of:

| Source | Description |
| --- | --- |
| `text` | Instructions written inline. |
| `file` | A file path, relative to the YAML file that names it. The example reads `.agents/instructions/review.md`. |

- Sources are read in order, at launch and on `/reload`. Files may live outside the workspace.
- They add to the provider's own guidance and the room protocol, and don't replace them.
- Only the selected roster's sources are read. A project's `agents` don't merge with your `defaultAgents` instructions.
- An unreadable file is an error.

## Permissions {#permissions}

Permissions apply to the whole room, and all three start off.

| Permission | Grants |
| --- | --- |
| `edits` | `write_file`, and command writes inside the workspace. |
| `commands` | `run_command`. |
| `network` | `fetch_url`, and network access for commands. |

```yaml
version: 1
permissions:
  edits: true
  commands: true
  network: false
```

- With all three off, agents can still talk and read files in the launch directory.
- With `commands` on and `edits` off, commands can read the workspace but not change it.
- `network` covers task traffic only. Provider sign-in and inference don't depend on it.
- A project file can grant permissions your user file doesn't. Read it before launching in an unfamiliar project.
- Agents can't ask for a permission mid-chat. Edit the YAML and run `/reload` while idle.

Commands run in one of three modes. `/config`, the terminal banner and the browser show the current one.

| Mode | When | Commands run |
| --- | --- | --- |
| `off` | `commands: false` | Not at all. |
| `sandboxed` | `commands: true` | In Chittr's macOS sandbox, limited to the workspace and the room's `edits` and `network` grants. |
| `trusted` | All three permissions on, plus a trust grant for this workspace | As your user, with no sandbox. |

## Trusted commands {#trusted-commands}

Sandboxed commands suit builds and tests that stay in the workspace. They start with only `PATH`, `LANG` and `TMPDIR` set, so `HOME`, tokens and your SSH agent are missing, and Homebrew isn't on `PATH`. Commands that need your logins, such as `gh pr create` or `git push` over SSH, fail.

Trusted commands run through `/bin/sh` in the launch directory as your user, with your files, network, logins and exported environment. They can read and write outside the workspace. Interactive aliases and unexported functions aren't available, and shell startup files aren't sourced.

Grant trust in your user file, one workspace at a time:

```yaml
# ~/.agents/chittr.yaml
trustedCommands:
  workspaces:
    - ~/Projects/your-project
```

- Each entry matches the launch directory's exact real path, after resolving symlinks. Subdirectories and other worktrees need their own entries.
- A project file can't grant trust.
- For one launch only, pass `--trusted-commands` to `chittr`, `chittr resume` or `chittr --web`. It writes no config.

Trust only takes effect when `edits`, `commands` and `network` are all on, because the sandbox is what enforces them.

- With a `trustedCommands` entry and a permission off, commands fall back to sandboxed, or off. `/config`, the banner and the browser name the permission and the file that set it.
- With `--trusted-commands` and a permission off, Chittr refuses to launch.
- A project can switch trust off. `commands: false` makes the room discussion only, and turning off `edits` or `network` keeps commands sandboxed.
- A project can also switch all three on and activate your grant, so read its config before adding it to `workspaces`.

File tools keep their workspace limits in every mode. After changing a grant, run `/reload` while idle. Resuming a chat applies the current settings, not the ones it was saved with. Chittr reads the environment once at launch, so relaunch to pick up exported changes.

## Skills {#skills}

Each agent gets a catalogue of its provider's installed skills, and reads a skill's `SKILL.md` through the room's file tools. Ask for one by name:

```text
@codex Use the review skill to inspect this proposal.
```

Chittr looks for skills here:

| Provider | User locations | Launch-directory locations |
| --- | --- | --- |
| Codex | `~/.agents/skills`, `~/.codex/skills` | `.agents/skills` |
| Claude | `~/.claude/skills` | `.claude/skills` |
| Grok | `~/.grok/skills`, `~/.agents/skills` | `.grok/skills`, `.agents/skills` |

- `CODEX_HOME`, `CLAUDE_CONFIG_DIR` and `GROK_HOME` replace the provider's home directory for discovery.
- Symlinked skill directories work. Agents can read each skill and its supporting files, not the rest of the directory it links into.
- File tools and sandboxed commands treat skills as read-only. Trusted commands can change them.
- Running a skill's script needs `permissions.commands`.
- A skill marked `disable-model-invocation: true` is used only when you ask for it.
- Discovery runs on launch, resume and `/reload`. `/config` lists each agent's skills and any warnings.

To turn skills off, set this in either file:

```yaml
skills:
  enabled: false
```

Native skill slash commands, hooks, shell snippets and skill-spawned agents stay disabled either way.

## Migrating an older config {#migrate}

Older user files listed fallback participants under `agents`. Rename that key to `defaultAgents`. The old key still works as an alias, and Chittr never rewrites your files. Having both keys in a user file is an error.

Project entries that relied on inheriting from your user file must now set `provider` and their other fields themselves. The legacy `instructions.mode` field is still accepted, but instructions no longer merge between files.
