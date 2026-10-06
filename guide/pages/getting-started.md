## Requirements {#requirements}

Chittr is an early preview for macOS.

| Requirement | Details |
| --- | --- |
| Operating system | macOS. Linux and WSL2 are untested. |
| Node.js | 22.12.0 or newer. |
| Provider CLI | At least one of Codex, Claude Code or Grok Build, signed in with a subscription. API keys aren't supported. |

Gemini and Antigravity aren't supported in this preview.

## Install {#install}

Install at least one provider CLI and sign in with your subscription. Chittr doesn't bundle provider CLIs or ask for their credentials.

| Provider | Executable | Install and sign in |
| --- | --- | --- |
| Codex | `codex` | Install the [Codex CLI](https://developers.openai.com/codex/cli/), then run `codex login` with ChatGPT. |
| Claude Code | `claude` | Install [Claude Code](https://code.claude.com/docs/en/overview), then run `claude auth login` with a Claude subscription. |
| Grok Build | `grok` | Install [Grok Build](https://docs.x.ai/build/overview) and sign in with your subscription. |

Then install Chittr:

```sh
npm install -g @chittr/cli
chittr --version
```

## Update {#update}

```sh
chittr update
```

Close any other Chittr rooms first. `chittr update` installs the latest release from npm. Then launch Chittr again. It doesn't change your config or chats, and it doesn't update provider CLIs.

Chittr 0.2.0 and earlier don't have `chittr update`. Update those once with `npm install -g @chittr/cli@latest`.

To uninstall, run `npm uninstall -g @chittr/cli`. Your config and chats stay in place.

## Your first room {#first-room}

```sh
cd ~/Projects/your-project
chittr
```

- The directory you launch from is the room's workspace. Agents work in that directory only. Launching from a subdirectory gives them just that subdirectory, and Chittr doesn't search upward for a Git root.
- The first launch runs setup in the terminal. It lists the supported CLIs it finds (Codex, Claude and Grok), all checked. Up and Down move, Space toggles and Enter confirms. Escape cancels without writing anything. Setup then asks for your display name and confirms before writing `~/.agents/chittr.yaml`.
- The new room can discuss and read files only. Edits, commands and network access start off. See [permissions](/guide/configuration/#permissions) to grant them.
- Chat turns use your normal subscription allowance.

Run `chittr doctor` after setup. It checks each configured provider CLI and the file-tool sandbox without using a chat turn. It doesn't prove that a model will answer, or that the provider's terms permit your use.

### In the browser

```sh
chittr --web
```

This starts a new chat and opens it in your browser. If the browser doesn't open, use the link printed in the terminal. Keep the terminal running while you use it. The browser shares the terminal's workspace, config, permissions and saved chats. See the [browser interface](/guide/usage/#browser) for its controls.

## What leaves your Mac {#privacy}

The Chittr app has no hosted account, analytics or telemetry. It talks to the provider CLIs you installed.

- Providers receive the conversation, your instructions, any images you send, and any file, skill or tool content their agents read.
- An `@agent` message isn't private. Every agent in the room sees it.
- Turning off `network` doesn't stop provider sign-in or inference traffic. It only covers what agents fetch for tasks.
- Chittr doesn't control whether a provider keeps your content or trains on it. Check your account settings with [OpenAI](https://openai.com/policies/privacy-policy/), [Anthropic](https://www.anthropic.com/legal/privacy) and [xAI](https://x.ai/legal/privacy-policy).

On your Mac:

- Config lives in `~/.agents/chittr.yaml` and the launch directory's `.agents/chittr.yaml`.
- Chats live under `~/.agents/chittr/sessions/`, including attachments. Chittr doesn't encrypt them, and they don't expire.
- Agent CLIs can keep their own session records outside Chittr's storage.

A project's `.agents/chittr.yaml` can grant permissions and add instructions, so read it before launching in an unfamiliar project. Instruction files and installed skills can steer agents too.

## Troubleshooting {#troubleshooting}

| Problem | Fix |
| --- | --- |
| `chittr: command not found` | Add `$(npm prefix -g)/bin` to your `PATH`. |
| npm reports a permissions error | Use a [user-writable npm installation](https://docs.npmjs.com/resolving-eacces-permissions-errors-when-installing-packages-globally). Don't run Chittr as root. |
| Setup doesn't start | First-time setup needs an interactive terminal. |
| A provider fails to connect | Follow the login or policy message it reports, then run `chittr doctor`. |
| A provider breaks after a CLI upgrade | Run `chittr doctor` and try an ordinary chat. Provider protocols change between versions. Codex needs CLI 0.153.0 or newer. |
| Web assets, a file worker or a policy hook is missing | The install is damaged. Reinstall the same version and run `chittr doctor`. |

Run `chittr --help` for every command and option, or see [usage](/guide/usage/).
