## Requirements {#requirements}

Chittr is an early preview, built for macOS on Apple Silicon.

| Requirement | Details |
| --- | --- |
| Mac | Apple Silicon. Intel Macs, Linux and WSL2 are untested. |
| Node.js | 22.12.0 or newer. |
| Provider CLI | At least one of Codex, Claude Code or Grok Build, signed in with a subscription. API keys aren't supported. |

Gemini and Antigravity aren't supported in this preview.

This release was tested with:

| Component | Version |
| --- | --- |
| macOS | 26.2 |
| Node.js | 24.18.0, with npm 11.16.0 |
| Codex CLI | 0.159.0 |
| Claude Code | 2.1.284 |
| Grok Build | 1.0.34 |

Each provider used its default model. Other versions are untested.

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

## Your first room {#first-room}

```sh
cd ~/Projects/your-project
chittr
```

- The directory you launch from is the room's workspace. Agents work in that directory only. Launching from a subdirectory gives them just that subdirectory, and Chittr doesn't search upward for a Git root.
- The first launch runs setup in the terminal. It lists the provider CLIs it finds and asks which to enable, with nothing selected for you. Choose Codex, Claude or Grok, and leave Antigravity unselected if it appears. Setup also asks for your display name, then writes `~/.agents/chittr.yaml`.
- The new room can discuss and read files only. Edits, commands and network access start off. See [permissions](/guide/configuration/#permissions) to grant them.
- Chat turns use your normal subscription allowance.

Run `chittr doctor` after setup. It checks each configured provider CLI and the file-tool sandbox without using a chat turn. It doesn't prove that a model will answer, or that the provider's terms permit your use.

## Open the browser {#browser}

```sh
chittr --web
```

This starts a new chat, runs a local server and opens your browser. If the browser doesn't open, use the link printed in the terminal. The browser shares the terminal's workspace, config, permissions and saved chats. Keep the terminal process running while you use it. See the [browser interface](/guide/usage/#browser) for its controls.

## What leaves your Mac {#privacy}

The Chittr app has no hosted account, analytics or telemetry. It talks to the provider CLIs you installed.

- Providers receive the conversation, your instructions, any images you send, and any file, skill or tool content their agents read.
- An `@agent` message isn't private. Every agent in the room sees it.
- Turning off `network` doesn't stop provider sign-in or inference traffic. It only covers what agents fetch for tasks.
- Chittr doesn't control whether a provider keeps your content or trains on it. Check your account settings with [OpenAI](https://openai.com/policies/privacy-policy/), [Anthropic](https://www.anthropic.com/legal/privacy) and [xAI](https://x.ai/legal/privacy-policy).

On your Mac:

- Config lives in `~/.agents/chittr.yaml` and the launch directory's `.agents/chittr.yaml`.
- Chats live under `~/.agents/chittr/sessions/`, including attachments. Chittr doesn't encrypt them, and they don't expire.
- The browser link grants access to the running room. Keep it private.
- Codex and Claude may keep their own session records outside Chittr's storage.

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

## Upgrade and back up {#upgrade}

To upgrade:

1. Quit every Chittr process.
2. Back up your config and chats, as below.
3. Note your current version with `chittr --version`.
4. Install the new version with `npm install -g @chittr/cli@VERSION`.
5. Reopen from the same directory and check your messages, drafts and attachments.

If a release fails, quit Chittr and install the version that last worked, for example `npm install -g @chittr/cli@0.1.0`. An older version may reject chats saved by a newer one. Restore a backup from that version into a separate directory and open it there, rather than downgrading against your only copy.

### Back up

Quit every Chittr process first. A workspace directory that still contains `room.lock` is in use. Don't delete the lock.

```sh
mkdir -m 700 /absolute/private/chittr-backup
cp -Rp "$HOME/.agents/chittr/sessions" /absolute/private/chittr-backup/sessions
cp -p "$HOME/.agents/chittr.yaml" /absolute/private/chittr-backup/user.yaml
cp -p /absolute/workspace/.agents/chittr.yaml /absolute/private/chittr-backup/project.yaml
```

Copy only the config files that exist, and back up any instruction files they reference. If you use `--state-dir`, copy that directory instead of `sessions`. Backups contain conversation text and attachments, so keep them private and outside the workspace. Unsent requests in an open browser tab aren't saved to disk, so resolve them before you quit.

### Restore

Restore into a new directory and keep the original:

```sh
cp -Rp /absolute/private/chittr-backup/sessions /absolute/private/chittr-restored
cd /absolute/path/to/the/original/workspace
chittr resume ID --state-dir /absolute/private/chittr-restored
```

Check the restored chat before you rely on it.

### Uninstall

```sh
npm uninstall -g @chittr/cli
```

Uninstalling leaves your config and chats in place. To remove them, quit Chittr and delete the files listed under [what leaves your Mac](#privacy), along with any backups.
