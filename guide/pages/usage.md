## Command line {#cli}

Run Chittr from the directory the agents should work in. That directory is the room's workspace. Chittr doesn't search upward for a Git root or a project config.

| Command | Description |
| --- | --- |
| `chittr` | Start a new chat in the terminal. Earlier chats are kept. |
| `chittr --web` | Start a new chat in the browser. |
| `chittr resume` | Pick a saved chat from this directory, newest first. |
| `chittr resume ID` | Open a saved chat directly. |
| `chittr doctor` | Check each configured provider's CLI handshake and the file-tool sandbox. Makes no model calls. Exits with status 1 if a check fails. |
| `chittr doctor --json` | Print the doctor report as JSON. |
| `chittr update` | Update this npm-global install to the latest release. Close other rooms first. It doesn't start a room. |
| `chittr --version` | Print the installed version. Short form: `-v`. |
| `chittr --help` | Print usage, keys and room commands. Short form: `-h`. |

Options for `chittr` and `chittr resume`:

| Option | Description |
| --- | --- |
| `--web` | Open the room in the browser. Works with `chittr` and `chittr resume`. |
| `--session ID` | Open saved chat `ID`. Same as `chittr resume ID`. |
| `--new` | Start a new chat. This is the default. Can't be combined with `resume` or `--session`. |
| `--state-dir PATH` | Keep chats under `PATH` instead of `~/.agents/chittr/sessions/`. |
| `--instructions-file PATH` | Give every agent in a new chat a [shared brief](#brief) from a file. Not with `resume` or `--session`. |
| `--trusted-commands` | Run agent commands as your user, without the sandbox, for this launch only. Requires `edits`, `commands` and `network` to be enabled. See [trusted commands](/guide/configuration/#trusted-commands). |

In the resume picker, Up and Down select, Enter opens and Escape cancels. Type to search by message preview or session ID. Page Up, Page Down, Home and End move through long lists.

## Shared brief {#brief}

A brief gives every agent in one conversation the same instructions, from a file.

```sh
chittr --instructions-file ./review-brief.md
chittr --new --web --instructions-file ./review-brief.md
```

- Chittr reads the file once and saves its text with the new chat. Editing or deleting the file later changes nothing.
- Resuming the chat or running `/reload` keeps its brief, and `/new` starts without one. `/config` shows where it came from. You can't change or clear a saved brief, so start a new chat to use a different one.
- The path is relative to the launch directory, absolute, or starts with `~/`. Quote paths with spaces.
- A file over 1 MiB, or one that can't be read, stops the launch before any agent starts.
- It can't be combined with `resume`, `--session` or `doctor`.
- The brief takes precedence over [room and agent instructions](/guide/configuration/#instructions) from config. It grants no permissions.

## Messages {#conversation}

A plain message goes to every enabled agent. Start it with one or more `@names` to send it to those agents only.

```text
What's the riskiest part of this migration?
@claude @codex Review src/store.ts for race conditions.
```

- Only leading `@names` route a message. An `@name` later in the text doesn't.
- Every agent sees every message, including messages addressed to others.
- Each addressed agent replies, or passes with a short reason. A pass doesn't prompt other agents.
- `@human` addresses only you.
- Messages have IDs such as `#m2`. Commands use them to point at a message.

| Command | Description |
| --- | --- |
| `/reply #m2 text` | Reply to message `#m2`. Goes to its author unless `text` starts with `@names`. A reply to your own message keeps its original recipients. |
| `/pin #m1` | Pin a message. Pins are saved with the conversation. |
| `/unpin #m1` | Remove a pin. |
| `/pins` | Show pinned messages with their IDs, authors and full text. |

Pinning sends nothing to agents and doesn't change their context.

Delivery lines show where each message is:

| Status | Meaning |
| --- | --- |
| `queued` | Waiting for the agent. |
| `sent` | Sent to the agent's provider. |
| `received` | The provider acknowledged it. This doesn't mean the model has read it. |
| `contributed` | The agent replied. |
| `passed` | The agent declined to reply and gave a reason. |
| `interrupted` | The turn was stopped before it finished. Use `/retry`. |
| `failed` | Delivery failed. Use `/retry`. |

## Questions from agents {#questions}

An agent can ask you a question. A decision question has two to six numbered choices. A free-text question has an input box. The question stays open until you submit an answer.

| Command | Description |
| --- | --- |
| `/questions` | List open questions with their choices and any advice. |
| `/choose #m2 1` | Answer question `#m2` with choice 1. |
| `/answer #m2 text` | Answer with your own text. Only the agent that asked receives it. |
| `/ask-room #m2` | Ask every enabled agent for one opinion. This doesn't answer the question. |

- Answers are literal. Slash commands and `@names` inside an answer aren't run or routed.
- Answering never changes permissions or releases a pause. If the asker or the room is paused, the answer waits in the queue.
- `/reply` discusses a question without answering it.
- You can answer before every opinion from `/ask-room` arrives. A new round starts only after the previous one finishes.

In the browser, pick a choice or **Use this answer** to fill an editable draft, or **Write a different answer** for your own text. Then **Send answer**. **Ask the room** does the same as `/ask-room`.

## Pause, stop and recover {#controls}

| Command | Description |
| --- | --- |
| `/pause [@agent]` | Let active turns finish, then hold new turns. |
| `/stop [@agent]` | Interrupt active turns and hold new turns. |
| `/continue [@agent]` | Release a pause and reconnect stopped agents. |
| `/continue #m1` | Give the exchange started by `#m1` another follow-up allowance. |
| `/retry #m1 @agent` | Queue a failed or interrupted response again. |
| `/reconnect @agent` | Reconnect an agent with its pending work paused. |

Without `@agent`, a command applies to the whole room. Room and agent pauses are separate, so `/continue @codex` doesn't release a room pause.

> Stop does not roll back file edits or command side effects. Work that already ran stays done.

To recover an agent after a failure:

1. `/reconnect @codex`
2. `/retry #m4 @codex` for each failed or interrupted message
3. `/continue @codex`, then `/continue` if the room is paused

Chittr never retries a response on its own.

### Follow-up turns

Each message you send starts an exchange with eight follow-up turns, shared by all the agents. Set `conversation.follow_up_turns` to change the number. The agents' first replies to you don't count. Passes and failed or interrupted attempts do. When the turns run out, that exchange stops and other work carries on. `/continue #m1` adds another allowance, but a plain `/continue` doesn't. A `/reply` from you starts a new allowance.

In the browser, the room buttons pause, stop, continue and quit. Each agent's `···` button opens its own controls. Failed deliveries have retry buttons, and an exchange that ran out of turns offers more.

## Saved conversations {#sessions}

Every chat is saved, and `chittr` always starts a new one.

| Command | Description |
| --- | --- |
| `chittr resume` | Pick a saved chat from this directory. |
| `chittr resume ID` | Open a saved chat. Add `--web` to open it in the browser. |
| `/sessions` | List saved chats for this workspace. Only while the room is idle. |
| `/sessions ID` | Switch to a saved chat. Only while the room is idle. |
| `/new` | Start a new chat. Only while the room is idle. |
| `/quit` | Stop, save and exit. |

- Resuming clears pauses, reconnects agents and runs queued messages. Failed and interrupted deliveries still need `/retry`.
- Saved chats belong to the exact launch directory. A subdirectory or another worktree of the same repository has its own list.
- Chats are stored under `~/.agents/chittr/sessions/<workspace-id>/<session-id>/`. Use `--state-dir PATH` to change the base directory.
- Only one Chittr process can use a workspace's storage at a time.
- An agent whose provider, model, effort or instructions changed starts a fresh provider session, with the saved conversation restored. Grok always starts fresh after a reconnect or restart.

## Context compaction {#compaction}

Compaction summarizes an agent's context so it can keep working in a long conversation. The full conversation stays saved.

| Command | Description |
| --- | --- |
| `/compact` | Compact every enabled, connected agent. |
| `/compact @agent` | Compact one agent. |
| `/compact [@agent] focus` | Tell the summary what to keep. Up to 4096 bytes. |
| `/compact -- focus` | Use `--` when the focus text starts with an `@name`. |
| `/checkpoint` | Show the latest checkpoint and the message IDs it covers. |

```text
/compact remember the epic and ticket details
/compact @claude retain the current objective and unresolved questions
/compact -- @claude raised a concern; retain its details
```

- Codex ignores focus text. Claude and Grok use it. Focus is a request, not a guarantee.
- An agent finishes its current turn before compacting. Other agents keep working.
- Compaction runs while paused and doesn't release the pause.
- `/compact codex` is rejected in case you forgot the `@`. `/compact -- codex` uses "codex" as the focus for every agent.
- If compaction fails, run `/reconnect @agent`. `/stop @agent` cancels a compaction in progress.

In the browser, **Compact all** and **Checkpoint** are in the toolbar, and **Compact context** sits beside each agent's context reading.

## Images {#images}

You can attach images in the browser or the terminal. Permissions, skills and command mode don't affect images, so they work in a default room.

| Limit | Value |
| --- | --- |
| Format | PNG |
| Per image | 3 MiB |
| Per message | 20 images, 6 MiB in total |

The browser converts any image it can decode to PNG and scales it to at most 2000 px on the long edge, or smaller to fit 3 MiB. The terminal sends files unchanged, so they must already be PNGs within the limits.

In the browser, paste, drop or select images with **Attach images**. **View image** opens a larger view.

In the terminal, press Ctrl+O to open the attachment input and run one of these:

| Command | Description |
| --- | --- |
| `/attach <path>` | Stage a PNG. The path is absolute or relative to the launch directory, and may contain spaces. |
| `/attach --clipboard` | Stage the PNG on the macOS clipboard. |
| `/attach --list` | List staged images with their IDs. |
| `/attach --remove <id>` | Remove a staged image. |
| `/attach --status` | Show whether each recipient can receive images, and why not. Sends nothing. |

Enter runs the action, and Escape returns to the message composer. Staged images are sent with your next message, and a caption is optional.

Which agents can receive images:

| Provider | Receives images |
| --- | --- |
| Codex | Yes, once its startup policy checks pass. Fresh and resumed threads both work. |
| Claude | Yes, from the first message. |
| Grok | Yes, once its runtime checks pass. Grok 1.0.13 only in a room with every permission and skills off. |
| Antigravity | No. |

An agent that can't receive images gets nothing from that message, not even the caption. The other recipients are unaffected, and the agent still gets text-only messages. Before you send, the composer warns about each recipient that can't receive the images, for example `@codex can't receive images`. The browser's **Details** and `/attach --status` show the reason.

## Status and settings {#status}

| Command | Description |
| --- | --- |
| `/participants` | Show each agent's provider, model, effort, image support, context usage, status and queue. |
| `/config` | Show the effective settings and the file each came from. |
| `/reload` | Re-read the config files and apply them. Only while all agents are idle. Invalid config is rejected and the running config stays. |
| `/help` | Show keys and room commands. |

- Context usage is the provider's latest reading in tokens, with a percentage when the provider reports a limit. It isn't cumulative spend.
- Config changes apply on launch, resume or `/reload`. Agents can't grant themselves permissions mid-chat, so edit the YAML and run `/reload`.
- `/reload` restarts the agents a change affects. They keep the saved conversation.

See [configuration](/guide/configuration/) for the settings themselves.

## Browser interface {#browser}

`chittr --web` starts a local server and opens your browser. The browser uses the same workspace, config and saved chats as the terminal, and every room command works in its composer. First-time setup still runs in the terminal.

- Keep the terminal process running. Closing or refreshing the tab leaves the agents running, and reopening the printed link reconnects.
- **Quit** stops and saves the room, like Ctrl+C in the terminal.
- The server listens only on `127.0.0.1`, and its link carries a per-launch access token. There's no hosted service.

| Control | Description |
| --- | --- |
| **Reply** | Quote a message above the composer. **Cancel reply** or Escape removes the quote and keeps your text. |
| **Pin** | Pin a message. **Pinned messages** lists pins with copy, unpin and go-to controls. |
| **Jump to latest** | Follow the conversation again after scrolling up. |
| **Check last action** | Recover the result of a send whose response was lost, without sending it twice. |
| `···` | Open that agent's own controls. |
| Theme picker | Switch between the system setting, light and dark, from the sidebar. A light or dark choice is remembered across launches. |

## Keyboard {#keyboard}

| Key | Action |
| --- | --- |
| Enter | Send. Accepts an open completion first. |
| Ctrl+J | Insert a new line. |
| Shift+Enter | Insert a new line in the browser. |
| Ctrl+Enter | Insert a new line in the browser, and in terminals that report it. |
| Tab, Shift+Tab | Complete `@names`, commands and file paths. |
| Up, Down | Recall sent messages. In a multiline draft, Up moves through its lines first. |
| Escape | Clear a selection, close suggestions or jump to the latest message. |
| Page Up, Page Down | Scroll the terminal history. |
| Mouse drag | Select terminal text. Releasing copies it. |
| Cmd+V, Ctrl+V | Paste. In the terminal, Ctrl+V reads the macOS clipboard directly. |
| Ctrl+O | Open the terminal attachment input. |
| Ctrl+C | In the terminal, copy the selection, or stop the room. Press again within 1.2 seconds to quit. |
| Ctrl+D | Stop, save and quit the terminal room. |

The terminal renders Markdown in messages. Copying a selection copies the rendered text, not the Markdown source.

### File paths

Type `./` in either composer to browse files from the launch directory. Type to filter, use Up and Down to choose, and press Enter or Tab to open a folder or insert a file. Left goes up a folder in the terminal, and Alt+Up does the same in the browser. Escape closes the file list.

The file's path is inserted in backticks. Its contents aren't. Files outside the launch directory and symlinks aren't listed.
